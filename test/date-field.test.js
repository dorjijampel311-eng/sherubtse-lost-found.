const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
function browser(document = { addEventListener() {} }) {
  const context = vm.createContext({ document, queueMicrotask });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../public/js/app.js'), 'utf8'), context);
  return context;
}
test('DD/MM/YYYY converts unambiguously to valid backend ISO dates', () => {
  const context = browser();
  assert.equal(context.dateInputISO('02/11/2026'), '2026-11-02');
  assert.equal(context.dateInputDisplay('2026-11-02'), '02/11/2026');
  assert.equal(context.dateInputISO('29/02/2028'), '2028-02-29');
  for (const value of ['31/02/2026', '29/02/2026', '11/30/2026', '00/12/2026', '02/11/0000', '2026-11-02', '']) assert.equal(context.dateInputISO(value), '');
});
test('manual entry and native calendar stay synchronized while only ISO field has a submission name', async () => {
  const display = { value: '', events: {}, setCustomValidity(value) { this.error = value; }, addEventListener(name, fn) { this.events[name] = fn; } };
  let reset, opened = false;
  const picker = { name: 'itemDate', value: '', events: {}, addEventListener(name, fn) { this.events[name] = fn; }, showPicker() { opened = true; }, form: { addEventListener(name, fn) { reset = fn; } } };
  const control = { querySelector: selector => selector === '[data-date-display]' ? display : picker };
  const context = browser({ addEventListener() {}, querySelectorAll: () => [control] });
  context.initDateFields();
  display.value = '02/11/2026'; display.events.input(); assert.equal(picker.value, '2026-11-02'); assert.equal(display.error, ''); assert.equal(display.name, undefined);
  picker.value = '2026-12-05'; picker.events.change(); assert.equal(display.value, '05/12/2026');
  picker.events.click({ preventDefault() {} }); assert.equal(opened, true);
  display.value = '31/02/2026'; display.events.input(); assert.equal(picker.value, ''); assert.ok(display.error);
  picker.value = ''; reset(); await Promise.resolve(); assert.equal(display.value, ''); assert.equal(display.error, '');
});
