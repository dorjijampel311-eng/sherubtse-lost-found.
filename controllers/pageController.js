const { currentUser } = require('../middleware/auth');
// File names come only from the route allowlist, never from request input.
exports.render = file => (req, res) => res.render(file);
exports.admin = (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!currentUser(req)) return res.redirect('/login?next=admin');
  if (currentUser(req).role !== 'admin') return res.status(403).send('Administrator access is required.');
  res.render('admin');
};
exports.redirect = target => (req, res) => {
  // Keep item IDs and other query parameters in old bookmarks and email links.
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  res.redirect(308, target + query);
};
