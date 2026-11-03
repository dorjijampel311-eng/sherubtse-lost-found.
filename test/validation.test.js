const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validStudent, validProfile, validPassword } = require('../validation');
test('student number must have exactly eight digits and match college email', () => {
  assert.equal(validStudent('07240068', '07240068.sherubtse@rub.edu.bt'), true);
  for (const [id, email] of [ ['7240068','07240068.sherubtse@rub.edu.bt'], ['07240068','07240069.sherubtse@rub.edu.bt'], ['07240068','07240068@gmail.com'], ['07240068','07240068.sherubtse@rub.edu.bt.evil.com'], ['abcdefgh','abcdefgh.sherubtse@rub.edu.bt'] ]) assert.equal(validStudent(id, email), false);
});
test('profile requires real fields, student year and valid phone', () => {
  const profile = { name: 'Student', course: 'Chemistry', year: 'Year 2', phone: '+975 17123456' };
  assert.equal(validProfile(profile), true);
  assert.equal(validProfile({ ...profile, course: 'Life Science' }), true);
  for (const change of [{ name: '' }, { course: ' ' }, { course: 'Unlisted course' }, { year: 'Staff' }, { phone: 'abcdefghi' }, { name: 'x'.repeat(101) }]) assert.equal(validProfile({ ...profile, ...change }), false);
});

test('password requires uppercase, digit and non-whitespace special character within bcrypt limits', () => {
  assert.equal(validPassword('Campus2026!'), true);
  for (const password of ['campus2026!', 'Campusonly!', 'Campus2026 ', 'Campus2026', 'Ab1!', 'A1!' + 'a'.repeat(70), null]) assert.equal(validPassword(password), false);
});
