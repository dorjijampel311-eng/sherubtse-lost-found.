const userModel = require('../models/userModel');
const { validStudent } = require('../validation');
const { publicUser } = require('../lib/helpers');
function currentUser(req) { return req.session.user || null; }
async function loadSessionUser(req, res, next) {
  try {
    if (req.session.user) {
      const result = await userModel.findById([req.session.user.id]);
      const user = result.rows[0];
      if (!user || !user.email_verified || !validStudent(user.student_id, user.email) || user.session_version !== req.session.user.sessionVersion) req.session.user = null;
      else req.session.user = publicUser(user);
    }
    next();
  } catch (error) { next(error); }
}
function requireUser(req, res, next) {
  if (!currentUser(req) || !currentUser(req).emailVerified || !validStudent(currentUser(req).studentId, currentUser(req).email)) return res.status(401).json({ error: 'Sign in with a verified Sherubtse student account to continue.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!currentUser(req)) return res.status(401).json({ error: 'Sign in to continue.' });
  if (currentUser(req).role !== 'admin') return res.status(403).json({ error: 'Administrator access is required.' });
  next();
}
module.exports = { currentUser, loadSessionUser, requireUser, requireAdmin };
