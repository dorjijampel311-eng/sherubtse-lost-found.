module.exports = (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !req.get('origin')) return next();
  let origin;
  try { origin = new URL(req.get('origin')); } catch { return res.status(403).json({ error: 'Cross-site requests are not allowed.' }); }
  if (origin.host !== req.get('host') || !['http:', 'https:'].includes(origin.protocol)) return res.status(403).json({ error: 'Cross-site requests are not allowed.' });
  next();
};
