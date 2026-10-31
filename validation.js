const years = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];
function validStudent(id, email) {
  return typeof id === 'string' && /^\d{8}$/.test(id) && email === `${id}.sherubtse@rub.edu.bt`;
}
function validProfile({ name, phone, course, year }) {
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 100
    && typeof course === 'string' && course.trim().length > 0 && course.length <= 100
    && typeof phone === 'string' && /^[+\d][\d ()-]{6,29}$/.test(phone.trim()) && years.includes(year);
}
module.exports = { validStudent, validProfile };
