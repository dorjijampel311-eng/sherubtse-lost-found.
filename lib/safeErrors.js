function redact(value, env = process.env) {
  let text = String(value || '').replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]');
  const sensitive = [];
  for (const [key, item] of Object.entries(env)) {
    if (item && /(?:PASSWORD|SECRET|TOKEN|API_KEY|DATABASE_URL|MAIL_WEB_APP_URL|SMTP_USER|EMAIL_FROM|ADMIN_EMAIL)$/.test(key)) sensitive.push(item);
  }
  try {
    const url = new URL(env.DATABASE_URL);
    for (const value of [url.username, url.password]) {
      if (value) { sensitive.push(value); sensitive.push(decodeURIComponent(value)); }
    }
  } catch { /* Malformed database URLs are still redacted as whole strings. */ }
  for (const item of [...new Set(sensitive)].sort((a, b) => b.length - a.length)) text = text.split(item).join('[REDACTED]');
  return text.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/([?&](?:password|secret|token|key)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]');
}
function safeError(error, env = process.env, depth = 0) {
  const result = { name: redact(error?.name || 'Error', env), code: redact(error?.code || 'UNSPECIFIED', env),
    message: redact(error?.message || (typeof error === 'string' ? error : 'No error message provided; inspect cause and nested errors.'), env),
    stack: redact(error?.stack || 'Stack not provided by the error source.', env) };
  if (depth < 3) {
    if (error?.cause) result.cause = safeError(error.cause, env, depth + 1);
    if (Array.isArray(error?.errors)) result.errors = error.errors.slice(0, 5).map(item => safeError(item, env, depth + 1));
  }
  return result;
}
function logError(label, error, logger = console) { logger.error(label, JSON.stringify(safeError(error), null, 2)); }
module.exports = { redact, safeError, logError };
