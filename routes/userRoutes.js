const router = require('express').Router();
const controller = require('../controllers/userController');
const { requireUser } = require('../middleware/auth');
const upload = require('../middleware/upload');
router.put('/profile', requireUser, upload.single('photo'), controller.updateProfile);
router.get('/profile/photo', requireUser, controller.profilePhoto);
module.exports = router;
