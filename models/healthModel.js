const { pool } = require('../db');
exports.check = (values = []) => pool.query('SELECT 1', values);
