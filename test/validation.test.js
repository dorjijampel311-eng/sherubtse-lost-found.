const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validStudent, validProfile } = require('../validation');
test('student number must have exactly eight digits and match college email', () => {
  assert.equal(validStudent('07240068', '07240068.sherubtse@rub.edu.bt'), true);
  for (const [id, email] of [ ['7240068','07240068.sherubtse@rub.edu.bt'], ['07240068','07240069.sherubtse@rub.edu.bt'], ['07240068','07240068@gmail.com'], ['07240068','07240068.sherubtse@rub.edu.bt.evil.com'], ['abcdefgh','abcdefgh.sherubtse@rub.edu.bt'] ]) assert.equal(validStudent(id, email), false);
});
test('profile requires real fields, student year and valid phone', () => {
  const profile = { name: 'Student', course: 'BSc', year: 'Year 2', phone: '+975 17123456' };
  assert.equal(validProfile(profile), true);
  for (const change of [{ name: '' }, { course: ' ' }, { year: 'Staff' }, { phone: 'abcdefghi' }, { name: 'x'.repeat(101) }]) assert.equal(validProfile({ ...profile, ...change }), false);
});
