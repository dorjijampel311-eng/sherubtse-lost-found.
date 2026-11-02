require('dotenv').config();
const app = require('./app');
const { pool, initializeDatabase } = require('./db');
const { bootstrapAdmin } = require('./services/adminBootstrap');
const PORT = Number(process.env.PORT || 3000);

async function start() {
  if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error('Set SESSION_SECRET to a random value with at least 32 characters.');
  await initializeDatabase();
  const admin = await bootstrapAdmin(pool);
  if (admin.status === 'pending') console.warn(admin.message);
  if (admin.status === 'promoted' || admin.status === 'ready') console.log('Configured administrator is ready. Sign in and open /admin.');
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sherubtse Lost & Found is ready: http://localhost:${PORT}`);
    console.log('Open the URL in your browser. Keep this terminal running; press Ctrl+C to stop.');
  });
}
if (require.main === module) start().catch(error => { console.error('Unable to start the app:', error.message); process.exit(1); });
module.exports = { app, start };
