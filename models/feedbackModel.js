const { pool } = require('../db');
exports.create = (values = []) => pool.query('INSERT INTO portal_feedback (user_id,rating,message) VALUES ($1,$2,$3)', values);
