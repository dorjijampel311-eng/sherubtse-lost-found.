const commentModel = require('../models/commentModel');
const { currentUser } = require('../middleware/auth');
const validId = value => typeof value === 'string' && /^[1-9]\d{0,17}$/.test(value);
exports.list = async (req,res,next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Listing not found.' });
    const before = req.query.before;
    if (before !== undefined && !validId(before)) return res.status(400).json({ error: 'Invalid comments page.' });
    const item = await commentModel.itemExists(req.params.id);
    if (!item.rowCount) return res.status(404).json({ error: 'Listing not found.' });
    const result = await commentModel.list(req.params.id,before || null);
    const comments = result.rows.slice(0,50).reverse();
    res.json({ comments, total: item.rows[0].total, hasMore: result.rows.length>50, nextCursor: comments[0]?.id || null });
  } catch (error) { next(error); }
};
exports.create = async (req,res,next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Listing not found.' });
    const body = req.body?.body;
    if (typeof body !== 'string' || !body.trim() || body.length>1000) return res.status(400).json({ error: 'Write a comment between 1 and 1,000 characters.' });
    const result = await commentModel.create(req.params.id,currentUser(req).id,body.trim());
    if (!result.rowCount) return res.status(404).json({ error: 'Listing not found.' });
    res.status(201).json({ id: result.rows[0].id, message: 'Comment posted.' });
  } catch (error) {
    if (error.code==='23503') return res.status(404).json({ error: 'Listing not found.' });
    next(error);
  }
};
