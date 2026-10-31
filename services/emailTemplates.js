const path = require('path');
const logoPath = path.join(__dirname, '..', 'public', 'Sherubtse_logo', 'images.jpg');
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function logoAttachment() {
  return { filename: 'sherubtse-college-logo.jpg', path: logoPath, cid: 'sherubtse-logo', contentType: 'image/jpeg', contentDisposition: 'inline' };
}
function button(label, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#efc83f" style="border-radius:8px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:15px 24px;color:#302817;text-decoration:none;font-weight:bold;font-size:16px">${escapeHtml(label)}</a></td></tr></table>`;
}
function layout({ title, preheader, body, footer }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:0;background:#faf8f0;color:#302e27;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e7e0cd;border-top:5px solid #efc83f;border-radius:12px"><tr><td style="padding:28px 24px 18px;border-bottom:1px solid #eee8d7"><img src="cid:sherubtse-logo" width="72" height="72" alt="Sherubtse College logo" style="display:block;width:72px;height:72px;margin-bottom:12px"><p style="margin:0;font-size:19px;font-weight:bold">Sherubtse College</p><p style="margin:5px 0 0;font-size:14px;color:#806010">Lost &amp; Found &middot; Student community board</p></td></tr><tr><td style="padding:28px 24px;font-size:16px;line-height:1.65"><h1 style="margin:0 0 18px;font-size:27px;line-height:1.25;color:#302e27">${escapeHtml(title)}</h1>${body}</td></tr><tr><td style="padding:20px 24px;background:#fffaf0;border-top:1px solid #eee8d7;font-size:13px;line-height:1.6;color:#716c5e">${footer}</td></tr></table></td></tr></table></body></html>`;
}
function authEmail({ code, purpose, baseUrl }) {
  const verifying = purpose === 'verify';
  const title = verifying ? 'Verify your email' : 'Reset your password';
  const minutes = verifying ? 10 : 30;
  const link = new URL(verifying ? '/verify' : '/reset-password', baseUrl).href;
  const body = `<p>${verifying ? 'Welcome to the Sherubtse Lost &amp; Found community. Confirm your college email to finish setting up your account.' : 'Use this one-time code to choose a new password for your account.'}</p><p style="margin-bottom:8px">Your ${verifying ? 'verification' : 'password reset'} code:</p><div style="padding:20px 10px;background:#fff6d7;border:1px solid #e3cc7d;border-radius:8px;text-align:center;font-family:monospace;font-size:32px;letter-spacing:4px;font-weight:bold;color:#302817">${escapeHtml(code)}</div><p>This code expires in <strong>${minutes} minutes</strong> and can be used once. Enter it on the ${verifying ? 'email verification' : 'password reset'} page${verifying ? ' with your college email address' : ' with your registered email and new password'}.</p>${button(title, link)}<p style="font-size:13px;overflow-wrap:anywhere">Or open: <a href="${escapeHtml(link)}" style="color:#806010">${escapeHtml(link)}</a></p>`;
  return {
    subject: verifying ? 'Verify your Sherubtse student account' : 'Reset your Sherubtse board password',
    text: `Sherubtse College Lost & Found\n\n${title}\n\nYour ${verifying ? 'verification' : 'password reset'} code is: ${code}\n\nIt expires in ${minutes} minutes and can be used once.\nEnter it at: ${link}\nUse your registered college email${verifying ? '' : ' and choose a new password'}.\n\nNever share this code. If you did not request it, ignore this email.`,
    html: layout({ title, preheader: `${title} with your one-time code. Expires in ${minutes} minutes.`, body, footer: 'Never share this code. If you did not request it, ignore this email.' }),
    attachments: [logoAttachment()]
  };
}
function foundItemEmail(item, baseUrl) {
  const link = new URL(`/browse?id=${encodeURIComponent(item.id)}`, baseUrl).href;
  const profileLink = new URL('/profile', baseUrl).href;
  const fields = [['Item', item.title], ['Category', item.category], ['Description', item.description], ['Location', item.location], ['Date found', item.itemDate]];
  const details = fields.map(([label, value]) => `<tr><td style="padding:12px 0;border-bottom:1px solid #eee8d7"><p style="margin:0;font-size:12px;font-weight:bold;color:#806010;text-transform:uppercase">${label}</p><p style="margin:5px 0 0;overflow-wrap:anywhere">${escapeHtml(value).replace(/\r?\n/g, '<br>')}</p></td></tr>`).join('');
  const attachments = [logoAttachment()];
  let photo = '';
  if (Buffer.isBuffer(item.photoData) && item.photoData.length && ['image/jpeg', 'image/png', 'image/webp'].includes(item.photoMime)) {
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[item.photoMime];
    attachments.push({ filename: `found-item.${extension}`, content: item.photoData, contentType: item.photoMime, cid: 'found-item-photo', contentDisposition: 'inline' });
    photo = `<p><img src="cid:found-item-photo" width="500" alt="Photo of ${escapeHtml(item.title)}" style="display:block;width:100%;max-width:500px;height:auto;border-radius:8px"></p><p style="font-size:13px;color:#716c5e">If your email app cannot display the photo, open the item on the website.</p>`;
  }
  return {
    subject: `Found on campus: ${String(item.title).replace(/[\r\n]/g, ' ')}`,
    text: `Sherubtse College Lost & Found\n\nSomeone has found this item. Does it belong to you?\n\n${fields.map(([label, value]) => `${label}: ${value}`).join('\n')}\n${photo ? '\nA photo is included with this email and is available on the website.\n' : ''}\nView found item: ${link}\n\nKeep an identifying detail private so you can confirm ownership.\nManage notification preferences: ${profileLink}`,
    html: layout({ title: 'Could this be yours?', preheader: 'Someone has found this item. Does it belong to you?', body: `<p>Someone has found this item. Does it belong to you?</p>${photo}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">${details}</table>${button('View found item', link)}<p style="font-size:13px;overflow-wrap:anywhere">Or open: <a href="${escapeHtml(link)}" style="color:#806010">${escapeHtml(link)}</a></p><p>Keep an identifying detail private so you can confirm ownership when you contact the poster through the website.</p>`, footer: `You received this because you enabled item notifications. <a href="${escapeHtml(profileLink)}" style="color:#806010">Manage your preferences</a> in your profile.` }),
    attachments
  };
}
module.exports = { authEmail, foundItemEmail };
