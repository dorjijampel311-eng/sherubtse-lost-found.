const { pool } = require('../db');
exports.itemExists = id => pool.query('SELECT i.id,(SELECT COUNT(*)::int FROM item_comments c WHERE c.item_id=i.id) AS total FROM item_reports i WHERE i.id=$1', [id]);
exports.list = (itemId, before) => pool.query(`SELECT c.id,c.body,c.created_at AS "createdAt",u.id AS "userId",u.name
  FROM item_comments c JOIN portal_users u ON u.id=c.user_id
  WHERE c.item_id=$1 AND ($2::bigint IS NULL OR c.id<$2) ORDER BY c.id DESC LIMIT 51`, [itemId,before]);
exports.create = (itemId,userId,body) => pool.query(`INSERT INTO item_comments(item_id,user_id,body)
  SELECT id,$2,$3 FROM item_reports WHERE id=$1 RETURNING id`, [itemId,userId,body]);

exports.deleteOwned = (itemId,commentId,userId) => pool.query(
  'DELETE FROM item_comments WHERE item_id=$1 AND id=$2 AND user_id=$3 RETURNING id', [itemId,commentId,userId]
);
