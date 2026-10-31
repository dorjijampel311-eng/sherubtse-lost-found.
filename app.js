require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const helmet = require('helmet');
const { pool } = require('./db');
const { loadSessionUser } = require('./middleware/auth');
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
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

app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', require('./middleware/sameOrigin'));
app.use('/api', loadSessionUser);
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api', require('./routes/userRoutes'));
app.use('/api', require('./routes/itemRoutes'));
app.use('/api', require('./routes/feedbackRoutes'));
app.use(require('./routes/healthRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use(require('./routes/pageRoutes'));
app.use(express.static(path.join(__dirname, 'public'), { index: false, redirect: false }));
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use((req, res) => res.status(404).send('Page not found.'));
app.use(require('./middleware/errorHandler'));
module.exports = app;
