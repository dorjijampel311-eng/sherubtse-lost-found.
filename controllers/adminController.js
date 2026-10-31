const adminModel = require('../models/adminModel');
exports.overview = async (req, res, next) => {
  try {
    const result = await adminModel.overview();
    res.json(result.rows[0]);
  } catch (error) { next(error); }
};
exports.listings = async (req, res, next) => {
  try {
    const result = await adminModel.listings();
    res.json({ items: result.rows });
  } catch (error) { next(error); }
};
exports.feedback = async (req, res, next) => {
  try {
    const result = await adminModel.feedback();
    res.json({ feedback: result.rows });
  } catch (error) { next(error); }
};
