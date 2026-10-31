const router = require('express').Router();
const controller = require('../controllers/healthController');
router.get('/health', controller.health);
module.exports = router;
