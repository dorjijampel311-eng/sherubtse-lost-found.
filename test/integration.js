require('dotenv').config();
const assert = require('node:assert/strict');
const { pool, initializeDatabase } = require('../db');
const userModel = require('../models/userModel');
const { once } = require('events');
const emailModule = require('../email');
const mailbox = [];
const foundEvents = [];
emailModule.emailConfigured = () => true;
emailModule.sendAuthCode = async mail => { mailbox.push(mail); return { status: 'accepted' }; };
emailModule.notifyLostItem = async () => ({ status: 'unconfigured', message: 'Mocked sender; no real mail.' });
emailModule.notifyFoundItem = async item => { foundEvents.push(item); return { status: 'unconfigured', message: 'Mocked sender; no real mail.' }; };
const { app } = require('../server');
const crypto = require('node:crypto');
let base, server;
const users = [];
async function request(path, { cookie, json, ...options } = {}) {
  const response = await fetch(base + path, { ...options, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) }, ...(json ? { body: JSON.stringify(json) } : {}) });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
function profileForm(extra = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: 'Integration check', course: 'Chemistry', year: 'Year 2', phone: '+975 17123456', notificationsEnabled: 'false', ...extra })) form.set(key, value);
  return form;
}
function itemForm(kind = 'found') {
  const form = new FormData();
  for (const [key, value] of Object.entries({ kind, title: 'Temporary integration check', category: 'Other', description: 'Automatically removed after verification.', location: 'Test location', itemDate: '2026-10-31' })) form.set(key, value);
  return form;
}
(async () => {
  try {
    await initializeDatabase();
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await request('/health')).status, 200);
    for (const page of ['/', '/login', '/signup', '/verify', '/reset-password', '/profile', '/browse', '/about', '/my-items', '/report-lost', '/report-found']) {
      const response = await fetch(base + page); assert.equal(response.status, 200, page);
      const html = await response.text(); assert.ok(!/href=["'][^"']*\.html/.test(html), page + ' contains an old HTML link');
    }
    const old = await fetch(base + '/reset-password.html?from=email', { redirect: 'manual' });
    assert.equal(old.status, 308); assert.equal(old.headers.get('location'), '/reset-password?from=email');
    const oldHome = await fetch(base + '/index.html', { redirect: 'manual' }); assert.equal(oldHome.headers.get('location'), '/');
    assert.equal((await fetch(base + '/views/admin.html')).status, 404);
    assert.equal((await fetch(base + '/views/admin.ejs')).status, 404);
    assert.equal((await fetch(base + '/admin.ejs')).status, 404);
    const adminRedirect = await fetch(base + '/admin', { redirect: 'manual' });
    assert.equal(adminRedirect.status, 302); assert.equal(adminRedirect.headers.get('location'), '/login?next=admin');
    for (const endpoint of ['overview', 'listings', 'feedback']) assert.equal((await request('/api/admin/' + endpoint)).status, 401);
    const bad = await request('/api/auth/register', { method: 'POST', json: { studentId: '07240068', email: '07240069.sherubtse@rub.edu.bt' } });
    assert.equal(bad.status, 400);
    for (let i = 0; i < 2; i++) {
      const studentId = String(crypto.randomInt(10000000, 99999999));
      const password = 'A1!' + crypto.randomBytes(20).toString('hex');
      const result = await request('/api/auth/register', { method: 'POST', json: { studentId, email: `${studentId}.sherubtse@rub.edu.bt`, name: 'Integration check', phone: '+975 17123456', course: 'Chemistry', year: 'Year 2', password, role: 'admin' } });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      const email = `${studentId}.sherubtse@rub.edu.bt`;
      const userId = (await pool.query('SELECT id FROM portal_users WHERE email=$1', [email])).rows[0].id;
      const fixture = { id: userId, email, password }; users.push(fixture);
      assert.equal((await request('/api/auth/verify-email', { method: 'POST', json: { email, code: mailbox.at(-1).code } })).status, 200);
      const login = await request('/api/auth/login', { method: 'POST', json: { email, password } });
      assert.equal(login.status, 200); fixture.cookie = login.cookie;
      assert.ok(fixture.cookie);
    }
    const [owner, other] = users;
    // Check recipient policy against PostgreSQL, without sending any email.
    await pool.query('UPDATE portal_users SET notifications_enabled=TRUE WHERE id=$1', [other.id]);
    let eligible = (await userModel.notificationRecipients(owner.id)).rows;
    assert.ok(eligible.some(user => user.id === other.id));
    assert.equal(eligible.find(user => user.id === other.id).email, other.email);
    assert.ok(!eligible.some(user => user.id === owner.id));
    await pool.query('UPDATE portal_users SET email_verified=FALSE WHERE id=$1', [other.id]);
    eligible = (await userModel.notificationRecipients(owner.id)).rows;
    assert.ok(!eligible.some(user => user.id === other.id));
    await pool.query('UPDATE portal_users SET email_verified=TRUE,notifications_enabled=FALSE WHERE id=$1', [other.id]);
    eligible = (await userModel.notificationRecipients(owner.id)).rows;
    assert.ok(!eligible.some(user => user.id === other.id));
    console.log('PASS: recipients use registered email addresses and exclude unverified, opted-out and posting accounts.');

    const ordinary = await request('/api/auth/me', { cookie: owner.cookie }); assert.equal(ordinary.data.user.role, 'user');
    for (const endpoint of ['overview', 'listings', 'feedback']) assert.equal((await request('/api/admin/' + endpoint, { cookie: owner.cookie })).status, 403);
    assert.equal((await fetch(base + '/admin', { headers: { Cookie: owner.cookie } })).status, 403);
    assert.equal((await request('/api/profile', { method: 'PUT', cookie: owner.cookie, body: profileForm({ role: 'admin' }) })).status, 400);

    assert.equal((await request('/api/feedback', { method: 'POST', json: { rating: 4, message: 'Helpful campus board.' } })).status, 401);
    assert.equal((await request('/api/feedback', { method: 'POST', cookie: owner.cookie, json: { rating: 6, message: 'Helpful campus board.' } })).status, 400);
    assert.equal((await request('/api/feedback', { method: 'POST', cookie: owner.cookie, json: { rating: 4, message: 'Short' } })).status, 400);
    assert.equal((await request('/api/feedback', { method: 'POST', cookie: owner.cookie, json: { rating: 4, message: 'Helpful campus board.', userId: other.id } })).status, 201);
    const feedback = await pool.query('SELECT user_id,rating,message FROM portal_feedback WHERE user_id=$1', [owner.id]);
    assert.equal(feedback.rows.length, 1);
    assert.equal(feedback.rows[0].user_id, owner.id);
    assert.equal(feedback.rows[0].rating, 4);
    assert.equal(feedback.rows[0].message, 'Helpful campus board.');
    console.log('PASS: feedback authentication, validation, persistence and session-based ownership.');
    // Grant and revoke a role only for this disposable test fixture, never for real accounts.
    await pool.query("UPDATE portal_users SET role='admin' WHERE id=$1", [owner.id]);
    assert.equal((await fetch(base + '/admin', { headers: { Cookie: owner.cookie } })).status, 200);
    assert.equal((await request('/api/admin/overview', { cookie: owner.cookie })).status, 200);
    const review = await request('/api/admin/feedback', { cookie: owner.cookie });
    assert.equal(review.status, 200); assert.ok(review.data.feedback.some(entry => entry.message === 'Helpful campus board.'));
    assert.equal((await request('/api/admin/listings', { cookie: owner.cookie })).status, 200);
    await pool.query("UPDATE portal_users SET role='user' WHERE id=$1", [owner.id]);
    assert.equal((await request('/api/admin/feedback', { cookie: owner.cookie })).status, 403);
    console.log('PASS: clean page URLs, old email redirects, protected admin pages/APIs, role escalation rejection, live role revocation and private feedback review.');

    const login = await request('/api/auth/login', { method: 'POST', json: { email: owner.email, password: owner.password } });
    assert.equal(login.status, 200);
    await request('/api/auth/logout', { method: 'POST', cookie: login.cookie });
    const db = await pool.query('SELECT password_hash FROM portal_users WHERE id=$1', [owner.id]);
    assert.match(db.rows[0].password_hash, /^\$2/);
    assert.equal((await request('/api/profile', { method: 'PUT', cookie: owner.cookie, body: profileForm({ email: 'changed@example.test' }) })).status, 400);
    assert.equal((await request('/api/profile', { method: 'PUT', cookie: owner.cookie, body: profileForm({ year: 'Staff' }) })).status, 400);
    assert.equal((await request('/api/profile', { method: 'PUT', cookie: owner.cookie, body: profileForm() })).status, 200);
    assert.equal((await request('/api/profile', { method: 'PUT', body: profileForm() })).status, 401);
    const invalid = itemForm(); invalid.set('photo', new Blob(['invalid'], { type: 'image/png' }), 'invalid.png');
    assert.equal((await request('/api/items', { method: 'POST', cookie: owner.cookie, body: invalid })).status, 400);
    const oversized = itemForm(); oversized.set('photo', new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
    assert.equal((await request('/api/items', { method: 'POST', cookie: owner.cookie, body: oversized })).status, 413);
    const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=', 'base64');
    const profilePhoto = profileForm(); profilePhoto.set('photo', new Blob([photo], { type: 'image/png' }), 'avatar.png');
    assert.equal((await request('/api/profile', { method: 'PUT', cookie: owner.cookie, body: profilePhoto })).data.user.hasPhoto, true);
    assert.equal((await fetch(base + '/api/profile/photo', { headers: { Cookie: owner.cookie } })).status, 200);
    const valid = itemForm(); valid.set('photo', new Blob([photo], { type: 'image/png' }), 'pixel.png');
    const created = await request('/api/items', { method: 'POST', cookie: owner.cookie, body: valid });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const id = created.data.id;
    assert.equal(foundEvents.length, 1);
    assert.equal(foundEvents[0].id, id);
    assert.equal(foundEvents[0].posterId, owner.id);
    assert.equal(foundEvents[0].title, 'Temporary integration check');
    assert.equal(foundEvents[0].category, 'Other');
    assert.equal(foundEvents[0].description, 'Automatically removed after verification.');
    assert.equal(foundEvents[0].location, 'Test location');
    assert.equal(foundEvents[0].itemDate, '2026-10-31');
    assert.ok(foundEvents[0].photoData.equals(photo));
    assert.equal(foundEvents[0].photoMime, 'image/png');
    assert.equal(foundEvents[0].code, undefined);
    assert.equal(foundEvents[0].phone, undefined);
    console.log('PASS: found-item posting calls its separate notifier with saved item details and uploaded photo.');
    const anonymous = await request(`/api/items?id=${id}`);
    assert.equal(anonymous.data.items[0].phone, null); assert.equal(anonymous.data.items[0].email, null);
    const signed = await request(`/api/items?id=${id}`, { cookie: other.cookie });
    assert.equal(signed.data.items[0].email, owner.email);
    assert.equal((await fetch(base + `/api/items/${id}/photo`)).status, 200);
    assert.equal((await request(`/api/items/${id}`, { method: 'PATCH', cookie: other.cookie, json: { status: 'returned' } })).status, 404);
    assert.equal((await request(`/api/items/${id}`, { method: 'DELETE', cookie: other.cookie })).status, 404);
    assert.equal((await request(`/api/items/${id}`, { method: 'PATCH', cookie: owner.cookie, json: { status: 'returned' } })).status, 200);
    assert.equal((await request('/api/items', { cookie: owner.cookie })).data.items.some(item => item.id === id), false);
    assert.equal((await request('/api/items?mine=1', { cookie: owner.cookie })).data.items.some(item => item.id === id), true);
    assert.equal((await request(`/api/items/${id}`, { method: 'DELETE', cookie: owner.cookie })).status, 204);
    // Avoid sending any actual notifications from verification.
    if (!process.env.SMTP_HOST) {
      const lost = await request('/api/items', { method: 'POST', cookie: owner.cookie, body: itemForm('lost') });
      assert.equal(lost.status, 201); assert.equal(lost.data.notification.status, 'unconfigured');
    }
    console.log('PASS: PostgreSQL registration, hashed passwords, immutable identity, profile validation, sessions, listing/photo persistence, upload rejection, private contact details, ownership, returned/deleted posts, and unconfigured-email save path.');
  } finally {
    for (const user of users) {
      await request('/api/auth/logout', { method: 'POST', cookie: user.cookie });
      await pool.query('DELETE FROM portal_users WHERE id=$1', [user.id]);
    }
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
