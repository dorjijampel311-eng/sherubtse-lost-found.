const crypto = require('crypto');
const bcrypt = require('bcryptjs');
// Dependencies are injectable so tests never need to send real mail.
function createCodeService({ pool, sendAuthCode, emailConfigured }) {
  async function issue(email, purpose) {
    if (!emailConfigured()) return { status: 'unconfigured' };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock the account to serialize resends, consumption and password changes.
      const { rows } = await client.query('SELECT id,email_verified,student_id,email FROM portal_users WHERE email=$1 FOR UPDATE', [email]);
      const user = rows[0];
      const { validStudent } = require('../validation');
      if (!user || !validStudent(user.student_id, user.email) || (purpose === 'verify' && user.email_verified)) {
        await client.query('COMMIT'); return { status: 'ineligible' };
      }
      const previous = await client.query("SELECT sent_at > NOW() - INTERVAL '60 seconds' AS cooling FROM portal_auth_codes WHERE user_id=$1 AND purpose=$2", [user.id, purpose]);
      if (previous.rows[0]?.cooling) { await client.query('COMMIT'); return { status: 'cooldown' }; }
      const code = String(crypto.randomInt(0, 100000000)).padStart(8, '0');
      const hash = await bcrypt.hash(code, 12);
      const minutes = purpose === 'verify' ? 10 : 30;
      await client.query(`INSERT INTO portal_auth_codes (user_id,purpose,code_hash,expires_at) VALUES ($1,$2,$3,NOW()+$4::int*INTERVAL '1 minute')
        ON CONFLICT (user_id,purpose) DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,sent_at=NOW(),attempts=0,used_at=NULL`, [user.id, purpose, hash, minutes]);
      let delivery;
      try { delivery = await sendAuthCode({ email, code, purpose }); } catch { delivery = { status: 'failed' }; }
      if (delivery.status !== 'accepted') {
        // An unsuccessful request cannot leave an active code or make an older code usable.
        await client.query('UPDATE portal_auth_codes SET used_at=NOW() WHERE user_id=$1 AND purpose=$2', [user.id, purpose]);
      }
      await client.query('COMMIT');
      return { status: delivery.status };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function consume(email, purpose, code, password) {
    if (typeof code !== 'string' || !/^\d{8}$/.test(code)) return false;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query('SELECT id FROM portal_users WHERE email=$1 FOR UPDATE', [email]);
      const user = userResult.rows[0];
      if (!user) { await client.query('COMMIT'); return false; }
      const result = await client.query('SELECT *, expires_at > NOW() AS active FROM portal_auth_codes WHERE user_id=$1 AND purpose=$2 FOR UPDATE', [user.id, purpose]);
      const record = result.rows[0];
      if (!record || !record.active || record.used_at || record.attempts >= 5) { await client.query('COMMIT'); return false; }
      const matches = await bcrypt.compare(code, record.code_hash);
      await client.query('UPDATE portal_auth_codes SET attempts=attempts+1 WHERE user_id=$1 AND purpose=$2', [user.id, purpose]);
      if (!matches) { await client.query('COMMIT'); return false; }
      await client.query('UPDATE portal_auth_codes SET used_at=NOW() WHERE user_id=$1 AND purpose=$2', [user.id, purpose]);
      if (purpose === 'verify') {
        await client.query('UPDATE portal_users SET email_verified=TRUE WHERE id=$1', [user.id]);
      } else {
        const { validPassword } = require('../validation');
        if (!validPassword(password)) throw new Error('Invalid reset password');
        const hash = await bcrypt.hash(password, 12);
        // Resetting a password revokes every existing login, including concurrent stale sessions.
        await client.query('UPDATE portal_users SET password_hash=$1,session_version=session_version+1 WHERE id=$2', [hash, user.id]);
      }
      await client.query('COMMIT'); return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  return { issue, consume };
}
module.exports = { createCodeService };
