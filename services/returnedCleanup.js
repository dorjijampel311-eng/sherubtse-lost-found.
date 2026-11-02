const { logError } = require('../lib/safeErrors');
async function startReturnedCleanup({ purge, intervalMs = 5*60*1000, timers = { setInterval, clearInterval }, logger = console }) {
  let active, timer, stopped = false;
  const run = () => {
    if (stopped) return Promise.resolve();
    if (active) return active;
    active = Promise.resolve().then(purge).catch(error => logError('Returned-post cleanup failed; will retry on the next run:', error, logger)).finally(() => { active = null; });
    return active;
  };
  await run();
  timer = timers.setInterval(() => { void run(); }, intervalMs);
  timer.unref?.();
  return { run, stop: async () => { stopped = true; timers.clearInterval(timer); if (active) await active; } };
}
module.exports = { startReturnedCleanup };
