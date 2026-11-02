/** Deploy as a web app: execute as the owner; allow backend requests without Google sign-in.
 * Set MAIL_WEB_APP_SECRET in Project Settings > Script Properties. Never paste it here.
 * Do not log request bodies: they contain private addresses, secrets and one-time codes.
 */
function doPost(event) {
  try {
    var configuredSecret = PropertiesService.getScriptProperties().getProperty('MAIL_WEB_APP_SECRET');
    if (!configuredSecret) return mailResponse_(false);
    var payload = JSON.parse(event.postData.contents);
    if (!payload || typeof payload.secret !== 'string' || payload.secret !== configuredSecret) return mailResponse_(false);
    if (typeof payload.to !== 'string' || !/^\d{8}\.sherubtse@rub\.edu\.bt$/.test(payload.to)) return mailResponse_(false);
    if (typeof payload.subject !== 'string' || !payload.subject.trim() || typeof payload.text !== 'string' || typeof payload.html !== 'string') return mailResponse_(false);
    MailApp.sendEmail({ to: payload.to, subject: payload.subject, body: payload.text,
      htmlBody: payload.html, name: 'sherubtse_lost_found' });
    return mailResponse_(true);
  } catch (error) {
    // Return no provider exceptions, addresses, request content or secrets.
    return mailResponse_(false);
  }
}
function mailResponse_(ok) {
  return ContentService.createTextOutput(JSON.stringify({ ok: ok })).setMimeType(ContentService.MimeType.JSON);
}
