require('./config/environment');
const { Pool } = require('pg');
const { buildDatabaseConfig } = require('./config/database');
const { logError } = require('./lib/safeErrors');
const configuration = buildDatabaseConfig();
const pool = new Pool(configuration.options);

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portal_users (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      student_id VARCHAR(40) NOT NULL UNIQUE,
      email VARCHAR(254) NOT NULL UNIQUE,
      phone VARCHAR(30) NOT NULL,
      course VARCHAR(100) NOT NULL,
      study_year VARCHAR(20) NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS item_reports (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
      kind VARCHAR(5) NOT NULL CHECK (kind IN ('lost', 'found')),
      title VARCHAR(120) NOT NULL,
      category VARCHAR(40) NOT NULL,
      description VARCHAR(1000) NOT NULL DEFAULT '',
      location VARCHAR(120) NOT NULL,
      item_date DATE NOT NULL,
      status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'returned')),
      phone_public BOOLEAN NOT NULL DEFAULT FALSE,
      photo_mime VARCHAR(30),
      photo_data BYTEA,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK ((photo_data IS NULL AND photo_mime IS NULL) OR (photo_data IS NOT NULL AND photo_mime IN ('image/jpeg', 'image/png', 'image/webp')))
    );

    ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS photo_mime VARCHAR(30);
    ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS photo_data BYTEA;

    ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS role VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin'));
    ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS portal_auth_codes (
      user_id BIGINT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
      purpose VARCHAR(10) NOT NULL CHECK (purpose IN ('verify','reset')),
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
      used_at TIMESTAMPTZ,
      PRIMARY KEY (user_id,purpose)
    );

    CREATE TABLE IF NOT EXISTS portal_feedback (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
      rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      message VARCHAR(2000) NOT NULL CHECK (length(trim(message)) BETWEEN 10 AND 2000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS item_reports_created_idx ON item_reports(created_at DESC);
    CREATE INDEX IF NOT EXISTS item_reports_user_idx ON item_reports(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS item_reports_kind_status_idx ON item_reports(kind, status);
  `);
}

pool.on('error', error => logError('Unexpected PostgreSQL pool error:', error));

module.exports = { pool, initializeDatabase, databaseSummary: configuration.summary };
