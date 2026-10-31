const router = require('express').Router();
const controller = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/auth');
router.use(requireAdmin);
router.get('/overview', controller.overview);
router.get('/listings', controller.listings);
router.get('/feedback', controller.feedback);
module.exports = router;
