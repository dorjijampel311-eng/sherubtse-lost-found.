const userModel = require('../models/userModel');
const { currentUser } = require('../middleware/auth');
const { clean, publicUser, establishSession } = require('../lib/helpers');
const { validStudent, validProfile, validPassword } = require('../validation');
const bcrypt = require('bcryptjs');
const { emailConfigured } = require('../email');
const codes = require('../services/authService');
const { activateConfiguredAdmin } = require('../services/adminBootstrap');
function authEmail(req) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return /^\d{8}\.sherubtse@rub\.edu\.bt$/.test(email) ? email : null;
}
function deliveryMessage(status) {
  if (status === 'unconfigured') return 'Email settings are missing or invalid. Set MAIL_WEB_APP_URL, MAIL_WEB_APP_SECRET and APP_BASE_URL in the project .env or hosting environment, restart the server, then resend your code.';
  if (status === 'failed') return 'The email could not be sent. Try requesting a new code later or contact the project maintainer.';
  if (status === 'cooldown') return 'Wait at least 60 seconds before requesting another code.';
  return 'If this account needs verification, request a new code and check your inbox.';
}
exports.register = async (req, res, next) => {
  try {
    const name = clean(req.body?.name, 100);
    const studentId = clean(req.body?.studentId, 40);
    const email = clean(req.body?.email, 254).toLowerCase();
    const phone = clean(req.body?.phone, 30);
    const course = clean(req.body?.course, 100);
    const year = clean(req.body?.year, 20);
    const password = req.body?.password;
    if (!validStudent(studentId, email) || !validProfile({ name, phone, course, year })) {
      return res.status(400).json({ error: 'Use an 8-digit student number and its matching number.sherubtse@rub.edu.bt email, and complete all profile details.' });
    }
    if (!validPassword(password)) return res.status(400).json({ error: 'Password must have at least 10 characters, one uppercase letter, one digit, and one special character, and use at most 72 UTF-8 bytes.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await userModel.create([name, studentId, email, phone, course, year, passwordHash, req.body.notificationsEnabled === true]);
    if (req.session.user) req.session.user = null;
    const delivery = await codes.issue(email, 'verify');
    res.status(201).json({ verificationRequired: true, delivery: delivery.status,
      message: delivery.status === 'accepted' ? 'Account created. The email server accepted your verification email. Check your inbox and spam folder.' : 'Account created but not verified. ' + deliveryMessage(delivery.status) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account already uses that email or student ID. Try logging in.' });
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const email = clean(req.body?.email, 254).toLowerCase();
    const password = req.body?.password;
    if (!email || typeof password !== 'string') return res.status(400).json({ error: 'Enter your email and password.' });
    const result = await userModel.findByEmail([email]);
    if (!result.rows[0] || !validStudent(result.rows[0].student_id, result.rows[0].email) || !(await bcrypt.compare(password, result.rows[0].password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    if (!result.rows[0].email_verified) return res.status(403).json({ error: 'Verify your college email before signing in.', verificationRequired: true });
    await establishSession(req, publicUser(result.rows[0]));
    res.json({ user: req.session.user });
  } catch (error) { next(error); }
};

exports.resendVerification = async (req, res, next) => {
  try {
    const email = authEmail(req);
    if (!email) return res.status(400).json({ error: 'Enter your eight-digit-number.sherubtse@rub.edu.bt email.' });
    const result = await codes.issue(email, 'verify');
    const status = result.status === 'unconfigured' || result.status === 'failed' ? 503 : result.status === 'cooldown' ? 429 : 200;
    res.status(status).json({ status: result.status, [status >= 400 ? 'error' : 'message']: result.status === 'accepted' ? 'The email server accepted your verification email. Use the latest code within 10 minutes.' : deliveryMessage(result.status) });
  } catch (error) { next(error); }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    const email = authEmail(req);
    if (!email || !(await codes.consume(email, 'verify', req.body?.code))) return res.status(400).json({ error: 'The code is invalid, expired, already used, or has too many attempts. Request a new code.' });
    await activateConfiguredAdmin(email);
    res.json({ message: 'Email verified. You can now sign in.' });
  } catch (error) { next(error); }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const email = authEmail(req);
    if (!emailConfigured()) return res.status(503).json({ status: 'unconfigured', error: 'Email settings are missing or invalid. Password reset emails are unavailable until the project maintainer configures the email web app.' });
    // The response never varies with account existence, opt-in, cooldown or account-specific delivery results.
    if (email) await codes.issue(email, 'reset');
    res.json({ message: 'If an eligible account exists, a reset code has been requested. Check your inbox and spam folder. Delivery cannot be confirmed here for privacy. If no code arrives, sending may have failed; wait 60 seconds and try again or contact the project maintainer.' });
  } catch (error) { next(error); }
};

exports.resetPassword = async (req, res, next) => {
  try {
    if (!validPassword(req.body?.password)) return res.status(400).json({ error: 'Use at least 10 characters including an uppercase letter, a digit and a special character, and at most 72 UTF-8 bytes.' });
    const email = authEmail(req);
    if (!email || !(await codes.consume(email, 'reset', req.body?.code, req.body.password))) return res.status(400).json({ error: 'The code is invalid, expired, already used, or has too many attempts. Request a new code.' });
    res.json({ message: 'Password changed. All previous sign-ins have been revoked. Sign in with your new password. If your email is not verified, verify it first.' });
  } catch (error) { next(error); }
};

exports.me = (req, res) => res.json({ user: currentUser(req) });

exports.logout = (req, res, next) => req.session.destroy(error => {
  if (error) return next(error);
  res.clearCookie('sherubtse_lf.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ ok: true });
});