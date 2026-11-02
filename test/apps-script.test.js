const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
function receiver() {
  let sent = [], secret = 'script-test-secret', fail = false;
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: name => { assert.equal(name, 'MAIL_WEB_APP_SECRET'); return secret; } }) },
    MailApp: { sendEmail: mail => { if (fail) throw new Error('Provider error'); sent.push(mail); } },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: text => ({ text, setMimeType(type) { assert.equal(type, 'application/json'); return this; } }) }
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../apps-script/Code.gs'), 'utf8'), context);
  return { call: payload => JSON.parse(context.doPost({ postData: { contents: typeof payload === 'string' ? payload : JSON.stringify(payload) } }).text), sent,
    setSecret: value => { secret = value; }, fail: () => { fail = true; } };
}
test('Apps Script receiver accepts the exact backend payload with mocked MailApp', () => {
  const app = receiver();
  const payload = { secret: 'script-test-secret', to: '07240068.sherubtse@rub.edu.bt', subject: 'Verification', text: 'Test text', html: '<p>Test HTML</p>' };
  assert.deepEqual(app.call(payload), { ok: true }); assert.equal(app.sent.length, 1);
  assert.equal(app.sent[0].to, payload.to); assert.equal(app.sent[0].body, payload.text); assert.equal(app.sent[0].htmlBody, payload.html);
  assert.equal(app.sent[0].name, 'sherubtse_lost_found');
  for (const change of [{ secret: 'wrong' }, { to: 'other@example.test' }, { html: null }]) assert.deepEqual(app.call({ ...payload, ...change }), { ok: false });
  assert.deepEqual(app.call('not JSON'), { ok: false }); assert.equal(app.sent.length, 1);
  app.fail(); assert.deepEqual(app.call(payload), { ok: false });
  app.setSecret(''); assert.deepEqual(app.call(payload), { ok: false });
});
