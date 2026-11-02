const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
function browser() {
  const context = { document: { addEventListener() {} }, URLSearchParams, location: { search: '' }, confirm: () => true, alert: message => assert.fail(message) };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../public/js/app.js'), 'utf8'), context);
  return context;
}
test('listing controls appear only for the signed-in owner, including numeric/string IDs', () => {
  const context = browser();
  const item = { id: '7', ownerId: '42', title: 'Charger', kind: 'lost', status: 'open' };
  context.item = item;
  assert.ok(!vm.runInContext('card(item)', context).includes('data-delete'));
  vm.runInContext('state.user = { id: 41 }', context);
  assert.ok(!vm.runInContext('card(item)', context).includes('data-delete'));
  vm.runInContext('state.user = { id: 42 }', context);
  const owned = vm.runInContext('card(item)', context);
  assert.ok(owned.includes('data-delete="7"')); assert.ok(owned.includes('data-return="7"'));
  item.status = 'returned';
  const returned = vm.runInContext('card(item)', context);
  assert.ok(returned.includes('data-delete="7"')); assert.ok(!returned.includes('data-return'));
});
test('deletion requires confirmation, sends DELETE and refreshes the listing view', async () => {
  const context = browser(); let requests = 0, refreshes = 0;
  context.fetch = async (url, options) => { requests++; assert.equal(url, '/api/items/7'); assert.equal(options.method, 'DELETE'); return { ok: true, json: async () => ({}) }; };
  const container = {}, button = { disabled: false, textContent: 'Delete post', dataset: { delete: '7' } };
  const event = { target: { closest: selector => selector === '[data-delete]' ? button : null } };
  context.bindListingActions(container, async () => { refreshes++; });
  context.confirm = () => false; await container.onclick(event); assert.equal(requests, 0);
  context.confirm = () => true; await container.onclick(event);
  assert.equal(requests, 1); assert.equal(refreshes, 1); assert.equal(button.disabled, false);
});
