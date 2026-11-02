const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { buildDatabaseConfig } = require('../config/database');
const { safeError } = require('../lib/safeErrors');
const local = { DATABASE_URL: 'postgresql://test_user:p%40ss%3Aword@localhost:5432/portal_test', PGSSLMODE: 'disable' };
test('database URL becomes explicit decoded client fields with bounded settings', () => {
  const { options, summary } = buildDatabaseConfig(local);
  assert.equal(options.host, 'localhost'); assert.equal(options.database, 'portal_test'); assert.equal(options.user, 'test_user');
  assert.equal(options.password, 'p@ss:word'); assert.equal(options.ssl, false);
  assert.equal(options.connectionString, undefined); assert.equal(options.connectionTimeoutMillis, 10000);
  assert.equal(options.query_timeout, 15000); assert.equal(options.max, 5);
  assert.equal(summary.target, 'local'); assert.ok(!JSON.stringify(summary).includes(options.password));
});
test('production rejects missing targets, malformed URLs, loopback and conflicting TLS without leaking input', () => {
  for (const change of [ { DATABASE_URL: '' }, { DATABASE_URL: 'bad secret input' }, { DATABASE_URL: 'https://user:pass@host/db' },
    { DATABASE_URL: 'postgres://user:pass@host' }, { NODE_ENV: 'production' }, { PGPOOL_MAX: 'NaN' }, { PGCONNECT_TIMEOUT_MS: '0' },
    { DATABASE_URL: local.DATABASE_URL + '?sslmode=require' }, { PGSSLMODE: 'invalid' }, { DATABASE_URL: local.DATABASE_URL + '?host=elsewhere' } ]) {
    assert.throws(() => buildDatabaseConfig({ ...local, ...change }), error => error.code === 'DB_CONFIG_INVALID' && !error.message.includes('p%40ss') && !error.message.includes('secret input'));
  }
});
test('TLS settings are explicit and independent of production mode or pg URL overrides', () => {
  const base = { DATABASE_URL: 'postgres://user:pass@db.example.test/portal', NODE_ENV: 'production' };
  assert.deepEqual(buildDatabaseConfig(base).options.ssl, { rejectUnauthorized: true });
  assert.deepEqual(buildDatabaseConfig({ ...base, PGSSLMODE: 'require' }).options.ssl, { rejectUnauthorized: false });
  assert.equal(buildDatabaseConfig({ ...base, PGSSLMODE: 'disable' }).options.ssl, false);
  assert.equal(buildDatabaseConfig({ ...base, DATABASE_URL: 'postgres://user:pass@dpg-example-a/portal' }).options.ssl, false);
  assert.deepEqual(buildDatabaseConfig({ ...base, DATABASE_URL: base.DATABASE_URL + '?sslmode=verify-full' }).options.ssl, { rejectUnauthorized: true });
});
test('one pool instance backs all database calls and idle errors use safe logging', async () => {
  let created = 0, queries = 0, idleError;
  const options = buildDatabaseConfig(local).options;
  class Pool { constructor(actual) { created++; assert.equal(actual, options); } query() { queries++; return Promise.resolve(); } on(name, fn) { assert.equal(name, 'error'); idleError = fn; } }
  const context = { module: { exports: {} }, require: name => name === 'pg' ? { Pool } : name === './config/database' ? { buildDatabaseConfig: () => ({ options, summary: {} }) } : name === './lib/safeErrors' ? { logError: () => {} } : {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../db.js'), 'utf8'), context);
  const db = context.module.exports; await db.initializeDatabase(); await db.pool.query('SELECT 1');
  assert.equal(created, 1); assert.equal(queries, 2); assert.equal(typeof idleError, 'function');
});
test('sanitized errors include stack and nested codes even for empty AggregateError messages', () => {
  const env = { DATABASE_URL: local.DATABASE_URL, SESSION_SECRET: 'session-secret-fixture', MAIL_WEB_APP_SECRET: 'mail-secret-fixture' };
  const nested = new Error(`Timeout at ${env.DATABASE_URL} password p@ss:word session-secret-fixture mail-secret-fixture student@example.test`); nested.code = 'ETIMEDOUT';
  const result = safeError(new AggregateError([nested], ''), env); const json = JSON.stringify(result);
  assert.equal(result.name, 'AggregateError'); assert.ok(result.message.length); assert.equal(result.errors[0].code, 'ETIMEDOUT'); assert.ok(result.errors[0].stack);
  for (const value of [env.DATABASE_URL, 'p@ss:word', 'p%40ss%3Aword', 'test_user', env.SESSION_SECRET, env.MAIL_WEB_APP_SECRET, 'student@example.test']) assert.ok(!json.includes(value));
});

test('redaction masks other PostgreSQL URLs even when the configured user is postgres', () => {
  const result = safeError(new Error('Failed postgres://another_user:another_password@remote/db'), { DATABASE_URL: 'postgres://postgres:local_password@local/db' });
  assert.ok(!JSON.stringify(result).includes('another_password')); assert.ok(!JSON.stringify(result).includes('another_user'));
});
