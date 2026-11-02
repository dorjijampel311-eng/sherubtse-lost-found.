const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ejs = require('ejs');
const template = fs.readFileSync(require.resolve('../views/partials/navbar.ejs'), 'utf8');

test('shared navbar renders complete authenticated or visitor navigation before JavaScript', () => {
  for (const currentPage of ['/', '/browse', '/report-lost', '/report-found', '/my-items', '/profile']) {
    const html = ejs.render(template, { currentPage, navUser: { name: '<Student>', role: 'user' }, sessionJSON: '{}' });
    for (const label of ['My posts', 'Profile', 'Log out', '&lt;Student&gt;']) assert.ok(html.includes(label));
    assert.ok(!html.includes(' hidden')); assert.ok(!html.includes('>Log in<'));
    assert.ok(html.includes(`href="${currentPage}" class="active"`) || currentPage === '/profile');
    const visitor = ejs.render(template, { currentPage, navUser: null, sessionJSON: 'null' });
    assert.ok(visitor.includes('>Log in<')); assert.ok(visitor.includes('>Join<'));
    assert.ok(!visitor.includes('My posts')); assert.ok(!visitor.includes('data-logout'));
  }
});

test('account bootstrap requires no network and keeps navbar intact during slow or failed refresh', async () => {
  const user = { id: 7, name: 'Student', role: 'user' };
  const logout = { dataset: {}, addEventListener() {} };
  let release, calls = 0;
  const context = vm.createContext({
    document: { addEventListener() {}, querySelector(selector) {
      if (selector === '#session-user') return { textContent: JSON.stringify(user) };
      if (selector === '[data-logout]') return logout;
      assert.fail('Navbar should not be rewritten: ' + selector);
    } },
    fetch: async () => { calls++; return new Promise(resolve => { release = resolve; }); },
    location: { reload() { assert.fail('Network errors must not replace the navbar'); } }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/app.js'), 'utf8'), context);
  await context.loadAccount(); assert.equal(calls, 0);
  const pending = context.loadAccount({ refresh: true });
  assert.equal(calls, 1);
  assert.equal(vm.runInContext('state.user.name', context), user.name);
  release({ ok: false, json: async () => ({ error: 'Temporary failure' }) });
  await pending;
  assert.equal(vm.runInContext('state.user.id', context), user.id);
});

test('mobile menu is rendered open on arrival and persists explicit open/close choices', () => {
  const html = ejs.render(template, { currentPage:'/my-items', navUser:{ name:'Student', role:'user' }, sessionJSON:'{}', navOpen:true });
  assert.ok(html.includes('class="nav-links open"'));
  assert.ok(html.includes('aria-expanded="true"'));
  let click;
  const attributes = {};
  let open = true;
  const document = { addEventListener() {}, querySelector(selector) {
    return selector === '.menu-toggle'
      ? { addEventListener(event, handler) { click = handler; }, setAttribute(key, value) { attributes[key] = value; } }
      : { classList: { toggle() { return open = !open; } } };
  } };
  const context = vm.createContext({ document, location:{ protocol:'https:' } });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/app.js'), 'utf8'), context);
  context.initMobileMenu();
  click(); assert.equal(attributes['aria-expanded'], 'false');
  assert.match(document.cookie, /sherubtse_nav_open=0; Path=\/; SameSite=Lax; Secure/);
  click(); assert.equal(attributes['aria-expanded'], 'true');
  assert.match(document.cookie, /sherubtse_nav_open=1/);
});
