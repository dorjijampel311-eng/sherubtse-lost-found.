function configurationError(message) {
  const error = new Error(message); error.name = 'DatabaseConfigurationError'; error.code = 'DB_CONFIG_INVALID'; return error;
}
function integerSetting(value, fallback, name, minimum, maximum) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) < minimum || Number(value) > maximum) throw configurationError(`${name} must be an integer between ${minimum} and ${maximum}.`);
  return Number(value);
}
function buildDatabaseConfig(env = process.env) {
  if (!env.DATABASE_URL || !env.DATABASE_URL.trim()) throw configurationError('DATABASE_URL is required. Set the PostgreSQL connection URL in the server environment.');
  let url;
  try { url = new URL(env.DATABASE_URL.trim()); } catch { throw configurationError('DATABASE_URL must be a valid PostgreSQL URL with percent-encoded credentials.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length < 2 || url.hash) throw configurationError('DATABASE_URL must specify a PostgreSQL protocol, user, hostname and database name, without a fragment.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const local = host === 'localhost' || host === '::1' || host === '0.0.0.0' || /^127\./.test(host);
  if (env.NODE_ENV === 'production' && local) throw configurationError('Production DATABASE_URL points to a loopback address. Set the actual hosted database URL.');
  const allowed = new Set(['sslmode', 'connect_timeout', 'application_name']);
  for (const key of url.searchParams.keys()) if (!allowed.has(key) || url.searchParams.getAll(key).length > 1) throw configurationError('Unsupported or duplicate DATABASE_URL query options. Supported: sslmode, connect_timeout, application_name. Configure TLS with PGSSLMODE.');
  const urlMode = url.searchParams.get('sslmode')?.toLowerCase();
  const envMode = env.PGSSLMODE?.trim().toLowerCase();
  if (envMode && urlMode && envMode !== urlMode) throw configurationError('PGSSLMODE conflicts with DATABASE_URL sslmode. Make them match or remove the URL sslmode option.');
  // Render private hostnames are reachable only from the same region/workspace.
  const renderInternal = /^dpg-[a-z0-9-]+$/i.test(host);
  const sslMode = envMode || urlMode || (local || renderInternal ? 'disable' : 'verify-full');
  if (!['disable', 'require', 'verify-full'].includes(sslMode)) throw configurationError('PGSSLMODE must be disable, require or verify-full.');
  let user, password, database;
  try { user = decodeURIComponent(url.username); password = decodeURIComponent(url.password); database = decodeURIComponent(url.pathname.slice(1)); }
  catch { throw configurationError('DATABASE_URL contains invalid percent-encoded credentials or database name.'); }
  const urlTimeout = url.searchParams.get('connect_timeout');
  const connectionTimeoutMillis = integerSetting(env.PGCONNECT_TIMEOUT_MS, urlTimeout ? integerSetting(urlTimeout, 10, 'DATABASE_URL connect_timeout', 1, 30) * 1000 : 10000, 'PGCONNECT_TIMEOUT_MS', 1000, 30000);
  // Explicit fields avoid connection-string options silently replacing the TLS object.
  const options = { host, port: integerSetting(url.port, 5432, 'DATABASE_URL port', 1, 65535), user, password, database,
    ssl: sslMode === 'disable' ? false : { rejectUnauthorized: sslMode === 'verify-full' },
    max: integerSetting(env.PGPOOL_MAX, 5, 'PGPOOL_MAX', 1, 20),
    idleTimeoutMillis: 30000, connectionTimeoutMillis,
    query_timeout: integerSetting(env.PGQUERY_TIMEOUT_MS, 15000, 'PGQUERY_TIMEOUT_MS', 1000, 60000),
    statement_timeout: integerSetting(env.PGQUERY_TIMEOUT_MS, 15000, 'PGQUERY_TIMEOUT_MS', 1000, 60000),
    keepAlive: true, application_name: url.searchParams.get('application_name') || 'sherubtse-lost-found' };
  return { options, summary: { target: local ? 'local' : renderInternal ? 'render-private' : 'remote', sslMode, poolMax: options.max, connectionTimeoutMillis, queryTimeoutMillis: options.query_timeout } };
}
module.exports = { buildDatabaseConfig, integerSetting };
