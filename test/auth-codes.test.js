const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createCodeService } = require('../auth-codes');
function setup() {
  const state = { user: { id: '1', student_id: '07240068', email: '07240068.sherubtse@rub.edu.bt', email_verified: false }, record: null, configured: true, status: 'accepted', mail: [], passwordHash: null, version: 0 };
  const client = { release() {}, async query(sql, args = []) {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return {};
    if (sql.includes('SELECT id,email_verified')) return { rows: args[0] === state.user.email ? [state.user] : [] };
    if (sql.includes('SELECT id FROM')) return { rows: args[0] === state.user.email ? [state.user] : [] };
    if (sql.includes('AS cooling')) return { rows: state.record ? [{ cooling: state.record.cooling }] : [] };
    if (sql.includes('INSERT INTO portal_auth_codes')) { state.record = { code_hash: args[2], purpose: args[1], minutes: args[3], active: true, used_at: null, attempts: 0, cooling: true }; return {}; }
    if (sql.includes('SELECT *, expires_at')) return { rows: state.record && state.record.purpose === args[1] ? [state.record] : [] };
    if (sql.includes('SET attempts=attempts+1')) { state.record.attempts++; return {}; }
    if (sql.includes('SET used_at=NOW()')) { state.record.used_at = new Date(); return {}; }
    if (sql.includes('SET email_verified=TRUE')) { state.user.email_verified = true; return {}; }
    if (sql.includes('SET password_hash=')) { state.passwordHash = args[0]; state.version++; return {}; }
    throw new Error('Unexpected query: ' + sql);
  } };
  const service = createCodeService({ pool: { connect: async () => client }, emailConfigured: () => state.configured,
    sendAuthCode: async mail => { state.mail.push(mail); return { status: state.status }; } });
  return { state, service, email: state.user.email };
}
test('verification stores only a hash, expires in ten minutes, and is single-use', async () => {
  const { state, service, email } = setup();
  const response = await service.issue(email, 'verify');
  assert.deepEqual(response, { status: 'accepted' });
  assert.equal(state.mail.length, 1); const code = state.mail[0].code;
  assert.match(code, /^\d{8}$/); assert.notEqual(state.record.code_hash, code);
  assert.equal(await bcrypt.compare(code, state.record.code_hash), true);
  assert.equal(state.record.minutes, 10);
  assert.equal(await service.consume(email, 'verify', code), true);
  assert.equal(state.user.email_verified, true);
  assert.equal(await service.consume(email, 'verify', code), false);
});
test('resend cooldown, replacement, expiry and five-attempt lockout', async () => {
  const { state, service, email } = setup();
  await service.issue(email, 'verify'); const oldHash = state.record.code_hash;
  assert.equal((await service.issue(email, 'verify')).status, 'cooldown');
  state.record.cooling = false; await service.issue(email, 'verify');
  assert.notEqual(state.record.code_hash, oldHash);
  const code = state.mail.at(-1).code;
  state.record.active = false; assert.equal(await service.consume(email, 'verify', code), false);
  state.record.active = true;
  const wrong = code === '00000000' ? '11111111' : '00000000';
  for (let i = 0; i < 5; i++) assert.equal(await service.consume(email, 'verify', wrong), false);
  assert.equal(state.record.attempts, 5);
  assert.equal(await service.consume(email, 'verify', code), false);
});
test('reset expires in thirty minutes, hashes new password and revokes existing sessions', async () => {
  const { state, service, email } = setup();
  await service.issue(email, 'reset'); const code = state.mail[0].code;
  assert.equal(state.record.minutes, 30);
  assert.equal(await service.consume(email, 'verify', code), false);
  assert.equal(await service.consume(email, 'reset', code, 'NewCampus2026!'), true);
  assert.equal(await bcrypt.compare('NewCampus2026!', state.passwordHash), true);
  assert.equal(state.version, 1);
  assert.equal(await service.consume(email, 'reset', code, 'OtherCampus2026!'), false);
});
test('missing or failed email never leaves a usable code; unknown addresses receive no mail', async () => {
  const { state, service, email } = setup(); state.configured = false;
  assert.equal((await service.issue(email, 'verify')).status, 'unconfigured'); assert.equal(state.record, null);
  state.configured = true; state.status = 'failed';
  assert.equal((await service.issue(email, 'verify')).status, 'failed');
  assert.ok(state.record.used_at);
  assert.equal(await service.consume(email, 'verify', state.mail[0].code), false);
  assert.equal((await service.issue('00000000.sherubtse@rub.edu.bt', 'reset')).status, 'ineligible');
  assert.equal(state.mail.length, 1);
});
