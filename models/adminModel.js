const { pool } = require('../db');
exports.overview = (values = []) => pool.query(`SELECT
      (SELECT COUNT(*)::int FROM portal_users) AS students,
      (SELECT COUNT(*)::int FROM item_reports) AS listings,
      (SELECT COUNT(*)::int FROM portal_feedback) AS feedback`, values);

const listingFields = `i.id,i.kind,i.title,i.category,i.description,i.location,i.status,
  i.item_date::text AS "itemDate",i.created_at AS "createdAt",i.user_id AS "ownerId",
  (i.photo_data IS NOT NULL) AS "hasPhoto",i.returned_at AS "returnedAt",u.name,u.course`;
exports.listings = ({ search = '', before = null } = {}) => pool.query(`SELECT ${listingFields}
  FROM item_reports i JOIN portal_users u ON u.id=i.user_id
  WHERE ($1='' OR i.title ILIKE $2 OR i.id::text=$1) AND ($3::bigint IS NULL OR i.id<$3)
  ORDER BY i.id DESC LIMIT 101`, [search, '%'+search+'%', before]);
exports.listingById = id => pool.query(`SELECT ${listingFields} FROM item_reports i JOIN portal_users u ON u.id=i.user_id WHERE i.id=$1`, [id]);
exports.updateListing = values => pool.query(`UPDATE item_reports SET title=$1,description=$2,category=$3,location=$4,item_date=$5,kind=$6,
  photo_mime=CASE WHEN $7::boolean THEN $8 ELSE photo_mime END,
  photo_data=CASE WHEN $7::boolean THEN $9 ELSE photo_data END WHERE id=$10 RETURNING id`, values);
exports.deleteListing = id => pool.query('DELETE FROM item_reports WHERE id=$1 RETURNING id', [id]);

exports.feedback = (values = []) => pool.query(`SELECT f.id,f.rating,f.message,f.created_at AS "createdAt",u.name,u.course
      FROM portal_feedback f JOIN portal_users u ON u.id=f.user_id ORDER BY f.created_at DESC LIMIT 100`, values);
