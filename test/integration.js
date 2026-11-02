require('dotenv').config();
const assert = require('node:assert/strict');
const { pool, initializeDatabase } = require('../db');
const userModel = require('../models/userModel');
const { once } = require('events');
const emailModule = require('../email');
const mailbox = [];
const foundEvents = [];
emailModule.emailConfigured = () => true;
emailModule.sendAuthCode = async mail => { mailbox.push(mail); return { status: 'accepted' }; };
emailModule.notifyLostItem = async () => { assert.fail('Lost posts must not send notifications.'); };
emailModule.notifyFoundItem = async item => { foundEvents.push(item); return { status: 'unconfigured', message: 'Mocked sender; no real mail.' }; };
const { app } = require('../server');
const crypto = require('node:crypto');
let base, server;
const users = [];
async function request(path, { cookie, json, ...options } = {}) {
  const response = await fetch(base + path, { ...options, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) }, ...(json ? { body: JSON.stringify(json) } : {}) });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
function profileForm(extra = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: 'Integration check', course: 'Chemistry', year: 'Year 2', phone: '+975 17123456', notificationsEnabled: 'false', ...extra })) form.set(key, value);
  return form;
}
function itemForm(kind = 'found') {
  const form = new FormData();
  for (const [key, value] of Object.entries({ kind, phonePublic: 'on', title: 'Temporary integration check', category: 'Other', description: 'Automatically removed after verification.', location: 'Test location', itemDate: '2026-10-31' })) form.set(key, value);
  return form;
}
(async () => {
  try {
    await initializeDatabase();
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await request('/health')).status, 200);
    for (const page of ['/', '/login', '/signup', '/verify', '/reset-password', '/profile', '/browse', '/about', '/my-items', '/report-lost', '/report-found']) {
      const response = await fetch(base + page); assert.equal(response.status, 200, page);
      const html = await response.text(); assert.ok(!/href=["'][^"']*\.html/.test(html), page + ' contains an old HTML link');
    }
    const old = await fetch(base + '/reset-password.html?from=email', { redirect: 'manual' });
    assert.equal(old.status, 308); assert.equal(old.headers.get('location'), '/reset-password?from=email');
    const oldHome = await fetch(base + '/index.html', { redirect: 'manual' }); assert.equal(oldHome.headers.get('location'), '/');
    assert.equal((await fetch(base + '/views/admin.html')).status, 404);
    assert.equal((await fetch(base + '/views/admin.ejs')).status, 404);
    assert.equal((await fetch(base + '/admin.ejs')).status, 404);
    const adminRedirect = await fetch(base + '/admin', { redirect: 'manual' });
    assert.equal(adminRedirect.status, 302); assert.equal(adminRedirect.headers.get('location'), '/login?next=admin');
    for (const endpoint of ['overview', 'listings', 'feedback']) assert.equal((await request('/api/admin/' + endpoint)).status, 401);
    const bad = await request('/api/auth/register', { method: 'POST', json: { studentId: '07240068', email: '07240069.sherubtse@rub.edu.bt' } });
    assert.equal(bad.status, 400);
    for (let i = 0; i < 2; i++) {
      const studentId = String(crypto.randomInt(10000000, 99999999));
      const password = 'A1!' + crypto.randomBytes(20).toString('hex');
      const result = await request('/api/auth/register', { method: 'POST', json: { studentId, email: `${studentId}.sherubtse@rub.edu.bt`, name: 'Integration check', phone: '+975 17123456', course: 'Chemistry', year: 'Year 2', password, role: 'admin' } });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      const email = `${studentId}.sherubtse@rub.edu.bt`;
      const userId = (await pool.query('SELECT id FROM portal_users WHERE email=$1', [email])).rows[0].id;
      const fixture = { id: userId, email, password }; users.push(fixture);
      assert.equal((await request('/api/auth/verify-email', { method: 'POST', json: { email, code: mailbox.at(-1).code } })).status, 200);
      const login = await request('/api/auth/login', { method: 'POST', json: { email, password } });
      assert.equal(login.status, 200); fixture.cookie = login.cookie;
      assert.ok(fixture.cookie);
    }
    const [owner, other] = users;
    // Check recipient policy against PostgreSQL, without sending any email.
    await pool.query('UPDATE portal_users SET notifications_enabled=TRUE WHERE id=$1', [other.id]);
    let eligible = (await userModel.notificationRecipients(owner.id)).rows;
    assert.ok(eligible.some(user => user.id === other.id));
    assert.equal(eligible.find(user => user.id === other.id).email, other.email);
    assert.ok(!eligible.some(user => user.id === owner.id));
    await pool.query('UPDATE portal_users SET email_verified=FALSE WHERE id=$1', [other.id]);
    eligible = (await userModel.notificationRecipients(owner.id)).rows;
    assert.ok(!eligible.some(user => user.id === other.id));
    await pool.query('UPDATE portal_users SET email_verified=TRUE,notifications_enabled=FALSE WHERE id=$1', [other.id]);
    eligible = (await userModel.notificationRecipients(owner.id)).rows;
    assert.ok(!eligible.some(user => user.id === other.id));
    console.log('PASS: recipients use registered email addresses and exclude unverified, opted-out and posting accounts.');

    const ordinary = await request('/api/auth/me', { cookie: owner.cookie }); assert.equal(ordinary.data.user.role, 'user');
    for (const endpoint of ['overview', 'listings', 'feedback']) assert.equal((await request('/api/admin/' + endpoint, { cookie: owner.cookie })).status, 403);
    assert.equal((await fetch(base + '/admin', { headers: { Cookie: owner.cookie } })).status, 403);
    assert.equal((await request('/api/profile', { method: 'PUT', cookie: owner.cookie, body: profileForm({ role: 'admin' }) })).status, 400);

    assert.equal((await request('/api/feedback', { method: 'POST', json: { rating: 4, message: 'Helpful campus board.' } })).status, 401);
    assert.equal((await request('/api/feedback', { method: 'POST', cookie: owner.cookie, json: { rating: 6, message: 'Helpful campus board.' } })).status, 400);
    assert.equal((await request('/api/feedback', { method: 'POST', cookie: owner.cookie, json: { rating: 4, message: 'Short' } })).status, 400);
    assert.equal((await request('/api/feedback', { method: 'POST', cookie: owner.cookie, json: { rating: 4, message: 'Helpful campus board.', userId: other.id } })).status, 201);
    const feedback = await pool.query('SELECT user_id,rating,message FROM portal_feedback WHERE user_id=$1', [owner.id]);
    assert.equal(feedback.rows.length, 1);
    assert.equal(feedback.rows[0].user_id, owner.id);
    assert.equal(feedback.rows[0].rating, 4);
    assert.equal(feedback.rows[0].message, 'Helpful campus board.');
    console.log('PASS: feedback authentication, validation, persistence and session-based ownership.');
    // Grant and revoke a role only for this disposable test fixture, never for real accounts.
    await pool.query("UPDATE portal_users SET role='admin' WHERE id=$1", [owner.id]);
    assert.equal((await fetch(base + '/admin', { headers: { Cookie: owner.cookie } })).status, 200);
    assert.equal((await request('/api/admin/overview', { cookie: owner.cookie })).status, 200);
    const review = await request('/api/admin/feedback', { cookie: owner.cookie });
    assert.equal(review.status, 200); assert.ok(review.data.feedback.some(entry => entry.message === 'Helpful campus board.'));
    assert.equal((await request('/api/admin/listings', { cookie: owner.cookie })).status, 200);
    await pool.query("UPDATE portal_users SET role='user' WHERE id=$1", [owner.id]);
    assert.equal((await request('/api/admin/feedback', { cookie: owner.cookie })).status, 403);
    console.log('PASS: clean page URLs, old email redirects, protected admin pages/APIs, role escalation rejection, live role revocation and private feedback review.');

    const login = await request('/api/auth/login', { method: 'POST', json: { email: owner.email, password: owner.password } });
    assert.equal(login.status, 200);
    await request('/api/auth/logout', { method: 'POST', cookie: login.cookie });
    const db = await pool.query('SELECT password_hash FROM portal_users WHERE id=$1', [owner.id]);
    assert.match(db.rows[0].password_hash, /^\$2/);
    assert.equal((await request('/api/profile', { method: 'PUT', cookie: owner.cookie, body: profileForm({ email: 'changed@example.test' }) })).status, 400);
    assert.equal((await request('/api/profile', { method: 'PUT', cookie: owner.cookie, body: profileForm({ year: 'Staff' }) })).status, 400);
    assert.equal((await request('/api/profile', { method: 'PUT', cookie: owner.cookie, body: profileForm() })).status, 200);
    assert.equal((await request('/api/profile', { method: 'PUT', body: profileForm() })).status, 401);
    for (const kind of ['lost', 'found']) {
      const missingPhoneConsent = itemForm(kind); missingPhoneConsent.delete('phonePublic');
      assert.equal((await request('/api/items', { method: 'POST', cookie: owner.cookie, body: missingPhoneConsent })).status, 400);
    }
    const legacy = await pool.query(`INSERT INTO item_reports(user_id,kind,title,category,description,location,item_date,phone_public)
      VALUES($1,'lost','Temporary old privacy check','Other','Legacy private listing','Test location','2026-11-02',FALSE) RETURNING id`, [owner.id]);
    assert.equal((await request('/api/items?id=' + legacy.rows[0].id)).data.items[0].phone, null);
    const invalid = itemForm(); invalid.set('photo', new Blob(['invalid'], { type: 'image/png' }), 'invalid.png');
    assert.equal((await request('/api/items', { method: 'POST', cookie: owner.cookie, body: invalid })).status, 400);
    const oversized = itemForm(); oversized.set('photo', new Blob([new Uint8Array(30 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
    assert.equal((await request('/api/items', { method: 'POST', cookie: owner.cookie, body: oversized })).status, 413);
    const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=', 'base64');
    const profilePhoto = profileForm(); profilePhoto.set('photo', new Blob([photo], { type: 'image/png' }), 'avatar.png');
    assert.equal((await request('/api/profile', { method: 'PUT', cookie: owner.cookie, body: profilePhoto })).data.user.hasPhoto, true);
    assert.equal((await fetch(base + '/api/profile/photo', { headers: { Cookie: owner.cookie } })).status, 200);
    const valid = itemForm(); valid.set('photo', new Blob([photo], { type: 'image/png' }), 'pixel.png');
    const created = await request('/api/items', { method: 'POST', cookie: owner.cookie, body: valid });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const id = created.data.id;
    assert.equal((await request(`/api/items/${legacy.rows[0].id}/comments`, { method: 'POST', cookie: other.cookie, json: { body: 'Comment on a lost item.' } })).status, 201);
    const commentPath = `/api/items/${id}/comments`;
    assert.equal((await request(commentPath, { method: 'POST', json: { body: 'Test comment' } })).status, 401);
    for (const body of ['', '   ', 'x'.repeat(1001), 123]) assert.equal((await request(commentPath, { method: 'POST', cookie: other.cookie, json: { body } })).status, 400);
    assert.equal((await request('/api/items/999999999999/comments', { method: 'POST', cookie: other.cookie, json: { body: 'Missing listing' } })).status, 404);
    const comment = await request(commentPath, { method: 'POST', cookie: other.cookie, json: { body: '<script>example</script> A useful comment.', userId: owner.id } });
    assert.equal(comment.status, 201);
    const thread = await request(commentPath); assert.equal(thread.status, 200); assert.equal(thread.data.comments.length, 1); assert.equal(thread.data.total, 1);
    assert.equal(thread.data.comments[0].userId, other.id); assert.equal(thread.data.comments[0].name, 'Integration check');
    assert.equal(thread.data.comments[0].phone, undefined); assert.equal(thread.data.comments[0].email, undefined);
    const profilePath = `/api/items/${id}/commenters/${other.id}`;
    assert.equal((await request(profilePath)).status, 401);
    const contact = await request(profilePath, { cookie: owner.cookie }); assert.equal(contact.status, 200);
    assert.equal(contact.data.user.phone, '+975 17123456'); assert.equal(contact.data.user.course, 'Chemistry'); assert.equal(contact.data.user.year, 'Year 2');
    for (const field of ['email','student_id','password_hash','role']) assert.equal(contact.data.user[field], undefined);
    assert.equal((await request(`/api/items/${id}/commenters/${owner.id}`, { cookie: other.cookie })).status, 404);
    assert.equal((await request('/api/items?id='+id)).data.items[0].commentCount, 1);
    await pool.query('INSERT INTO item_comments(item_id,user_id,body) SELECT $1,$2,\'Temporary page comment\' FROM generate_series(1,51)', [id,other.id]);
    const page = await request(commentPath); assert.equal(page.data.comments.length, 50); assert.equal(page.data.hasMore, true);
    const olderPage = await request(commentPath+'?before='+page.data.nextCursor); assert.equal(olderPage.data.comments.length, 2); assert.equal(olderPage.data.hasMore, false);
    assert.equal((await request(commentPath+'?before=bad')).status, 400);
    console.log('PASS: comments authentication, validation, session author identity, pagination, commenter profile privacy and live account details.');

    assert.equal(foundEvents.length, 1);
    assert.equal(foundEvents[0].id, id);
    assert.equal(foundEvents[0].posterId, owner.id);
    assert.equal(foundEvents[0].title, 'Temporary integration check');
    assert.equal(foundEvents[0].category, 'Other');
    assert.equal(foundEvents[0].description, 'Automatically removed after verification.');
    assert.equal(foundEvents[0].location, 'Test location');
    assert.equal(foundEvents[0].itemDate, '2026-10-31');
    assert.ok(foundEvents[0].photoData.equals(photo));
    assert.equal(foundEvents[0].photoMime, 'image/png');
    assert.equal(foundEvents[0].code, undefined);
    assert.equal(foundEvents[0].phone, undefined);
    console.log('PASS: found-item posting calls its separate notifier with saved item details and uploaded photo.');
    const anonymous = await request(`/api/items?id=${id}`);
    assert.equal(anonymous.data.items[0].phone, '+975 17123456'); assert.equal(anonymous.data.items[0].phonePublic, true); assert.equal(anonymous.data.items[0].email, null);
    const signed = await request(`/api/items?id=${id}`, { cookie: other.cookie });
    assert.equal(signed.data.items[0].email, owner.email);
    assert.equal((await fetch(base + `/api/items/${id}/photo`)).status, 200);
    assert.equal((await request(`/api/items/${id}`, { method: 'PATCH', cookie: other.cookie, json: { status: 'returned', confirmed: true } })).status, 404);
    assert.equal((await request(`/api/items/${id}`, { method: 'DELETE', cookie: other.cookie })).status, 404);
    assert.equal((await request(`/api/items/${id}`, { method: 'PATCH', cookie: owner.cookie, json: { status: 'returned' } })).status, 400);
    assert.equal((await pool.query('SELECT returned_at FROM item_reports WHERE id=$1', [id])).rows[0].returned_at, null);
    const returnResult = await request(`/api/items/${id}`, { method: 'PATCH', cookie: owner.cookie, json: { status: 'returned', confirmed: true } });
    assert.equal(returnResult.status, 200); assert.ok(returnResult.data.returnedAt);
    assert.equal(new Date(returnResult.data.deleteAfter) - new Date(returnResult.data.returnedAt), 7*24*60*60*1000);
    const repeatReturn = await request(`/api/items/${id}`, { method: 'PATCH', cookie: owner.cookie, json: { status: 'returned', confirmed: true } });
    assert.equal(repeatReturn.data.returnedAt, returnResult.data.returnedAt);
    // Shadow only this fixture owner's rows with an updatable temporary view.
    // Production cleanup runs unchanged, but cannot touch other students' data in this test.
    const retentionClient = await pool.connect();
    try {
      await retentionClient.query('BEGIN');
      await retentionClient.query("SELECT set_config('test.retention_owner',$1,true)", [String(owner.id)]);
      await retentionClient.query("CREATE TEMP VIEW item_reports AS SELECT * FROM public.item_reports WHERE user_id=current_setting('test.retention_owner')::bigint");
      const expired = await retentionClient.query(`INSERT INTO public.item_reports(user_id,kind,title,category,description,location,item_date,phone_public,photo_mime,photo_data,status,returned_at)
        SELECT user_id,kind,title,category,description,location,item_date,phone_public,photo_mime,photo_data,'returned',NOW()-INTERVAL '168 hours' FROM public.item_reports WHERE id=$1 RETURNING id`, [id]);
      const expiredId = expired.rows[0].id;
      await retentionClient.query("INSERT INTO item_comments(item_id,user_id,body) VALUES($1,$2,'Temporary expired comment')", [expiredId,owner.id]);
      assert.equal((await retentionClient.query('SELECT photo_data IS NOT NULL AS photo FROM item_reports WHERE id=$1', [expiredId])).rows[0].photo, true);
      await retentionClient.query("UPDATE public.item_reports SET returned_at=NOW()-INTERVAL '200 hours' WHERE id=$1", [legacy.rows[0].id]);
      const cleanup = await require('../models/itemModel').deleteExpiredReturned(retentionClient);
      assert.equal(cleanup.rowCount, 1);
      assert.equal((await retentionClient.query('SELECT id FROM item_reports WHERE id=$1', [expiredId])).rowCount, 0);
      assert.equal((await retentionClient.query('SELECT id FROM item_comments WHERE item_id=$1', [expiredId])).rowCount, 0);
      assert.equal((await retentionClient.query('SELECT id FROM item_reports WHERE id=$1', [legacy.rows[0].id])).rowCount, 1);
      assert.equal((await retentionClient.query('SELECT id FROM item_reports WHERE id=$1', [id])).rowCount, 1);
      assert.equal((await require('../models/itemModel').deleteExpiredReturned(retentionClient)).rowCount, 0);
    } finally { await retentionClient.query('ROLLBACK'); retentionClient.release(); }
    console.log('PASS: owner confirmation, persistent seven-day deadline, no countdown reset, expired post/image/comment deletion and protection of open or recent posts.');
    assert.equal((await request('/api/items', { cookie: owner.cookie })).data.items.some(item => item.id === id), false);
    assert.equal((await request('/api/items?mine=1', { cookie: owner.cookie })).data.items.some(item => item.id === id), true);
    assert.equal((await request(`/api/items/${id}`, { method: 'DELETE', cookie: owner.cookie })).status, 204);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM item_comments WHERE item_id=$1', [id])).rows[0].count, 0);
    const lost = await request('/api/items', { method: 'POST', cookie: owner.cookie, body: itemForm('lost') });
    assert.equal(lost.status, 201); assert.equal(lost.data.notification, null);
    assert.equal(foundEvents.length, 1, 'Only the newly created found listing sends an email event; lost posts, comments, returns and deletes do not.');
    console.log('PASS: only newly created FOUND posts trigger notification delivery.');
    console.log('PASS: PostgreSQL registration, hashed passwords, immutable identity, profile validation, sessions, listing/photo persistence, upload rejection, private contact details, ownership, returned/deleted posts, and unconfigured-email save path.');
  } finally {
    for (const user of users) {
      await request('/api/auth/logout', { method: 'POST', cookie: user.cookie });
      await pool.query('DELETE FROM portal_users WHERE id=$1', [user.id]);
    }
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
