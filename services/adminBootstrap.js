const { validStudent } = require('../validation');
async function bootstrapAdmin(pool, emailValue = process.env.ADMIN_EMAIL) {
  const email = (emailValue || '').trim().toLowerCase();
  if (!email) return { status: 'unconfigured' };
  const match = /^(\d{8})\.sherubtse@rub\.edu\.bt$/.exec(email);
  if (!match || !validStudent(match[1], email)) throw new Error('ADMIN_EMAIL must be a registered Sherubtse student email.');
  const result = await pool.query(`UPDATE portal_users SET role='admin',session_version=session_version+1
    WHERE email=$1 AND email_verified=TRUE AND role<>'admin' RETURNING id`, [email]);
  if (result.rowCount) return { status: 'promoted' };
  const existing = await pool.query('SELECT role,email_verified FROM portal_users WHERE email=$1', [email]);
  if (existing.rows[0]?.role === 'admin' && existing.rows[0].email_verified) return { status: 'ready' };
  // Keep the app available so a new account can register and verify before restarting.
  return { status: 'pending', message: 'ADMIN_EMAIL has not been activated. Register and verify that account to activate admin access.' };
}
async function activateConfiguredAdmin(email) {
  const configured = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!configured || email !== configured) return;
  const { pool } = require('../db');
  return bootstrapAdmin(pool, configured);
}
module.exports = { bootstrapAdmin, activateConfiguredAdmin };
