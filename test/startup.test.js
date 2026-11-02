const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { startApplication, retryDatabase, startupSettings } = require('../services/startupService');
function fixtures({ bindError } = {}) {
  const events = [], logs = [], errors = [];
  const server = new EventEmitter(); server.address = () => ({ port: 12345 });
  server.close = callback => { events.push('listener-closed'); callback(); }; server.closeIdleConnections = () => {};
  const app = { locals: { sessionStore: { close: async () => events.push('sessions-closed') } }, listen: (port, host) => {
    assert.equal(host, '0.0.0.0'); assert.equal(port, 0); events.push('listening');
    queueMicrotask(() => server.emit(bindError ? 'error' : 'listening', bindError)); return server;
  } };
  const pool = { end: async () => { events.push('pool-closed'); } };
  return { app, pool, events, logs, errors, logger: { log: (...x) => logs.push(x.join(' ')), error: (...x) => errors.push(x.join(' ')) } };
}
test('startup binds before initialization, retries transient failures, and announces readiness afterward', async () => {
  const f = fixtures(); let attempts = 0, admin = 0; const waits = [];
  const runtime = await startApplication({ ...f, port: 0, retry: { sleep: async ms => waits.push(ms) },
    initializeDatabase: async () => { assert.equal(f.app.locals.startup.ready, false); assert.ok(f.events.includes('listening')); if (++attempts < 3) { const error = new Error('Connection terminated due to connection timeout'); throw error; } },
    bootstrapAdmin: async () => { admin++; assert.equal(f.logs.some(x => x.includes('is ready:')), false); } });
  assert.equal(attempts, 3); assert.equal(admin, 1); assert.deepEqual(waits, [1000, 2000]); assert.equal(runtime.state.ready, true);
  assert.equal(f.logs.filter(x => x.includes('is ready:')).length, 1);
  await Promise.all([runtime.close(), runtime.close()]);
  assert.deepEqual(f.events.slice(-3), ['listener-closed', 'sessions-closed', 'pool-closed']); assert.equal(runtime.state.ready, false);
});
test('exhausted connection retries close resources and never report ready', async () => {
  const f = fixtures(); let attempts = 0;
  const error = Object.assign(new Error('connection timeout'), { code: 'ETIMEDOUT' });
  await assert.rejects(startApplication({ ...f, port: 0, retry: { attempts: 2, sleep: async () => {} }, initializeDatabase: async () => { attempts++; throw error; }, bootstrapAdmin: async () => assert.fail('admin must not run') }), value => value === error);
  assert.equal(attempts, 2); assert.ok(f.events.includes('pool-closed')); assert.ok(f.events.includes('sessions-closed'));
  assert.equal(f.logs.some(x => x.includes('is ready:')), false);
});
test('authentication errors are not retried and listener failures release the pool', async () => {
  let attempts = 0;
  await assert.rejects(retryDatabase(async () => { attempts++; throw Object.assign(new Error('Authentication failed'), { code: '28P01' }); }, { sleep: async () => assert.fail('must not retry') }));
  assert.equal(attempts, 1);
  const f = fixtures({ bindError: Object.assign(new Error('Port already used'), { code: 'EADDRINUSE' }) });
  await assert.rejects(startApplication({ ...f, port: 0, initializeDatabase: async () => assert.fail('must not initialize'), bootstrapAdmin: async () => {} }), error => error.code === 'EADDRINUSE');
  assert.ok(f.events.includes('pool-closed')); assert.equal(f.logs.length, 0);
});
test('shutdown during startup cancels database initialization and remains unavailable', async () => {
  const f = fixtures();
  await assert.rejects(startApplication({ ...f, port: 0, onRuntime: runtime => { runtime.close(); }, initializeDatabase: async () => assert.fail('must not initialize during shutdown'), bootstrapAdmin: async () => {} }), error => error.code === 'STARTUP_CANCELLED');
  assert.equal(f.app.locals.startup.ready, false); assert.ok(f.events.includes('pool-closed'));
});
test('runtime settings default to 3000 and bound retries; explicit Render PORT is respected', () => {
  assert.equal(startupSettings({}).port, 3000); assert.equal(startupSettings({ PORT: '10000' }).port, 10000);
  assert.throws(() => startupSettings({ PORT: 'invalid' })); assert.throws(() => startupSettings({ DB_STARTUP_ATTEMPTS: '50' }));
});
function response() { return { statusCode: 200, set() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
test('health stays 503 during startup and on live database failure, with no false healthy response', async () => {
  let available = true, queries = 0;
  const context = { exports: {}, require: () => ({ check: async () => { queries++; if (!available) throw new Error('database unavailable'); } }) };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../controllers/healthController.js'), 'utf8'), context);
  const req = { app: { locals: { startup: { ready: false } } } }; let res = response();
  await context.exports.health(req, res); assert.equal(res.statusCode, 503); assert.equal(queries, 0);
  req.app.locals.startup.ready = true; res = response(); await context.exports.health(req, res); assert.equal(res.statusCode, 200); assert.equal(res.body.database, 'connected');
  available = false; res = response(); await context.exports.health(req, res); assert.equal(res.statusCode, 503); assert.equal(res.body.ok, false);
});
test('application routes are blocked before readiness while the health handler remains reachable', () => {
  const guard = require('../middleware/readiness'); const req = { app: { locals: { startup: { ready: false } } }, path: '/api/items' };
  const res = response(); guard(req, res, () => assert.fail('request must be blocked')); assert.equal(res.statusCode, 503);
  req.path = '/health'; let called = false; guard(req, response(), () => { called = true; }); assert.equal(called, true);
});

test('pool cleanup still runs if closing the session store fails', async () => {
  const f = fixtures();
  f.app.locals.sessionStore.close = async () => { throw new Error('Session cleanup failed'); };
  const original = Object.assign(new Error('Authentication failed'), { code: '28P01' });
  await assert.rejects(startApplication({ ...f, port: 0, initializeDatabase: async () => { throw original; }, bootstrapAdmin: async () => {} }), error => error === original);
  assert.ok(f.events.includes('pool-closed')); assert.ok(f.errors.some(text => text.includes('Startup resource cleanup failed')));
});

test('maintenance starts after database setup and stops before the shared pool closes', async () => {
  const f = fixtures();
  const runtime = await startApplication({ ...f, port: 0, initializeDatabase: async () => f.events.push('schema-ready'), bootstrapAdmin: async () => {},
    startMaintenance: async () => { assert.ok(f.events.includes('schema-ready')); return { stop: async () => f.events.push('maintenance-stopped') }; } });
  await runtime.close(); assert.ok(f.events.indexOf('maintenance-stopped') < f.events.indexOf('pool-closed'));
});
