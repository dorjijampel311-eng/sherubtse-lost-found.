const userModel = require('../models/userModel');
const { currentUser } = require('../middleware/auth');
const { photoMatches, publicUser } = require('../lib/helpers');
const { validProfile } = require('../validation');
exports.updateProfile = async (req, res, next) => {
  try {
    if ('studentId' in req.body || 'email' in req.body || 'role' in req.body) return res.status(400).json({ error: 'Student number, college email and account role cannot be changed through profile settings.' });
    const { name, phone, course, year } = req.body;
    if (!validProfile({ name, phone, course, year }) || !['true', 'false'].includes(req.body.notificationsEnabled)) return res.status(400).json({ error: 'Check your name, programme, year and phone number.' });
    if (!photoMatches(req.file)) return res.status(400).json({ error: 'Photo must be a valid JPG, PNG, or WebP image.' });
    const result = await userModel.updateProfile([name.trim(), phone.trim(), course.trim(), year, req.body.notificationsEnabled === 'true', Boolean(req.file), req.file?.mimetype || null, req.file?.buffer || null, currentUser(req).id]);
    const updatedUser = publicUser(result.rows[0]);
    if (updatedUser.sessionVersion !== currentUser(req).sessionVersion) {
      req.session.user = null; return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
    }
    req.session.user = updatedUser;
    res.json({ user: currentUser(req) });
  } catch (error) { next(error); }
};

exports.profilePhoto = async (req, res, next) => {
  try {
    const result = await userModel.profilePhoto([currentUser(req).id]);
    if (!result.rows[0]?.photo_data) return res.status(404).end();
    res.set({ 'Content-Type': result.rows[0].photo_mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.send(result.rows[0].photo_data);
  } catch (error) { next(error); }
};

exports.commenterProfile = async (req,res,next) => {
  try {
    if (![req.params.id,req.params.userId].every(value => /^[1-9]\d{0,17}$/.test(value))) return res.status(404).json({ error: 'Commenter not found.' });
    const result = await userModel.commenterProfile(req.params.id,req.params.userId);
    if (!result.rows[0]) return res.status(404).json({ error: 'Commenter not found.' });
    res.json({ user: result.rows[0] });
  } catch (error) { next(error); }
};
