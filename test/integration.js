require('dotenv').config();
const assert = require('node:assert/strict');
const { pool } = require('../db');
const crypto = require('node:crypto');
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const users = [];
async function request(path, { cookie, json, ...options } = {}) {
  const response = await fetch(base + path, { ...options, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) }, ...(json ? { body: JSON.stringify(json) } : {}) });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
function profileForm(extra = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: 'Integration check', course: 'Test programme', year: 'Year 2', phone: '+975 17123456', notificationsEnabled: 'false', ...extra })) form.set(key, value);
  return form;
}
function itemForm(kind = 'found') {
  const form = new FormData();
  for (const [key, value] of Object.entries({ kind, title: 'Temporary integration check', category: 'Other', description: 'Automatically removed after verification.', location: 'Test location', itemDate: '2026-10-31' })) form.set(key, value);
  return form;
}
(async () => {
  try {
    assert.equal((await request('/health')).status, 200);
    const bad = await request('/api/auth/register', { method: 'POST', json: { studentId: '07240068', email: '07240069.sherubtse@rub.edu.bt' } });
    assert.equal(bad.status, 400);
    for (let i = 0; i < 2; i++) {
      const studentId = String(crypto.randomInt(10000000, 99999999));
      const password = crypto.randomBytes(20).toString('hex');
      const result = await request('/api/auth/register', { method: 'POST', json: { studentId, email: `${studentId}.sherubtse@rub.edu.bt`, name: 'Integration check', phone: '+975 17123456', course: 'Test programme', year: 'Year 2', password } });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      users.push({ ...result.data.user, cookie: result.cookie, password });
      assert.ok(result.cookie);
    }
    const [owner, other] = users;
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
    await pool.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
