require('./config/environment');
const { logError } = require('./lib/safeErrors');
const { startApplication, startupSettings } = require('./services/startupService');
async function start({ onRuntime } = {}) {
  let pool, runtime;
  try {
    if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error('Set SESSION_SECRET to a random value with at least 32 characters.');
    const settings = startupSettings();
    const database = require('./db'); pool = database.pool;
    const app = require('./app');
    const { bootstrapAdmin } = require('./services/adminBootstrap');
    const { emailConfiguration } = require('./email');
    console.log('PostgreSQL configuration:', JSON.stringify(database.databaseSummary));
    const mail = emailConfiguration();
    if (mail.configured) console.log('Email web app settings loaded. Delivery has not been tested.');
    else console.warn(`Email web app settings unavailable. Missing: ${mail.missing.join(', ') || 'none'}. Invalid: ${mail.invalid.join(', ') || 'none'}. Set these server-side variables and restart.`);
    runtime = await startApplication({ app, pool, initializeDatabase: database.initializeDatabase,
      bootstrapAdmin: async currentPool => {
        const admin = await bootstrapAdmin(currentPool);
        if (admin.status === 'pending') console.warn(admin.message);
        if (admin.status === 'promoted' || admin.status === 'ready') console.log('Configured administrator is ready. Sign in and open /admin.');
      }, startMaintenance: () => require('./services/returnedCleanup').startReturnedCleanup({ purge: () => require('./models/itemModel').deleteExpiredReturned() }), ...settings, onRuntime });
    return runtime;
  } catch (error) {
    if (pool && !pool.ending) {
      try { await pool.end(); } catch (cleanupError) { logError('Unable to close PostgreSQL pool:', cleanupError); }
    }
    throw error;
  }
}
if (require.main === module) {
  let runtime, stopping = false, forced;
  const stop = () => {
    if (!runtime) return;
    runtime.close().then(() => { clearTimeout(forced); process.exitCode = 0; }).catch(error => { logError('Shutdown failed:', error); process.exitCode = 1; });
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    stopping = true;
    forced = setTimeout(() => process.exit(1), 10000); forced.unref();
    stop();
  });
  start({ onRuntime: value => { runtime = value; if (stopping) stop(); } }).catch(error => {
    if (stopping && error.code === 'STARTUP_CANCELLED') return;
    logError('Unable to start the app:', error);
    if (error.code === 'EADDRINUSE') {
      console.error('The HTTP port is already in use. Stop the existing server with Ctrl+C in its terminal before running npm start again.');
    }
    process.exitCode = 1;
  });
}
// Existing tests/integrations can import app without starting a listener.
Object.defineProperty(module.exports, 'app', { enumerable: true, get: () => require('./app') });
module.exports.start = start;
