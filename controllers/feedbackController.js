const feedbackModel = require('../models/feedbackModel');
const { currentUser } = require('../middleware/auth');
exports.submitFeedback = async (req, res, next) => {
  try {
    const { rating, message } = req.body || {};
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || typeof message !== 'string' || message.trim().length < 10 || message.length > 2000) {
      return res.status(400).json({ error: 'Choose a rating from 1 to 5 and write between 10 and 2,000 characters.' });
    }
    await feedbackModel.create([currentUser(req).id, rating, message.trim()]);
    res.status(201).json({ message: 'Thank you. Your feedback has been saved.' });
  } catch (error) { next(error); }
};
