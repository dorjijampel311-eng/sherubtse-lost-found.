const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
test('dotenv loads the project-root file and preserves hosted environment precedence', () => {
  let options;
  const directory = path.resolve(__dirname, '../config');
  vm.runInNewContext(fs.readFileSync(path.join(directory, 'environment.js'), 'utf8'), {
    __dirname: directory,
    require: name => name === 'path' ? path : { config: value => { options = value; } }
  });
  assert.equal(options.path, path.resolve(__dirname, '../.env'));
  assert.ok(path.isAbsolute(options.path)); assert.notEqual(options.override, true);
  const target = { MAIL_WEB_APP_SECRET: 'hosted-test-value' };
  require('dotenv').populate(target, { MAIL_WEB_APP_SECRET: 'local-test-value' });
  assert.equal(target.MAIL_WEB_APP_SECRET, 'hosted-test-value');
});
test('email service loads dotenv before model or template imports', () => {
  let loaded = false;
  const context = { module: { exports: {} }, process: { env: {} }, URL,
    require: name => {
      if (name === '../config/environment') { loaded = true; return {}; }
      assert.equal(loaded, true, 'Environment must load before email dependencies'); return {};
    }
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../services/emailService.js'), 'utf8'), context);
  assert.equal(context.module.exports.emailConfigured(), false);
  assert.deepEqual(Array.from(context.module.exports.emailConfiguration().missing), ['MAIL_WEB_APP_URL', 'MAIL_WEB_APP_SECRET', 'APP_BASE_URL']);
});
