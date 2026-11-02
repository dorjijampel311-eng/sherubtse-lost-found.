module.exports = (req, res, next) => {
  const state = req.app.locals.startup;
  if (state && !state.ready && req.path !== '/health') {
    res.set('Retry-After', '5');
    return res.status(503).json({ error: 'The service is waiting for its database. Please try again shortly.' });
  }
  next();
};
