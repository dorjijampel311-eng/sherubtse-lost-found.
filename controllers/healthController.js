const healthModel = require('../models/healthModel');
exports.health = async (req, res) => {
  try { await healthModel.check(); res.json({ ok: true, database: 'connected' }); }
  catch { res.status(503).json({ ok: false, database: 'unavailable' }); }
};
