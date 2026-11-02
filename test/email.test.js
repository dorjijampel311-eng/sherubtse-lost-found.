const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const dbPath = require.resolve('../db');
let recipients = [];
let queries = [];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: { query: async (sql, values) => { assert.match(sql, /notifications_enabled=TRUE/); assert.match(sql, /email_verified=TRUE/); queries.push({ sql, values }); return { rows: recipients }; } } } };
const originalFetch = global.fetch;
const originalWarn = console.warn;
const diagnostics = [];
console.warn = (...args) => diagnostics.push(args.join(' '));
after(() => { global.fetch = originalFetch; console.warn = originalWarn; });
let sent = [], fail = false, mode = 'success';
global.fetch = async (url, options) => {
  assert.equal(url, process.env.MAIL_WEB_APP_URL);
  assert.equal(options.method, 'POST'); assert.equal(options.headers['Content-Type'], 'application/json');
  assert.ok(options.signal instanceof AbortSignal);
  const payload = JSON.parse(options.body);
  assert.deepEqual(Object.keys(payload).sort(), ['secret', 'to', 'subject', 'text', 'html'].sort());
  assert.equal(payload.secret, process.env.MAIL_WEB_APP_SECRET);
  sent.push(payload);
  if (fail || mode === 'network') throw new Error('Web app unavailable');
  if (mode === 'timeout') throw new DOMException('Timed out', 'TimeoutError');
  return { ok: !['http-error', 'http-unauthorized'].includes(mode), status: mode === 'http-unauthorized' ? 401 : mode === 'http-error' ? 500 : 200, json: async () => {
    if (mode === 'invalid-json') throw new SyntaxError('Invalid JSON');
    if (mode === 'empty-result') return {};
    if (mode === 'null-result') return null;
    if (mode === 'string-success') return { ok: 'true' };
    return { ok: mode !== 'rejected' };
  } };
};
const { notifyLostItem, notifyFoundItem, sendAuthCode } = require('../email');
const item = { id: '1', title: 'Test item', category: 'Other', location: 'Campus', itemDate: '2026-10-31' };
test('notification outcomes and recipient privacy', async () => {
  for (const key of ['MAIL_WEB_APP_URL','MAIL_WEB_APP_SECRET','APP_BASE_URL']) delete process.env[key];
  assert.equal((await notifyLostItem(item)).status, 'unconfigured');
  Object.assign(process.env, { MAIL_WEB_APP_URL: 'https://script.google.com/macros/s/test/exec', MAIL_WEB_APP_SECRET: 'test-only-shared-secret', APP_BASE_URL: 'https://campus.example.test' });
  assert.equal((await notifyLostItem(item)).status, 'empty');
  recipients = [{ student_id: '07240068', email: '07240068.sherubtse@rub.edu.bt' }, { student_id: '07240069', email: '07240069.sherubtse@rub.edu.bt' }, { student_id: 'old', email: 'old@example.test' }];
  assert.equal((await notifyLostItem(item)).status, 'accepted');
  assert.equal(sent.length, 2); assert.equal(sent[0].to, recipients[0].email);
  assert.match(sent[0].text, /https:\/\/campus.example.test\/browse\?id=1/);
  assert.ok(!sent[0].text.includes(recipients[1].email));
  fail = true;
  assert.equal((await notifyLostItem(item)).status, 'failed');
});

test('authentication email sender handles missing settings, web-app rejection and acceptance without exposing code in result', async () => {
  const args = { email: '07240068.sherubtse@rub.edu.bt', code: '01234567', purpose: 'verify' };
  const savedUrl = process.env.MAIL_WEB_APP_URL;
  delete process.env.MAIL_WEB_APP_URL;
  assert.deepEqual(await sendAuthCode(args), { status: 'unconfigured' });
  process.env.MAIL_WEB_APP_URL = savedUrl;
  fail = true; assert.deepEqual(await sendAuthCode(args), { status: 'failed' });
  fail = false;
  assert.deepEqual(await sendAuthCode(args), { status: 'accepted' });
  assert.ok(sent.at(-1).text.includes('10 minutes'));
  assert.ok(sent.at(-1).text.includes('/verify'));
  assert.match(sent.at(-1).html, /Verify your email/);
  assert.ok(sent.at(-1).html.includes(args.code));
  assert.ok(sent.at(-1).html.includes('10 minutes'));
  assert.ok(sent.at(-1).html.includes('https://campus.example.test/Sherubtse_logo/images.jpg'));
  assert.ok(!sent.at(-1).html.includes('Does it belong to you'));
  assert.equal(sent.at(-1).attachments, undefined);
  assert.ok(!sent.at(-1).text.includes('.html'));
  await sendAuthCode({ ...args, purpose: 'reset' });
  assert.ok(sent.at(-1).text.includes('30 minutes'));
  assert.ok(sent.at(-1).text.includes('/reset-password'));
  assert.ok(!sent.at(-1).text.includes('.html'));
});

test('found notification is separate from verification, escapes details, embeds logo/photo and excludes poster', async () => {
  fail = false; sent = []; queries = [];
  recipients = [
    { id: '1', student_id: '07240068', email: '07240068.sherubtse@rub.edu.bt' },
    { id: '2', student_id: '07240069', email: '07240069.sherubtse@rub.edu.bt' },
    { id: '3', student_id: '07240070', email: '07240070.sherubtse@rub.edu.bt' },
    { id: '4', student_id: 'invalid', email: 'external@example.test' }
  ];
  const photoData = Buffer.from('test validated photo bytes');
  const found = { ...item, posterId: '1', title: 'Bottle <gold>', category: 'Other & more', location: 'Library <desk>', description: '<script>alert("x")</script>\nBlue & white', photoData, photoMime: 'image/jpeg', code: 'do-not-send-this', phone: 'private-phone', email: 'private-poster-email' };
  assert.equal((await notifyFoundItem(found)).status, 'accepted');
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map(mail => mail.to), [recipients[1].email, recipients[2].email]);
  assert.match(queries[0].sql, /id<>\$1/); assert.deepEqual(queries[0].values, ['1']);
  for (const mail of sent) {
    assert.ok(mail.html.includes('Someone has found this item. Does it belong to you?'));
    assert.ok(mail.text.includes('Someone has found this item. Does it belong to you?'));
    for (const field of [found.title, found.category, found.description, found.location, found.itemDate]) assert.ok(mail.text.includes(field));
    assert.ok(mail.html.includes('&lt;script&gt;')); assert.ok(!mail.html.includes('<script>'));
    assert.ok(mail.html.includes('Bottle &lt;gold&gt;')); assert.ok(mail.html.includes('Library &lt;desk&gt;'));
    assert.ok(mail.html.includes('https://campus.example.test/Sherubtse_logo/images.jpg')); assert.ok(mail.html.includes('https://campus.example.test/api/items/1/photo'));
    assert.ok(!mail.html.includes('cid:'));
    assert.ok(mail.html.includes('https://campus.example.test/browse?id=1'));
    assert.equal(mail.attachments, undefined);
    assert.ok(!mail.html.includes('verification code')); assert.ok(!mail.text.includes('verification code'));
    for (const value of ['do-not-send-this', 'private-phone', 'private-poster-email']) assert.ok(!JSON.stringify(mail).includes(value));
    assert.equal(mail.cc, undefined); assert.equal(mail.bcc, undefined);
  }
});
test('found notification supports no photo, rejected mail and missing web-app settings without claiming delivery', async () => {
  fail = false; sent = [];
  recipients = [{ id: '2', student_id: '07240069', email: '07240069.sherubtse@rub.edu.bt' }];
  const found = { ...item, posterId: '1', description: 'A blue bottle.' };
  assert.equal((await notifyFoundItem(found)).status, 'accepted');
  assert.equal(sent[0].attachments, undefined); assert.ok(!sent[0].html.includes('/api/items/1/photo'));
  fail = true;
  const rejected = await notifyFoundItem(found); assert.equal(rejected.status, 'failed'); assert.ok(rejected.message.includes('Your post was saved'));
  const host = process.env.MAIL_WEB_APP_URL; delete process.env.MAIL_WEB_APP_URL;
  assert.equal((await notifyFoundItem(found)).status, 'unconfigured');
  process.env.MAIL_WEB_APP_URL = host; fail = false;
});

test('web app configuration requires a secret, HTTPS endpoint and valid application URL', () => {
  const saved = { ...process.env };
  try {
    const { emailConfigured } = require('../email');
    const valid = { MAIL_WEB_APP_URL: 'https://script.google.com/macros/s/test/exec', MAIL_WEB_APP_SECRET: 'test-secret', APP_BASE_URL: 'http://localhost:3000' };
    Object.assign(process.env, valid); assert.equal(emailConfigured(), true);
    for (const key of Object.keys(valid)) {
      process.env[key] = ''; assert.equal(emailConfigured(), false); Object.assign(process.env, valid);
    }
    for (const url of ['not-a-url', 'http://script.google.com/exec', 'ftp://example.test/exec', 'https://user:pass@example.test/exec']) {
      process.env.MAIL_WEB_APP_URL = url; assert.equal(emailConfigured(), false);
    }
    Object.assign(process.env, valid);
    for (const url of ['invalid', 'javascript:alert(1)', 'https://user:pass@example.test']) {
      process.env.APP_BASE_URL = url; assert.equal(emailConfigured(), false);
    }
  } finally {
    for (const key of ['MAIL_WEB_APP_URL', 'MAIL_WEB_APP_SECRET', 'APP_BASE_URL']) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});
test('HTTP errors, ok:false, invalid JSON, network errors and timeout fail without exposing details', async () => {
  const originalTimeout = AbortSignal.timeout;
  let timeoutMs;
  AbortSignal.timeout = ms => { timeoutMs = ms; return new AbortController().signal; };
  try {
    for (mode of ['http-error', 'http-unauthorized', 'rejected', 'invalid-json', 'empty-result', 'null-result', 'string-success', 'network', 'timeout']) {
      assert.deepEqual(await sendAuthCode({ email: '07240068.sherubtse@rub.edu.bt', code: '01234567', purpose: 'verify' }), { status: 'failed' });
      assert.equal(timeoutMs, 15000);
    }
  } finally { AbortSignal.timeout = originalTimeout; mode = 'success'; }
});
test('partial found-item sending failure preserves aggregate counts and per-recipient privacy', async () => {
  const mock = global.fetch; let calls = 0;
  recipients = [
    { id: '2', student_id: '07240069', email: '07240069.sherubtse@rub.edu.bt' },
    { id: '3', student_id: '07240070', email: '07240070.sherubtse@rub.edu.bt' }
  ];
  global.fetch = async (...args) => { const result = await mock(...args); return ++calls === 1 ? result : { ok: true, json: async () => ({ ok: false }) }; };
  try {
    const result = await notifyFoundItem({ ...item, posterId: '1', description: 'Found bottle.' });
    assert.equal(result.status, 'failed'); assert.match(result.message, /failed for 1 recipient/); assert.match(result.message, /1 accepted/);
  } finally { global.fetch = mock; }
});

test('safe configuration diagnostics expose variable names only and never require SMTP', () => {
  const { emailConfiguration } = require('../email');
  const saved = { MAIL_WEB_APP_URL: process.env.MAIL_WEB_APP_URL, MAIL_WEB_APP_SECRET: process.env.MAIL_WEB_APP_SECRET, APP_BASE_URL: process.env.APP_BASE_URL };
  try {
    delete process.env.MAIL_WEB_APP_SECRET;
    let result = emailConfiguration();
    assert.equal(result.configured, false); assert.deepEqual(result.missing, ['MAIL_WEB_APP_SECRET']);
    process.env.MAIL_WEB_APP_SECRET = 'test-secret-never-return';
    process.env.MAIL_WEB_APP_URL = 'not-a-valid-url';
    result = emailConfiguration(); assert.deepEqual(result.invalid, ['MAIL_WEB_APP_URL']);
    assert.ok(!JSON.stringify(result).includes(process.env.MAIL_WEB_APP_SECRET));
    assert.ok(!JSON.stringify(result).includes('not-a-valid-url'));
    process.env.MAIL_WEB_APP_URL = 'https://script.google.com/macros/s/test/exec';
    assert.equal(emailConfiguration().configured, true);
  } finally { Object.assign(process.env, saved); }
});

test('access-denied diagnostics identify the remote deployment problem without exposing message data', async () => {
  diagnostics.length = 0; mode = 'http-unauthorized';
  try {
    assert.deepEqual(await sendAuthCode({ email: '07240068.sherubtse@rub.edu.bt', code: '01234567', purpose: 'reset' }), { status: 'failed' });
    assert.equal(diagnostics.length, 1);
    assert.ok(diagnostics[0].includes('WEB_APP_ACCESS_DENIED')); assert.ok(diagnostics[0].includes('401'));
    for (const value of ['07240068.sherubtse@rub.edu.bt', '01234567', process.env.MAIL_WEB_APP_SECRET, process.env.MAIL_WEB_APP_URL]) assert.ok(!diagnostics[0].includes(value));
  } finally { mode = 'success'; }
});
