require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');
const { pool, initializeDatabase } = require('./db');
const { notifyLostItem } = require('./email');
const { validStudent, validProfile } = require('./validation');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PgSession = connectPgSimple(session);
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'img-src': ["'self'", 'data:'], 'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], 'font-src': ["'self'", 'https://fonts.gstatic.com'] } } }));
app.use(express.json({ limit: '32kb' }));
app.use(session({
  store: new PgSession({ pool, tableName: 'portal_sessions', createTableIfMissing: true, pruneSessionInterval: 15 * 60 }),
  name: 'sherubtse_lf.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 }
}));

app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !req.get('origin')) return next();
  let origin;
  try { origin = new URL(req.get('origin')); } catch { return res.status(403).json({ error: 'Cross-site requests are not allowed.' }); }
  if (origin.host !== req.get('host') || !['http:', 'https:'].includes(origin.protocol)) return res.status(403).json({ error: 'Cross-site requests are not allowed.' });
  next();
});

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const registerLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false });
const createReportLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 10, fieldSize: 1200, parts: 12 } });
const categories = new Set(['Electronics', 'ID cards & wallets', 'Bags', 'Books & notes', 'Keys', 'Clothing', 'Sports equipment', 'Other']);

function currentUser(req) { return req.session.user || null; }
function requireUser(req, res, next) {
  if (!currentUser(req) || !validStudent(currentUser(req).studentId, currentUser(req).email)) return res.status(401).json({ error: 'Sign in with a valid Sherubtse student account to continue.' });
  next();
}
function clean(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function photoMatches(file) {
  if (!file) return true;
  if (file.mimetype === 'image/jpeg') return file.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (file.mimetype === 'image/png') return file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === 'image/webp') return file.buffer.subarray(0, 4).toString() === 'RIFF' && file.buffer.subarray(8, 12).toString() === 'WEBP';
  return false;
}
function publicUser(user) {
  return { id: user.id, name: user.name, studentId: user.student_id, email: user.email, phone: user.phone, course: user.course, year: user.study_year, notificationsEnabled: user.notifications_enabled, hasPhoto: Boolean(user.has_photo) };
}
function establishSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(error => {
      if (error) return reject(error);
      req.session.user = user;
      req.session.save(saveError => saveError ? reject(saveError) : resolve());
    });
  });
}

app.post('/api/auth/register', registerLimit, async (req, res, next) => {
  try {
    const name = clean(req.body?.name, 100);
    const studentId = clean(req.body?.studentId, 40);
    const email = clean(req.body?.email, 254).toLowerCase();
    const phone = clean(req.body?.phone, 30);
    const course = clean(req.body?.course, 100);
    const year = clean(req.body?.year, 20);
    const password = req.body?.password;
    if (!validStudent(studentId, email) || !validProfile({ name, phone, course, year })) {
      return res.status(400).json({ error: 'Use an 8-digit student number and its matching number.sherubtse@rub.edu.bt email, and complete all profile details.' });
    }
    if (typeof password !== 'string' || password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: 'Password must be at least 10 characters and at most 72 UTF-8 bytes.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO portal_users (name, student_id, email, phone, course, study_year, password_hash, notifications_enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *, (photo_data IS NOT NULL) AS has_photo`,
      [name, studentId, email, phone, course, year, passwordHash, req.body.notificationsEnabled === true]
    );
    await establishSession(req, publicUser(result.rows[0]));
    res.status(201).json({ user: req.session.user });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account already uses that email or student ID. Try logging in.' });
    next(error);
  }
});

app.post('/api/auth/login', loginLimit, async (req, res, next) => {
  try {
    const email = clean(req.body?.email, 254).toLowerCase();
    const password = req.body?.password;
    if (!email || typeof password !== 'string') return res.status(400).json({ error: 'Enter your email and password.' });
    const result = await pool.query('SELECT *, (photo_data IS NOT NULL) AS has_photo FROM portal_users WHERE email=$1', [email]);
    if (!result.rows[0] || !validStudent(result.rows[0].student_id, result.rows[0].email) || !(await bcrypt.compare(password, result.rows[0].password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    await establishSession(req, publicUser(result.rows[0]));
    res.json({ user: req.session.user });
  } catch (error) { next(error); }
});

app.get('/api/auth/me', async (req, res, next) => {
  try {
    if (!currentUser(req)) return res.json({ user: null });
    const result = await pool.query('SELECT *, (photo_data IS NOT NULL) AS has_photo FROM portal_users WHERE id=$1', [currentUser(req).id]);
    req.session.user = result.rows[0] ? publicUser(result.rows[0]) : null;
    res.json({ user: currentUser(req) });
  } catch (error) { next(error); }
});
app.put('/api/profile', requireUser, upload.single('photo'), async (req, res, next) => {
  try {
    if ('studentId' in req.body || 'email' in req.body) return res.status(400).json({ error: 'Student number and college email cannot be changed.' });
    const { name, phone, course, year } = req.body;
    if (!validProfile({ name, phone, course, year }) || !['true', 'false'].includes(req.body.notificationsEnabled)) return res.status(400).json({ error: 'Check your name, programme, year and phone number.' });
    if (!photoMatches(req.file)) return res.status(400).json({ error: 'Photo must be a valid JPG, PNG, or WebP image.' });
    const result = await pool.query(`UPDATE portal_users SET name=$1,phone=$2,course=$3,study_year=$4,notifications_enabled=$5,
      photo_mime=CASE WHEN $6::boolean THEN $7 ELSE photo_mime END,photo_data=CASE WHEN $6::boolean THEN $8 ELSE photo_data END
      WHERE id=$9 RETURNING *, (photo_data IS NOT NULL) AS has_photo`,
      [name.trim(), phone.trim(), course.trim(), year, req.body.notificationsEnabled === 'true', Boolean(req.file), req.file?.mimetype || null, req.file?.buffer || null, currentUser(req).id]);
    req.session.user = publicUser(result.rows[0]);
    res.json({ user: currentUser(req) });
  } catch (error) { next(error); }
});
app.get('/api/profile/photo', requireUser, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT photo_mime,photo_data FROM portal_users WHERE id=$1', [currentUser(req).id]);
    if (!result.rows[0]?.photo_data) return res.status(404).end();
    res.set({ 'Content-Type': result.rows[0].photo_mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.send(result.rows[0].photo_data);
  } catch (error) { next(error); }
});
app.post('/api/auth/logout', (req, res, next) => req.session.destroy(error => {
  if (error) return next(error);
  res.clearCookie('sherubtse_lf.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ ok: true });
}));

const itemColumns = `i.id, i.kind, i.title, i.category, i.description, i.location,
  i.item_date AS "itemDate", i.status, i.phone_public AS "phonePublic",
  (i.photo_data IS NOT NULL) AS "hasPhoto", i.created_at AS "createdAt",
  u.id AS "ownerId", u.name, u.course,
  CASE WHEN $1::bigint IS NOT NULL THEN u.email ELSE NULL END AS email,
  CASE WHEN i.phone_public OR i.user_id = $1 THEN u.phone ELSE NULL END AS phone`;

app.get('/api/items', async (req, res, next) => {
  try {
    const mine = req.query.mine === '1';
    if (mine && !currentUser(req)) return res.status(401).json({ error: 'Log in to see your posts.' });
    const sql = `SELECT ${itemColumns} FROM item_reports i JOIN portal_users u ON u.id=i.user_id ${mine ? 'WHERE i.user_id=$1' : (req.query.id && /^\d+$/.test(req.query.id) ? 'WHERE i.id=$2' : "WHERE i.status='open'")} ORDER BY i.created_at DESC LIMIT 100`;
    const result = await pool.query(sql, [currentUser(req)?.id || null, ...(!mine && req.query.id && /^\d+$/.test(req.query.id) ? [req.query.id] : [])]);
    res.json({ items: result.rows });
  } catch (error) { next(error); }
});

app.get('/api/items/:id/photo', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).end();
    const result = await pool.query('SELECT photo_mime,photo_data FROM item_reports WHERE id=$1 AND photo_data IS NOT NULL', [req.params.id]);
    if (!result.rows[0]) return res.status(404).end();
    res.set({ 'Content-Type': result.rows[0].photo_mime, 'Content-Length': result.rows[0].photo_data.length, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    res.send(result.rows[0].photo_data);
  } catch (error) { next(error); }
});

app.post('/api/items', requireUser, createReportLimit, upload.single('photo'), async (req, res, next) => {
  try {
    const kind = req.body?.kind;
    const title = clean(req.body?.title, 120);
    const category = clean(req.body?.category, 40);
    const description = clean(req.body?.description, 1000);
    const location = clean(req.body?.location, 120);
    const itemDate = req.body?.itemDate;
    if (!['lost', 'found'].includes(kind) || !title || !description || !categories.has(category) || !location || !validDate(itemDate)) {
      return res.status(400).json({ error: 'Check the item name, category, location, and date.' });
    }
    if (req.file && !photoMatches(req.file)) return res.status(400).json({ error: 'Photo must be a valid JPG, PNG, or WebP image.' });
    const phonePublic = req.body?.phonePublic === 'on';
    const photoMime = req.file?.mimetype || null;
    const photoData = req.file?.buffer || null;
    const result = await pool.query(
      `INSERT INTO item_reports (user_id,kind,title,category,description,location,item_date,phone_public,photo_mime,photo_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [currentUser(req).id, kind, title, category, description, location, itemDate, phonePublic, photoMime, photoData]
    );
    const notification = kind === 'lost' ? await notifyLostItem({ id: result.rows[0].id, title, category, location, itemDate }) : null;
    res.status(201).json({ id: result.rows[0].id, notification });
  } catch (error) { next(error); }
});

app.patch('/api/items/:id', requireUser, async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id) || req.body?.status !== 'returned') return res.status(400).json({ error: 'Invalid listing update.' });
    const result = await pool.query("UPDATE item_reports SET status='returned' WHERE id=$1 AND user_id=$2 RETURNING id", [req.params.id, currentUser(req).id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Your listing could not be found.' });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.delete('/api/items/:id', requireUser, async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Listing not found.' });
    const result = await pool.query('DELETE FROM item_reports WHERE id=$1 AND user_id=$2 RETURNING id', [req.params.id, currentUser(req).id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Your listing could not be found.' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/stats', async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT
      COUNT(*) FILTER (WHERE kind='lost' AND status='open')::int AS lost,
      COUNT(*) FILTER (WHERE kind='found' AND status='open')::int AS found,
      COUNT(*) FILTER (WHERE status='returned')::int AS returned FROM item_reports`);
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'connected' }); }
  catch { res.status(503).json({ ok: false, database: 'unavailable' }); }
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Photo must be 2 MB or smaller.' : 'The photo upload is invalid.' });
  console.error('Request failed:', error.message);
  res.status(500).json({ error: 'The server could not complete that request. Please try again.' });
});

async function start() {
  if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error('Set SESSION_SECRET to a random value with at least 32 characters.');
  await initializeDatabase();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sherubtse Lost & Found is ready: http://localhost:${PORT}`);
    console.log('Open the URL in your browser. Keep this terminal running; press Ctrl+C to stop.');
  });
}
start().catch(error => { console.error('Unable to start the app:', error.message); process.exit(1); });
