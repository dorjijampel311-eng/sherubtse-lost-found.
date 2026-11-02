const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
test('admin listing controls escape user content and keep edit/delete IDs explicit', () => {
  const context = vm.createContext({ document: { addEventListener() {} } });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../public/js/app.js'),'utf8'),context);
  const html = context.adminListingCard({ id:'7',kind:'found',status:'open',title:'<script>bad()</script>',description:'<img onerror=bad()>',name:'Student',category:'Other',location:'Campus',itemDate:'2026-11-02',hasPhoto:true });
  assert.ok(html.includes('data-admin-edit="7"')); assert.ok(html.includes('data-admin-delete="7"'));
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img onerror')); assert.ok(html.includes('&lt;script&gt;'));
});
