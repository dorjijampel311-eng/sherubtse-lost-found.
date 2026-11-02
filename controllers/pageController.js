const { currentUser } = require('../middleware/auth');
function renderPage(req,res,file) {
  const navUser = currentUser(req);
  // This presentation-only cookie never determines authentication or access.
  const navOpen = /(?:^|;\s*)sherubtse_nav_open=1(?:;|$)/.test(req.headers.cookie || '');
  // Inert JSON bootstraps the same verified state used for the first HTML render.
  const sessionJSON = JSON.stringify(navUser).replace(/[<>&\u2028\u2029]/g, character => '\\u'+character.charCodeAt(0).toString(16).padStart(4,'0'));
  res.set('Cache-Control','private, no-store'); res.vary('Cookie');
  const currentPage = file==='index' ? '/' : file==='contact' ? '/about' : '/'+file;
  res.render(file,{ navUser,currentPage,sessionJSON,navOpen });
}
// File names come only from the route allowlist, never from request input.
exports.render = file => (req,res) => renderPage(req,res,file);
exports.admin = (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!currentUser(req)) return res.redirect('/login?next=admin');
  if (currentUser(req).role !== 'admin') return res.status(403).send('Administrator access is required.');
  renderPage(req,res,'admin');
};
exports.redirect = target => (req, res) => {
  // Keep item IDs and other query parameters in old bookmarks and email links.
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  res.redirect(308, target + query);
};
