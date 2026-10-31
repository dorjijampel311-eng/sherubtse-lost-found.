const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');
const authLimitMessage = { error: 'Too many requests. Please wait before trying again.' };
const codeRequestLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false, message: authLimitMessage });
const codeAttemptLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: authLimitMessage });
const emailRequestLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => crypto.createHash('sha256').update(String(req.body?.email || '').trim().toLowerCase()).digest('hex'), message: authLimitMessage });
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const registerLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false });
const createReportLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false });
const feedbackLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });

module.exports = { codeRequestLimit, codeAttemptLimit, emailRequestLimit, loginLimit, registerLimit, createReportLimit, feedbackLimit };
