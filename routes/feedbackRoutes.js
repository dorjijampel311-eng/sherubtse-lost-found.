const router = require('express').Router();
const controller = require('../controllers/feedbackController');
const { requireUser } = require('../middleware/auth');
const { feedbackLimit } = require('../middleware/rateLimits');
router.post('/feedback', requireUser, feedbackLimit, controller.submitFeedback);
module.exports = router;
