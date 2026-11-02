require('../config/environment');
const userModel = require('../models/userModel');
const { validStudent } = require('../validation');
const { authEmail, foundItemEmail } = require('./emailTemplates');
function emailConfiguration() {
  const keys = ['MAIL_WEB_APP_URL', 'MAIL_WEB_APP_SECRET', 'APP_BASE_URL'];
  const missing = keys.filter(key => typeof process.env[key] !== 'string' || !process.env[key].trim());
  const invalid = [];
  for (const key of ['MAIL_WEB_APP_URL', 'APP_BASE_URL']) {
    if (missing.includes(key)) continue;
    try {
      const url = new URL(process.env[key]);
      const protocols = key === 'MAIL_WEB_APP_URL' ? ['https:'] : ['http:', 'https:'];
      if (!protocols.includes(url.protocol) || !url.hostname || url.username || url.password) invalid.push(key);
    } catch { invalid.push(key); }
  }
  return { configured: missing.length === 0 && invalid.length === 0, missing, invalid };
}
function emailConfigured() { return emailConfiguration().configured; }
function mailFailure(reason, httpStatus) {
  const diagnostic = { reason };
  if (Number.isInteger(httpStatus)) diagnostic.httpStatus = httpStatus;
  // Fixed reason codes only: never log recipients, message bodies, URLs, secrets or provider response text.
  console.warn('Email web app delivery failed:', JSON.stringify(diagnostic));
  return false;
}
async function postEmail({ to, subject, text, html = '' }) {
  if (!emailConfigured()) return false;
  try {
    // The web app contract has no attachment field. Use the existing public logo URL.
    const logoUrl = new URL('/Sherubtse_logo/images.jpg', process.env.APP_BASE_URL).href;
    const response = await fetch(process.env.MAIL_WEB_APP_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ secret: process.env.MAIL_WEB_APP_SECRET, to, subject, text,
        html: html.replaceAll('cid:sherubtse-logo', logoUrl) })
    });
    if (!response.ok) return mailFailure([401, 403].includes(response.status) ? 'WEB_APP_ACCESS_DENIED' : 'HTTP_ERROR', response.status);
    let result;
    try { result = await response.json(); }
    catch (error) { return mailFailure(['TimeoutError', 'AbortError'].includes(error?.name) ? 'TIMEOUT' : 'INVALID_JSON'); }
    if (result?.ok !== true) return mailFailure(result?.ok === false ? 'WEB_APP_REJECTED' : 'MISSING_SUCCESS_FLAG');
    return true;
  } catch (error) { return mailFailure(['TimeoutError', 'AbortError'].includes(error?.name) ? 'TIMEOUT' : 'NETWORK_ERROR'); }
}
async function notifyItem(item, kind) {
  if (kind === 'found' && !/^\d+$/.test(String(item.posterId))) return { status: 'failed', message: 'Your post was saved, but email notifications could not be sent.' };
  const { APP_BASE_URL } = process.env;
  if (!emailConfigured()) {
    return { status: 'unconfigured', message: 'Your post was saved. Email notifications are not configured.' };
  }
  try {
    const base = new URL(APP_BASE_URL);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid application URL');
    const url = new URL(`/browse?id=${encodeURIComponent(item.id)}`, base).href;
    const result = await userModel.notificationRecipients(kind === 'found' ? item.posterId : null);
    const recipients = result.rows.filter(user => validStudent(user.student_id, user.email) && (kind !== 'found' || String(user.id) !== String(item.posterId)));
    if (!recipients.length) return { status: 'empty', message: 'Your post was saved. No eligible students have notifications enabled.' };
    let accepted = 0;
    // Each message has one recipient; student addresses are never disclosed to others.
    for (let offset = 0; offset < recipients.length; offset += 3) {
      await Promise.all(recipients.slice(offset, offset + 3).map(async user => {
        try {
          const content = kind === 'found' ? foundItemEmail(item, APP_BASE_URL) : {
            subject: `Campus lost item: ${item.title.replace(/[\r\n]/g, ' ')}`,
            text: `A lost item was reported on the Sherubtse student community board.\n\nItem: ${item.title}\nCategory: ${item.category}\nLocation: ${item.location}\nDate: ${item.itemDate}\n\nView post: ${url}\n\nManage email notifications in your profile.`
          };
          if (kind === 'found' && content.html) {
            content.html = content.html.replaceAll('cid:found-item-photo', new URL(`/api/items/${encodeURIComponent(item.id)}/photo`, APP_BASE_URL).href);
          }
          if (await postEmail({ to: user.email, ...content })) accepted++;
        } catch { /* Report aggregate failure without logging credentials or recipients. */ }
      }));
    }
    return { status: accepted === recipients.length ? 'accepted' : 'failed', message: accepted === recipients.length
      ? `Your post was saved. The email server accepted ${accepted} notification(s); inbox delivery is not guaranteed.`
      : `Your post was saved. Email notifications failed for ${recipients.length - accepted} recipient(s); ${accepted} accepted by the email server.` };
  } catch {
    return { status: 'failed', message: 'Your post was saved, but email notifications could not be sent. Please contact the portal maintainer.' };
  }
}
async function sendAuthCode({ email, code, purpose }) {
  if (!emailConfigured()) return { status: 'unconfigured' };
  try {
    const content = authEmail({ code, purpose, baseUrl: process.env.APP_BASE_URL });
    return { status: await postEmail({ to: email, ...content }) ? 'accepted' : 'failed' };
  } catch { return { status: 'failed' }; }
}
const notifyLostItem = item => notifyItem(item, 'lost');
const notifyFoundItem = item => notifyItem(item, 'found');
module.exports = { notifyLostItem, notifyFoundItem, sendAuthCode, emailConfigured, emailConfiguration };
