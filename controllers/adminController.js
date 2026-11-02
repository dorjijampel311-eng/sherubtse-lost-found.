const adminModel = require('../models/adminModel');
const { validDate, photoMatches } = require('../lib/helpers');
const { categories } = require('../lib/itemRules');
const validId = value => typeof value === 'string' && /^[1-9]\d{0,17}$/.test(value);
exports.overview = async (req, res, next) => {
  try {
    const result = await adminModel.overview();
    res.json(result.rows[0]);
  } catch (error) { next(error); }
};
exports.listings = async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const before = req.query.before;
    if (typeof search !== 'string' || search.length>120 || (before !== undefined && !validId(before))) return res.status(400).json({ error: 'Invalid listing search or page.' });
    const result = await adminModel.listings({ search: search.trim(), before: before || null });
    const items = result.rows.slice(0,100);
    res.json({ items, hasMore: result.rows.length>100, nextCursor: items.at(-1)?.id || null });
  } catch (error) { next(error); }
};
exports.feedback = async (req, res, next) => {
  try {
    const result = await adminModel.feedback();
    res.json({ feedback: result.rows });
  } catch (error) { next(error); }
};

exports.listing = async (req,res,next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Listing not found.' });
    const result = await adminModel.listingById(req.params.id);
    if (!result.rowCount) return res.status(404).json({ error: 'Listing not found.' });
    res.json({ item: result.rows[0] });
  } catch (error) { next(error); }
};
exports.updateListing = async (req,res,next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Listing not found.' });
    const body = req.body || {};
    const allowed = new Set(['title','description','category','location','itemDate','kind','removePhoto']);
    if (Object.keys(body).some(key => !allowed.has(key))) return res.status(400).json({ error: 'Only listing details can be changed in this form.' });
    const fields = [['title',120],['description',1000],['category',40],['location',120]];
    if (fields.some(([key,max]) => typeof body[key] !== 'string' || !body[key].trim() || body[key].length>max)
      || !categories.has(body.category) || !['lost','found'].includes(body.kind) || !validDate(body.itemDate)) return res.status(400).json({ error: 'Check the title, description, category, location, date and report type.' });
    if (body.removePhoto !== undefined && !['on','true','false'].includes(body.removePhoto)) return res.status(400).json({ error: 'Invalid photo removal choice.' });
    const remove = ['on','true'].includes(body.removePhoto);
    if (remove && req.file) return res.status(400).json({ error: 'Choose either a replacement photo or remove photo, not both.' });
    if (!photoMatches(req.file)) return res.status(400).json({ error: 'Photo must be a valid JPG, PNG or WebP image.' });
    const result = await adminModel.updateListing([body.title.trim(),body.description.trim(),body.category,body.location.trim(),body.itemDate,body.kind,
      Boolean(req.file)||remove,req.file?.mimetype||null,req.file?.buffer||null,req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Listing not found.' });
    res.json({ ok: true, id: result.rows[0].id, message: 'Listing updated.' });
  } catch (error) { next(error); }
};
exports.deleteListing = async (req,res,next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Listing not found.' });
    if (req.body?.confirmed !== true) return res.status(400).json({ error: 'Confirm deleting this listing, its comments and photo.' });
    const result = await adminModel.deleteListing(req.params.id);
    if (!result.rowCount) return res.status(404).json({ error: 'Listing not found.' });
    res.json({ ok: true, message: 'Listing, comments and photo deleted.' });
  } catch (error) { next(error); }
};
