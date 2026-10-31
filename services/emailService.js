const nodemailer = require('nodemailer');
const userModel = require('../models/userModel');
const { validStudent } = require('../validation');
const { authEmail, foundItemEmail } = require('./emailTemplates');
async function notifyItem(item, kind) {
  if (kind === 'found' && !/^\d+$/.test(String(item.posterId))) return { status: 'failed', message: 'Your post was saved, but email notifications could not be sent.' };
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM, APP_BASE_URL } = process.env;
  if (!emailConfigured()) {
    return { status: 'unconfigured', message: 'Your post was saved. Email notifications are not configured.' };
  }
  let transport;
  try {
    const base = new URL(APP_BASE_URL);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid application URL');
    const url = new URL(`/browse?id=${encodeURIComponent(item.id)}`, base).href;
    const result = await userModel.notificationRecipients(kind === 'found' ? item.posterId : null);
    const recipients = result.rows.filter(user => validStudent(user.student_id, user.email) && (kind !== 'found' || String(user.id) !== String(item.posterId)));
    if (!recipients.length) return { status: 'empty', message: 'Your post was saved. No eligible students have notifications enabled.' };
    transport = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: process.env.SMTP_SECURE === 'true',
      requireTLS: process.env.SMTP_SECURE !== 'true', auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
      pool: true, maxConnections: 3, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    let accepted = 0;
    // Each message has one recipient; student addresses are never disclosed to others.
    for (let offset = 0; offset < recipients.length; offset += 3) {
      await Promise.all(recipients.slice(offset, offset + 3).map(async user => {
        try {
          const content = kind === 'found' ? foundItemEmail(item, APP_BASE_URL) : {
            subject: `Campus lost item: ${item.title.replace(/[\r\n]/g, ' ')}`,
            text: `A lost item was reported on the Sherubtse student community board.\n\nItem: ${item.title}\nCategory: ${item.category}\nLocation: ${item.location}\nDate: ${item.itemDate}\n\nView post: ${url}\n\nManage email notifications in your profile.`
          };
          const info = await transport.sendMail({ from: EMAIL_FROM, to: user.email, ...content });
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
function emailConfigured() {
  const env = process.env;
  try {
    const base = new URL(env.APP_BASE_URL);
    return ['http:', 'https:'].includes(base.protocol) && [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASSWORD, env.EMAIL_FROM].every(Boolean)
      && Number.isInteger(Number(env.SMTP_PORT)) && Number(env.SMTP_PORT) > 0 && Number(env.SMTP_PORT) <= 65535
      && ['true', 'false'].includes(env.SMTP_SECURE);
  } catch { return false; }
}
async function sendAuthCode({ email, code, purpose }) {
  if (!emailConfigured()) return { status: 'unconfigured' };
  let transport;
  try {
    transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true', requireTLS: process.env.SMTP_SECURE !== 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    const content = authEmail({ code, purpose, baseUrl: process.env.APP_BASE_URL });
    const result = await transport.sendMail({ from: process.env.EMAIL_FROM, to: email, ...content });
    return { status: result.accepted?.length ? 'accepted' : 'failed' };
  } catch { return { status: 'failed' }; }
  finally { transport?.close(); }
}
const notifyLostItem = item => notifyItem(item, 'lost');
const notifyFoundItem = item => notifyItem(item, 'found');
module.exports = { notifyLostItem, notifyFoundItem, sendAuthCode, emailConfigured };
