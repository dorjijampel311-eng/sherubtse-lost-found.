const courses = ['Chemistry', 'Physics', 'DCPM', 'EPS', 'DSDA', 'Math', 'Life Science'];
const years = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];
function validStudent(id, email) {
  return typeof id === 'string' && /^\d{8}$/.test(id) && email === `${id}.sherubtse@rub.edu.bt`;
}
function validProfile({ name, phone, course, year }) {
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 100
    && courses.includes(course)
    && typeof phone === 'string' && /^[+\d][\d ()-]{6,29}$/.test(phone.trim()) && years.includes(year);
}
function validPassword(password) {
  return typeof password === 'string' && password.length >= 10 && Buffer.byteLength(password, 'utf8') <= 72
    && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9\s]/.test(password);
}
module.exports = { validStudent, validProfile, validPassword };
