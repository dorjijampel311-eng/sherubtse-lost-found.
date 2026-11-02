const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
test('password eyes toggle independently without clearing values or submitting forms', () => {
  const wrappers = [], resets = [];
  const inputs = ['password', 'confirmPassword'].map(name => ({ name, type: 'password', id: '', value: 'UserEnteredValue1!', dataset: {}, disabled: false,
    form: { addEventListener: (event, callback) => { assert.equal(event, 'reset'); resets.push(callback); } }, before: wrapper => wrappers.push(wrapper) }));
  const document = { addEventListener() {}, querySelectorAll: () => inputs.filter(input => input.type === 'password'),
    getElementById: id => inputs.find(input => input.id === id),
    createElement: tag => ({ tag, attributes: {}, events: {}, setAttribute(key, value) { this.attributes[key] = value; },
      addEventListener(key, value) { this.events[key] = value; }, append(...children) { this.children = children; } }) };
  const context = vm.createContext({ document });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../public/js/app.js'), 'utf8'), context);
  context.initPasswordToggles(); assert.equal(wrappers.length, 2);
  const first = wrappers[0].children[1], second = wrappers[1].children[1];
  assert.equal(first.type, 'button'); assert.equal(first.attributes['aria-controls'], inputs[0].id);
  assert.equal(first.attributes['aria-label'], 'Show password'); assert.equal(second.attributes['aria-label'], 'Show confirm password');
  let prevented = 0;
  first.events.click({ preventDefault: () => { prevented++; } });
  assert.equal(inputs[0].type, 'text'); assert.equal(inputs[1].type, 'password');
  assert.equal(first.attributes['aria-pressed'], 'true'); assert.equal(first.attributes['aria-label'], 'Hide password');
  assert.equal(inputs[0].value, 'UserEnteredValue1!');
  first.events.click({ preventDefault: () => { prevented++; } });
  assert.equal(inputs[0].type, 'password'); assert.equal(inputs[0].value, 'UserEnteredValue1!'); assert.equal(prevented, 2);
  context.initPasswordToggles(); assert.equal(wrappers.length, 2);
  second.events.click({ preventDefault() {} }); resets.forEach(callback => callback());
  assert.equal(inputs[1].type, 'password'); assert.equal(second.attributes['aria-pressed'], 'false');
});
