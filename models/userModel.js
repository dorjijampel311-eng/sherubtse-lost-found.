const { pool } = require('../db');
exports.create = (values = []) => pool.query(`INSERT INTO portal_users (name, student_id, email, phone, course, study_year, password_hash, notifications_enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *, (photo_data IS NOT NULL) AS has_photo`, values);

exports.findByEmail = (values = []) => pool.query('SELECT *, (photo_data IS NOT NULL) AS has_photo FROM portal_users WHERE email=$1', values);

exports.findById = (values = []) => pool.query('SELECT *, (photo_data IS NOT NULL) AS has_photo FROM portal_users WHERE id=$1', values);

exports.updateProfile = (values = []) => pool.query(`UPDATE portal_users SET name=$1,phone=$2,course=$3,study_year=$4,notifications_enabled=$5,
      photo_mime=CASE WHEN $6::boolean THEN $7 ELSE photo_mime END,photo_data=CASE WHEN $6::boolean THEN $8 ELSE photo_data END
      WHERE id=$9 RETURNING *, (photo_data IS NOT NULL) AS has_photo`, values);

exports.profilePhoto = (values = []) => pool.query('SELECT photo_mime,photo_data FROM portal_users WHERE id=$1', values);

exports.notificationRecipients = (excludeId = null) => pool.query(
  'SELECT id,student_id,email FROM portal_users WHERE notifications_enabled=TRUE AND email_verified=TRUE AND ($1::bigint IS NULL OR id<>$1)',
  [excludeId]
);
