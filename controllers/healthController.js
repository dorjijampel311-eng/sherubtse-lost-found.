const healthModel = require('../models/healthModel');
exports.health = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.app.locals.startup && !req.app.locals.startup.ready) return res.status(503).json({ ok: false, database: 'unavailable' });
  try { await healthModel.check(); res.json({ ok: true, database: 'connected' }); }
  catch { res.status(503).json({ ok: false, database: 'unavailable' }); }
};
