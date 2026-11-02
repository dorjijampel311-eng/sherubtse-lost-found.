const { integerSetting } = require('../config/database');
const { logError } = require('../lib/safeErrors');
function transient(error) {
  return ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN', 'ENOTFOUND', '57P03', '53300', '57014'].includes(error?.code)
    || /^08/.test(error?.code || '') || /connection.*timeout|timeout exceeded|timeout expired|query read timeout/i.test(error?.message || '')
    || (error?.cause && transient(error.cause)) || (Array.isArray(error?.errors) && error.errors.some(transient));
}
async function retryDatabase(operation, { attempts = 3, delayMs = 1000, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), logger = console } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (attempt === attempts || !transient(error)) throw error;
      logError(`Database startup attempt ${attempt}/${attempts} failed; retrying.`, error, logger);
      await sleep(Math.min(delayMs * 2 ** (attempt - 1), 5000));
    }
  }
}
function listen(app, port, host) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host);
    const failed = error => { server.removeListener('listening', ready); reject(error); };
    const ready = () => { server.removeListener('error', failed); resolve(server); };
    server.once('error', failed); server.once('listening', ready);
  });
}
async function startApplication({ app, pool, initializeDatabase, bootstrapAdmin, port, logger = console, retry = {}, onRuntime = () => {} }) {
  const state = app.locals.startup = { ready: false, shuttingDown: false };
  let server, closing;
  const close = () => {
    if (closing) return closing;
    state.ready = false; state.shuttingDown = true;
    closing = (async () => {
      if (server) await new Promise(resolve => {
        const timer = setTimeout(() => { server.closeAllConnections?.(); resolve(); }, 5000);
        server.close(() => { clearTimeout(timer); resolve(); });
        server.closeIdleConnections?.();
      });
      try { await app.locals.sessionStore?.close(); }
      finally { await pool.end(); }
    })();
    return closing;
  };
  try {
    server = await listen(app, port, '0.0.0.0');
    // A bound port is not readiness: all app routes stay unavailable until schema/admin setup succeeds.
    logger.log(`HTTP listener bound on 0.0.0.0:${server.address().port}; waiting for PostgreSQL readiness.`);
    onRuntime({ server, close, state });
    const checkClosing = () => {
      if (state.shuttingDown) { const error = new Error('Startup was cancelled during shutdown.'); error.code = 'STARTUP_CANCELLED'; throw error; }
    };
    await retryDatabase(async () => { checkClosing(); await initializeDatabase(); checkClosing(); await bootstrapAdmin(pool); }, { ...retry, logger });
    checkClosing();
    state.ready = true;
    logger.log(`Sherubtse Lost & Found is ready: http://localhost:${server.address().port}`);
    return { server, close, state };
  } catch (error) {
    try { await close(); } catch (cleanupError) { logError('Startup resource cleanup failed:', cleanupError, logger); }
    throw error;
  }
}
function startupSettings(env = process.env) {
  return { port: integerSetting(env.PORT, 3000, 'PORT', 0, 65535),
    retry: { attempts: integerSetting(env.DB_STARTUP_ATTEMPTS, 3, 'DB_STARTUP_ATTEMPTS', 1, 5),
      delayMs: integerSetting(env.DB_RETRY_DELAY_MS, 1000, 'DB_RETRY_DELAY_MS', 0, 5000) } };
}
module.exports = { startApplication, retryDatabase, startupSettings, transient };
