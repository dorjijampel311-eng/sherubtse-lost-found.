const { pool } = require('../db');
exports.overview = (values = []) => pool.query(`SELECT
      (SELECT COUNT(*)::int FROM portal_users) AS students,
      (SELECT COUNT(*)::int FROM item_reports) AS listings,
      (SELECT COUNT(*)::int FROM portal_feedback) AS feedback`, values);

exports.listings = (values = []) => pool.query(`SELECT i.id,i.kind,i.title,i.category,i.description,i.location,i.status,
      i.item_date AS "itemDate",i.created_at AS "createdAt",u.name,u.course
      FROM item_reports i JOIN portal_users u ON u.id=i.user_id ORDER BY i.created_at DESC LIMIT 100`, values);

exports.feedback = (values = []) => pool.query(`SELECT f.id,f.rating,f.message,f.created_at AS "createdAt",u.name,u.course
      FROM portal_feedback f JOIN portal_users u ON u.id=f.user_id ORDER BY f.created_at DESC LIMIT 100`, values);
