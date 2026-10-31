// Development database only. All outbound email is mocked before the server is loaded.
require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { once } = require('events');
const { pool, initializeDatabase } = require('../db');
const emailModule = require('../email');
const mailbox = [];
let configured = true, delivery = 'accepted';
emailModule.emailConfigured = () => configured;
emailModule.sendAuthCode = async mail => { mailbox.push(mail); return { status: delivery }; };
emailModule.notifyLostItem = async () => ({ status: 'unconfigured', message: 'Test sender: no real mail sent.' });
emailModule.notifyFoundItem = emailModule.notifyLostItem;
const { app } = require('../server');
let server, base;
const ids = [];
async function call(path, data, cookie) {
  const response = await fetch(base + path, { method: data ? 'POST' : 'GET', headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
(async () => {
  try {
    await initializeDatabase();
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
    const studentId = String(crypto.randomInt(10000000, 99999999));
    const email = `${studentId}.sherubtse@rub.edu.bt`;
    const password = 'Campus2026!';
    const input = { studentId, email, password, name: 'Temporary auth test', course: 'Chemistry', year: 'Year 2', phone: '+975 17123456' };
    assert.equal((await call('/api/auth/register', { ...input, email: 'other@example.test' })).status, 400);
    const created = await call('/api/auth/register', input);
    assert.equal(created.status, 201); assert.equal(created.data.verificationRequired, true); assert.equal(created.data.user, undefined);
    let user = (await pool.query('SELECT * FROM portal_users WHERE email=$1', [email])).rows[0]; ids.push(user.id);
    assert.equal(user.email_verified, false);
    assert.equal((await call('/api/auth/me', null, created.cookie)).data.user, null);
    assert.equal((await call('/api/auth/login', { email, password })).status, 403);
    const verification = mailbox.at(-1).code;
    assert.ok(!JSON.stringify(created.data).includes(verification));
    const record = (await pool.query("SELECT *, expires_at - sent_at AS ttl FROM portal_auth_codes WHERE user_id=$1 AND purpose='verify'", [user.id])).rows[0];
    assert.notEqual(record.code_hash, verification); assert.equal(record.ttl.minutes, 10);
    assert.equal((await call('/api/auth/resend-verification', { email })).status, 429);
    await pool.query("UPDATE portal_auth_codes SET expires_at=NOW()-INTERVAL '1 second' WHERE user_id=$1", [user.id]);
    assert.equal((await call('/api/auth/verify-email', { email, code: verification })).status, 400);
    await pool.query("UPDATE portal_auth_codes SET expires_at=NOW()+INTERVAL '10 minutes' WHERE user_id=$1", [user.id]);
    const verified = await Promise.all([call('/api/auth/verify-email', { email, code: verification }), call('/api/auth/verify-email', { email, code: verification })]);
    assert.deepEqual(verified.map(r => r.status).sort(), [200, 400]);
    const login = await call('/api/auth/login', { email, password }); assert.equal(login.status, 200);
    const cookie = login.cookie;
    assert.equal((await call('/api/auth/me', null, cookie)).data.user.emailVerified, true);
    const known = await call('/api/auth/forgot-password', { email });
    const reset = mailbox.at(-1).code;
    const unknownEmail = `${String(crypto.randomInt(10000000, 99999999))}.sherubtse@rub.edu.bt`;
    const unknown = await call('/api/auth/forgot-password', { email: unknownEmail });
    assert.equal(known.status, unknown.status); assert.deepEqual(known.data, unknown.data);
    assert.ok(!JSON.stringify(known.data).includes(reset));
    await pool.query("UPDATE portal_auth_codes SET expires_at=NOW()-INTERVAL '1 second' WHERE user_id=$1 AND purpose='reset'", [user.id]);
    assert.equal((await call('/api/auth/reset-password', { email, code: reset, password: 'NewCampus2026!' })).status, 400);
    await pool.query("UPDATE portal_auth_codes SET expires_at=NOW()+INTERVAL '30 minutes' WHERE user_id=$1 AND purpose='reset'", [user.id]);
    assert.equal((await call('/api/auth/reset-password', { email, code: reset, password: 'weak' })).status, 400);
    assert.equal((await call('/api/auth/reset-password', { email, code: reset, password: 'NewCampus2026!' })).status, 200);
    assert.equal((await call('/api/auth/reset-password', { email, code: reset, password: 'OtherCampus2026!' })).status, 400);
    assert.equal((await call('/api/auth/me', null, cookie)).data.user, null);
    assert.equal((await call('/api/auth/login', { email, password })).status, 401);
    const fresh = await call('/api/auth/login', { email, password: 'NewCampus2026!' }); assert.equal(fresh.status, 200);
    await call('/api/auth/logout', {}, fresh.cookie);
    configured = false;
    const missingKnown = await call('/api/auth/forgot-password', { email });
    const missingUnknown = await call('/api/auth/forgot-password', { email: unknownEmail });
    assert.equal(missingKnown.status, 503); assert.deepEqual(missingKnown.data, missingUnknown.data);
    configured = true; delivery = 'failed';
    await pool.query("UPDATE portal_auth_codes SET sent_at=NOW()-INTERVAL '61 seconds' WHERE user_id=$1 AND purpose='reset'", [user.id]);
    const failedKnown = await call('/api/auth/forgot-password', { email });
    const failedUnknown = await call('/api/auth/forgot-password', { email: unknownEmail });
    assert.deepEqual(failedKnown.data, failedUnknown.data); assert.equal(failedKnown.status, failedUnknown.status);
    assert.ok((await pool.query("SELECT used_at FROM portal_auth_codes WHERE user_id=$1 AND purpose='reset'", [user.id])).rows[0].used_at);
    // Delivery failure leaves a recoverable, unverified account and an unusable code.
    const secondId = String(crypto.randomInt(10000000, 99999999));
    const secondEmail = `${secondId}.sherubtse@rub.edu.bt`;
    const failedRegistration = await call('/api/auth/register', { ...input, studentId: secondId, email: secondEmail });
    const secondUser = (await pool.query('SELECT id FROM portal_users WHERE email=$1', [secondEmail])).rows[0]; ids.push(secondUser.id);
    assert.equal(failedRegistration.status, 201); assert.equal(failedRegistration.data.delivery, 'failed');
    assert.ok((await pool.query("SELECT used_at FROM portal_auth_codes WHERE user_id=$1 AND purpose='verify'", [secondUser.id])).rows[0].used_at);
    configured = false;
    assert.equal((await call('/api/auth/resend-verification', { email: secondEmail })).status, 503);
    configured = true; delivery = 'accepted';
    await pool.query("UPDATE portal_auth_codes SET sent_at=NOW()-INTERVAL '61 seconds' WHERE user_id=$1", [secondUser.id]);
    assert.equal((await call('/api/auth/resend-verification', { email: secondEmail })).status, 200);
    const secondCode = mailbox.at(-1).code;
    const wrong = secondCode === '00000000' ? '11111111' : '00000000';
    for (let i = 0; i < 5; i++) assert.equal((await call('/api/auth/verify-email', { email: secondEmail, code: wrong })).status, 400);
    assert.equal((await call('/api/auth/verify-email', { email: secondEmail, code: secondCode })).status, 400);
    await pool.query("UPDATE portal_auth_codes SET sent_at=NOW()-INTERVAL '61 seconds' WHERE user_id=$1", [secondUser.id]);
    assert.equal((await call('/api/auth/resend-verification', { email: secondEmail })).status, 200);
    assert.equal((await call('/api/auth/verify-email', { email: secondEmail, code: mailbox.at(-1).code })).status, 200);
    // Per-IP attempt limits are independent from whether an account exists.
    let limited;
    for (let i = 0; i < 22; i++) limited = await call('/api/auth/verify-email', { email: unknownEmail, code: '00000000' });
    assert.equal(limited.status, 429);
    console.log('PASS: real PostgreSQL migration, unverified registration/access, email expiry, concurrent single-use verification, reset expiry and reuse rejection, password policy, session revocation, neutral responses, missing/failed email and attempt limits. All email mocked.');
  } finally {
    for (const id of ids) {
      await pool.query('DELETE FROM portal_sessions WHERE sess::jsonb->\'user\'->>\'id\'=$1', [String(id)]);
      await pool.query('DELETE FROM portal_users WHERE id=$1', [id]);
    }
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
