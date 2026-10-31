const nodemailer = require('nodemailer');
const { pool } = require('./db');
const { validStudent } = require('./validation');
async function notifyLostItem(item) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM, APP_BASE_URL } = process.env;
  if (![SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM, APP_BASE_URL].every(Boolean)) {
    return { status: 'unconfigured', message: 'Your post was saved. Email notifications are not configured.' };
  }
  let transport;
  try {
    const base = new URL(APP_BASE_URL);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid application URL');
    const url = new URL(`/browse.html?id=${encodeURIComponent(item.id)}`, base).href;
    const result = await pool.query('SELECT student_id,email FROM portal_users WHERE notifications_enabled=TRUE');
    const recipients = result.rows.filter(user => validStudent(user.student_id, user.email));
    if (!recipients.length) return { status: 'empty', message: 'Your post was saved. No eligible students have notifications enabled.' };
    transport = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: process.env.SMTP_SECURE === 'true',
      requireTLS: process.env.SMTP_SECURE !== 'true', auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
      pool: true, maxConnections: 3, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    let accepted = 0;
    // Each message has one recipient; student addresses are never disclosed to others.
    for (let offset = 0; offset < recipients.length; offset += 3) {
      await Promise.all(recipients.slice(offset, offset + 3).map(async user => {
        try {
          const info = await transport.sendMail({ from: EMAIL_FROM, to: user.email,
            subject: `Campus lost item: ${item.title.replace(/[\r\n]/g, ' ')}`,
            text: `A lost item was reported on the Sherubtse student community board.\n\nItem: ${item.title}\nCategory: ${item.category}\nLocation: ${item.location}\nDate: ${item.itemDate}\n\nView post: ${url}\n\nManage email notifications in your profile.` });
          if (info.accepted?.length) accepted++;
        } catch { /* Report aggregate failure without logging credentials or recipients. */ }
      }));
    }
    return { status: accepted === recipients.length ? 'accepted' : 'failed', message: accepted === recipients.length
      ? `Your post was saved. The email server accepted ${accepted} notification(s); inbox delivery is not guaranteed.`
      : `Your post was saved. Email notifications failed for ${recipients.length - accepted} recipient(s); ${accepted} accepted by the email server.` };
  } catch {
    return { status: 'failed', message: 'Your post was saved, but email notifications could not be sent. Please contact the portal maintainer.' };
  } finally { transport?.close(); }
}
module.exports = { notifyLostItem };
