const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
test('comment content and author names are escaped and profile details are not embedded in cards', () => {
  const context = vm.createContext({ document: { addEventListener() {} } });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../public/js/app.js'), 'utf8'), context);
  const html = context.commentRows([{ id: '1', userId: '7', name: '<img src=x onerror=bad()>', body: '<script>bad()</script>', createdAt: '2026-11-02T00:00:00Z', phone: 'PRIVATE-PHONE' }]);
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('data-commenter="7"')); assert.ok(html.includes('aria-haspopup="dialog"')); assert.ok(!html.includes('PRIVATE-PHONE'));
  const section = context.commentSection({ id: '3', commentCount: 2 });
  assert.ok(section.includes('data-comments-item="3"')); assert.ok(section.includes('>2</span>'));
});
