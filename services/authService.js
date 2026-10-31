const { pool } = require('../db');
const { sendAuthCode, emailConfigured } = require('../email');
const { createCodeService } = require('./authCodeService');
module.exports = createCodeService({ pool, sendAuthCode, emailConfigured });
