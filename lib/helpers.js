function clean(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function photoMatches(file) {
  if (!file) return true;
  if (file.mimetype === 'image/jpeg') return file.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (file.mimetype === 'image/png') return file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === 'image/webp') return file.buffer.subarray(0, 4).toString() === 'RIFF' && file.buffer.subarray(8, 12).toString() === 'WEBP';
  return false;
}
function publicUser(user) {
  return { id: user.id, name: user.name, studentId: user.student_id, email: user.email, phone: user.phone, course: user.course, year: user.study_year, notificationsEnabled: user.notifications_enabled, hasPhoto: Boolean(user.has_photo), emailVerified: user.email_verified, sessionVersion: user.session_version, role: user.role };
}
function establishSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(error => {
      if (error) return reject(error);
      req.session.user = user;
      req.session.save(saveError => saveError ? reject(saveError) : resolve());
    });
  });
}


module.exports = { clean, validDate, photoMatches, publicUser, establishSession };
