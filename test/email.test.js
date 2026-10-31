const { test } = require('node:test');
const assert = require('node:assert/strict');
const dbPath = require.resolve('../db');
let recipients = [];
let queries = [];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: { query: async (sql, values) => { assert.match(sql, /notifications_enabled=TRUE/); assert.match(sql, /email_verified=TRUE/); queries.push({ sql, values }); return { rows: recipients }; } } } };
const mailer = require('nodemailer');
let sent = [], fail = false;
mailer.createTransport = () => ({ sendMail: async message => { sent.push(message); if (fail) throw new Error('SMTP unavailable'); return { accepted: [message.to] }; }, close() {} });
const { notifyLostItem, notifyFoundItem, sendAuthCode } = require('../email');
const item = { id: '1', title: 'Test item', category: 'Other', location: 'Campus', itemDate: '2026-10-31' };
test('notification outcomes and recipient privacy', async () => {
  for (const key of ['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','EMAIL_FROM','APP_BASE_URL']) delete process.env[key];
  assert.equal((await notifyLostItem(item)).status, 'unconfigured');
  Object.assign(process.env, { SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_USER: 'test', SMTP_PASSWORD: 'test', EMAIL_FROM: 'sender@example.test', APP_BASE_URL: 'https://campus.example.test', SMTP_SECURE: 'false' });
  assert.equal((await notifyLostItem(item)).status, 'empty');
  recipients = [{ student_id: '07240068', email: '07240068.sherubtse@rub.edu.bt' }, { student_id: '07240069', email: '07240069.sherubtse@rub.edu.bt' }, { student_id: 'old', email: 'old@example.test' }];
  assert.equal((await notifyLostItem(item)).status, 'accepted');
  assert.equal(sent.length, 2); assert.equal(sent[0].to, recipients[0].email);
  assert.match(sent[0].text, /https:\/\/campus.example.test\/browse\?id=1/);
  assert.ok(!sent[0].text.includes(recipients[1].email));
  fail = true;
  assert.equal((await notifyLostItem(item)).status, 'failed');
});

test('authentication email sender handles missing settings, SMTP rejection and acceptance without exposing code in result', async () => {
  process.env.SMTP_SECURE = 'false';
  const args = { email: '07240068.sherubtse@rub.edu.bt', code: '01234567', purpose: 'verify' };
  const savedHost = process.env.SMTP_HOST;
  delete process.env.SMTP_HOST;
  assert.deepEqual(await sendAuthCode(args), { status: 'unconfigured' });
  process.env.SMTP_HOST = savedHost;
  fail = true; assert.deepEqual(await sendAuthCode(args), { status: 'failed' });
  fail = false;
  assert.deepEqual(await sendAuthCode(args), { status: 'accepted' });
  assert.ok(sent.at(-1).text.includes('10 minutes'));
  assert.ok(sent.at(-1).text.includes('/verify'));
  assert.match(sent.at(-1).html, /Verify your email/);
  assert.ok(sent.at(-1).html.includes(args.code));
  assert.ok(sent.at(-1).html.includes('10 minutes'));
  assert.ok(sent.at(-1).html.includes('cid:sherubtse-logo'));
  assert.ok(!sent.at(-1).html.includes('Does it belong to you'));
  assert.equal(sent.at(-1).attachments[0].cid, 'sherubtse-logo');
  assert.ok(require('fs').existsSync(sent.at(-1).attachments[0].path));
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
    assert.ok(mail.html.includes('cid:sherubtse-logo')); assert.ok(mail.html.includes('cid:found-item-photo'));
    assert.ok(mail.html.includes('https://campus.example.test/browse?id=1'));
    assert.equal(mail.attachments.length, 2); assert.equal(mail.attachments[1].content, photoData);
    assert.equal(mail.attachments[1].contentType, 'image/jpeg');
    assert.ok(!mail.html.includes('verification code')); assert.ok(!mail.text.includes('verification code'));
    for (const value of ['do-not-send-this', 'private-phone', 'private-poster-email']) assert.ok(!JSON.stringify(mail).includes(value));
    assert.equal(mail.cc, undefined); assert.equal(mail.bcc, undefined);
  }
});
test('found notification supports no photo, rejected mail and missing SMTP without claiming delivery', async () => {
  fail = false; sent = [];
  recipients = [{ id: '2', student_id: '07240069', email: '07240069.sherubtse@rub.edu.bt' }];
  const found = { ...item, posterId: '1', description: 'A blue bottle.' };
  assert.equal((await notifyFoundItem(found)).status, 'accepted');
  assert.equal(sent[0].attachments.length, 1); assert.ok(!sent[0].html.includes('cid:found-item-photo'));
  fail = true;
  const rejected = await notifyFoundItem(found); assert.equal(rejected.status, 'failed'); assert.ok(rejected.message.includes('Your post was saved'));
  const host = process.env.SMTP_HOST; delete process.env.SMTP_HOST;
  assert.equal((await notifyFoundItem(found)).status, 'unconfigured');
  process.env.SMTP_HOST = host; fail = false;
});
