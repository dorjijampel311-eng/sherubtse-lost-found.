const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startReturnedCleanup } = require('../services/returnedCleanup');
test('returned cleanup runs at startup, repeats without overlap and stops with the app', async () => {
  let calls = 0, callback, cleared = false, release;
  const timers = { setInterval(fn, ms) { callback = fn; assert.equal(ms, 5*60*1000); return { unref() {} }; }, clearInterval() { cleared = true; } };
  const maintenance = await startReturnedCleanup({ purge: async () => { calls++; if (calls>1) await new Promise(resolve => { release = resolve; }); }, timers });
  assert.equal(calls, 1); callback(); callback(); await Promise.resolve(); assert.equal(calls, 2);
  const stop = maintenance.stop(); assert.equal(cleared, true); release(); await stop;
  await maintenance.run(); assert.equal(calls, 2);
});
test('cleanup failures are reported safely and retried on a later pass', async () => {
  let calls = 0, errors = 0;
  const maintenance = await startReturnedCleanup({ purge: async () => { if (++calls===1) throw Object.assign(new Error('Database unavailable'), { code: 'ECONNRESET' }); },
    logger: { error() { errors++; } }, timers: { setInterval() { return { unref() {} }; }, clearInterval() {} } });
  assert.equal(errors, 1); await maintenance.run(); assert.equal(calls, 2); await maintenance.stop();
});
