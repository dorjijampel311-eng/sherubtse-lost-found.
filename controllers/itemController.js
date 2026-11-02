const itemModel = require('../models/itemModel');
const { currentUser } = require('../middleware/auth');
const { clean, validDate, photoMatches } = require('../lib/helpers');
const categories = new Set(['Electronics', 'ID cards & wallets', 'Bags', 'Books & notes', 'Keys', 'Clothing', 'Sports equipment', 'Other']);

const { notifyLostItem, notifyFoundItem } = require('../email');
exports.listItems = async (req, res, next) => {
  try {
    const mine = req.query.mine === '1';
    if (mine && !currentUser(req)) return res.status(401).json({ error: 'Log in to see your posts.' });
    const result = await itemModel.list({ mine, id: req.query.id, userId: currentUser(req)?.id || null });
    res.json({ items: result.rows });
  } catch (error) { next(error); }
};

exports.itemPhoto = async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).end();
    const result = await itemModel.photo([req.params.id]);
    if (!result.rows[0]) return res.status(404).end();
    res.set({ 'Content-Type': result.rows[0].photo_mime, 'Content-Length': result.rows[0].photo_data.length, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    res.send(result.rows[0].photo_data);
  } catch (error) { next(error); }
};

exports.createItem = async (req, res, next) => {
  try {
    const kind = req.body?.kind;
    const title = clean(req.body?.title, 120);
    const category = clean(req.body?.category, 40);
    const description = clean(req.body?.description, 1000);
    const location = clean(req.body?.location, 120);
    const itemDate = req.body?.itemDate;
    if (!['lost', 'found'].includes(kind) || !title || !description || !categories.has(category) || !location || !validDate(itemDate)) {
      return res.status(400).json({ error: 'Check the item name, category, location, and date.' });
    }
    if (req.file && !photoMatches(req.file)) return res.status(400).json({ error: 'Photo must be a valid JPG, PNG, or WebP image.' });
    if (req.body?.phonePublic !== 'on') return res.status(400).json({ error: 'Phone sharing is required. Confirm that your phone number will appear publicly on this listing.' });
    if (!currentUser(req).phone?.trim()) return res.status(400).json({ error: 'Add a phone number to your profile before posting.' });
    const phonePublic = true;
    const photoMime = req.file?.mimetype || null;
    const photoData = req.file?.buffer || null;
    const result = await itemModel.create([currentUser(req).id, kind, title, category, description, location, itemDate, phonePublic, photoMime, photoData]);
    const notificationItem = { id: result.rows[0].id, title, category, description, location, itemDate, photoData, photoMime, posterId: currentUser(req).id };
    const notification = kind === 'found' ? await notifyFoundItem(notificationItem) : await notifyLostItem(notificationItem);
    res.status(201).json({ id: result.rows[0].id, notification });
  } catch (error) { next(error); }
};

exports.markReturned = async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id) || req.body?.status !== 'returned') return res.status(400).json({ error: 'Invalid listing update.' });
    const result = await itemModel.markReturned([req.params.id, currentUser(req).id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Your listing could not be found.' });
    res.json({ ok: true });
  } catch (error) { next(error); }
};

exports.deleteItem = async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Listing not found.' });
    const result = await itemModel.deleteOwned([req.params.id, currentUser(req).id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Your listing could not be found.' });
    res.status(204).end();
  } catch (error) { next(error); }
};

exports.stats = async (req, res, next) => {
  try {
    const result = await itemModel.stats();
    res.json(result.rows[0]);
  } catch (error) { next(error); }
};
