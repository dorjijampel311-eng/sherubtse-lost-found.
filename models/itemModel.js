const { pool } = require('../db');
const itemColumns = `i.id, i.kind, i.title, i.category, i.description, i.location,
  i.item_date AS "itemDate", i.status, i.returned_at AS "returnedAt",
  (i.returned_at + INTERVAL '168 hours') AS "deleteAfter", i.phone_public AS "phonePublic",
  (i.photo_data IS NOT NULL) AS "hasPhoto", i.created_at AS "createdAt",
  u.id AS "ownerId", u.name, u.course,
  (SELECT COUNT(*)::int FROM item_comments c WHERE c.item_id=i.id) AS "commentCount",
  CASE WHEN $1::bigint IS NOT NULL THEN u.email ELSE NULL END AS email,
  CASE WHEN i.phone_public OR i.user_id = $1 THEN u.phone ELSE NULL END AS phone`;

exports.list = ({ mine, id, userId }) => {
  const byId = !mine && typeof id === 'string' && /^\d+$/.test(id);
  const where = mine ? 'WHERE i.user_id=$1' : byId ? 'WHERE i.id=$2' : "WHERE i.status='open'";
  return pool.query(`SELECT ${itemColumns} FROM item_reports i JOIN portal_users u ON u.id=i.user_id ${where} ORDER BY i.created_at DESC LIMIT 100`, [userId, ...(byId ? [id] : [])]);
};

exports.photo = (values = []) => pool.query('SELECT photo_mime,photo_data FROM item_reports WHERE id=$1 AND photo_data IS NOT NULL', values);

exports.create = (values = []) => pool.query(`INSERT INTO item_reports (user_id,kind,title,category,description,location,item_date,phone_public,photo_mime,photo_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, values);

exports.markReturned = (values = []) => pool.query("UPDATE item_reports SET status='returned',returned_at=CASE WHEN status='returned' THEN COALESCE(returned_at,NOW()) ELSE NOW() END WHERE id=$1 AND user_id=$2 RETURNING id,returned_at AS \"returnedAt\",(returned_at+INTERVAL '168 hours') AS \"deleteAfter\"", values);

exports.deleteOwned = (values = []) => pool.query('DELETE FROM item_reports WHERE id=$1 AND user_id=$2 RETURNING id', values);

exports.stats = (values = []) => pool.query(`SELECT
      COUNT(*) FILTER (WHERE kind='lost' AND status='open')::int AS lost,
      COUNT(*) FILTER (WHERE kind='found' AND status='open')::int AS found,
      COUNT(*) FILTER (WHERE status='returned')::int AS returned FROM item_reports`, values);

// The predicate deliberately excludes open posts and legacy records with no confirmed return time.
exports.deleteExpiredReturned = (database = pool) => database.query(`DELETE FROM item_reports WHERE id IN (
  SELECT id FROM item_reports WHERE status='returned' AND returned_at IS NOT NULL
    AND returned_at <= NOW()-INTERVAL '168 hours'
  ORDER BY returned_at LIMIT 200 FOR UPDATE SKIP LOCKED
)`);
