const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootstrapAdmin } = require('../services/adminBootstrap');
test('admin bootstrap requires a specific verified registered account and is idempotent', async () => {
  let role = 'user', verified = true, exists = true, calls = 0, promotions = 0;
  const pool = { query: async (sql, values) => {
    calls++; assert.deepEqual(values, ['07240068.sherubtse@rub.edu.bt']);
    if (sql.startsWith('UPDATE')) {
      assert.match(sql, /email_verified=TRUE/); assert.match(sql, /session_version=session_version\+1/);
      if (exists && verified && role !== 'admin') { role = 'admin'; promotions++; return { rowCount: 1 }; }
      return { rowCount: 0 };
    }
    return { rows: exists ? [{ role, email_verified: verified }] : [] };
  } };
  assert.equal((await bootstrapAdmin(pool, '')).status, 'unconfigured'); assert.equal(calls, 0);
  await assert.rejects(bootstrapAdmin(pool, 'someone@example.test'), /ADMIN_EMAIL/); assert.equal(calls, 0);
  assert.equal((await bootstrapAdmin(pool, '07240068.sherubtse@rub.edu.bt')).status, 'promoted');
  assert.equal((await bootstrapAdmin(pool, '07240068.sherubtse@rub.edu.bt')).status, 'ready'); assert.equal(promotions, 1);
  verified = false; role = 'user';
  assert.equal((await bootstrapAdmin(pool, '07240068.sherubtse@rub.edu.bt')).status, 'pending'); assert.equal(role, 'user');
  exists = false;
  assert.equal((await bootstrapAdmin(pool, '07240068.sherubtse@rub.edu.bt')).status, 'pending');
});
