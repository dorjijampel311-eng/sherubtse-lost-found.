# Sherubtse College Lost & Found

A student community portal using Express, PostgreSQL, server-side sessions and the included college logo. Browse/search lost and found reports, post optional photos, manage your own posts, and update your profile and notification preferences. No sample listings are seeded.

## Set up in VS Code

1. Install Node.js 20+ and PostgreSQL. Open this folder in VS Code and choose Terminal > New Terminal.
2. Run `npm ci`.
3. If `.env` does not exist, run `Copy-Item .env.example .env` in PowerShell. Do not overwrite an existing configuration.
4. In pgAdmin, create `sherubtse_lost_found`. Set `DATABASE_URL` in `.env` to `postgresql://postgres:YOUR_PASSWORD@localhost:5432/sherubtse_lost_found` (URL-encode special password characters).
5. Set a random `SESSION_SECRET` of at least 32 characters. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Use `PGSSLMODE=disable` for local PostgreSQL; use `require` if a hosted provider requires TLS.
6. Run `npm run dev` or `npm start`. If Windows blocks watch-mode child processes, use `npm start`. Open http://localhost:3000 and check http://localhost:3000/health.
7. Run `npm run check` and `npm test`. `node test/integration.js` starts an isolated local server and checks PostgreSQL flows using temporary accounts and posts that are removed afterward, with all email mocked. Run this only against a development database.

Tables and additive profile/notification migrations run on startup. Back up production databases before updates. Existing users and reports are preserved; notifications default to off. Legacy accounts with nonmatching student identities cannot sign in or publish; a maintainer must resolve their ownership separately. Student identity fields cannot be changed through the profile API.

## Student accounts and privacy

Registration requires exactly eight digits, a matching email such as `07240068.sherubtse@rub.edu.bt`, full name, programme, year 1-4, phone and a password (at least 10 characters including one uppercase letter, one digit and one special character; at most 72 UTF-8 bytes). Both browser and server validate identities. Email verification confirms access to the student mailbox; it does not prove current enrollment. College SSO is not implemented.

Passwords use bcrypt hashes. PostgreSQL stores sessions; cookies are HTTP-only, SameSite=Lax and secure in production. Profile requests use the signed-in user's ID. Students can change their display name, programme, year, phone, profile photo and notification preference. College email and student number are immutable.

Item and profile photos accept JPEG, PNG and WebP, up to 2 MB, with server-side signature and MIME checks. Public listings show name and programme; college email appears to signed-in users, while a phone appears only if the poster chooses to share it for that listing. Verify ownership privately before handing over an item. This board supplies no official college contact details.

## Email configuration

Set these only in `.env` locally or Render Environment settings:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL (required) |
| `SESSION_SECRET` | Stable random secret, at least 32 characters (required in production) |
| `NODE_ENV` | `development` locally, `production` on Render |
| `PGSSLMODE` | `disable` locally or `require` for hosted TLS |
| `PORT` | Optional; defaults to 3000, Render supplies it |
| `PGPOOL_MAX` | Optional PostgreSQL pool size, default 10 |
| `SMTP_HOST` | SMTP provider hostname |
| `SMTP_PORT` | Usually 587 for STARTTLS, 465 for implicit TLS |
| `SMTP_SECURE` | `true` for implicit TLS (465); `false` uses required STARTTLS |
| `SMTP_USER` | SMTP account username |
| `SMTP_PASSWORD` | SMTP password or app password |
| `EMAIL_FROM` | Provider-verified sender address |
| `APP_BASE_URL` | App origin, e.g. http://localhost:3000 locally; actual HTTPS service origin on Render |

New lost posts notify email-verified eligible student accounts that opted in (including the poster if opted in). New found posts notify other email-verified Sherubtse student accounts that opted in, excluding the poster. Messages contain item name, category, location, date and a direct post link, without passwords or poster contact details. Each recipient receives a separate message. Missing configuration or sending errors are returned as warnings while the listing remains saved. SMTP acceptance is reported accurately and does not guarantee inbox delivery. Check provider logs and spam folders when testing.

Sending occurs during the publish request, in batches of three. This is suitable for a small campus pilot; larger recipient lists need a durable background queue, retry handling and provider rate-limit management. There is no automatic retry and no delivery/bounce tracking. Test using controlled mailboxes before enabling campus-wide notifications.

## GitHub from VS Code

`.env` and dependency folders are ignored; `.env.example` contains placeholders only. Review `git status` and `git diff` to ensure no secrets are staged. If needed, run `git init`, then `git add .` and `git commit -m "Update student lost and found portal"`. Create an empty GitHub repository and run `git remote add origin YOUR_REPOSITORY_URL`, `git branch -M main`, then `git push -u origin main`. For later changes, review, commit, and push. Never commit real email or database credentials.

## Render deployment

1. Create a Render PostgreSQL database and Web Service from your GitHub repository, using the same region. Set Root Directory only if this project is in a repository subfolder.
2. Build command: `npm ci`. Start command: `npm start`.
3. Set `DATABASE_URL` to the database's Internal Database URL, `NODE_ENV=production`, a strong stable `SESSION_SECRET`, and the appropriate `PGSSLMODE`.
4. Add the SMTP variables above and set `APP_BASE_URL` to the actual HTTPS Render service origin. Confirm your hosting plan supports the provider's SMTP connection and outbound ports.
5. Deploy, check `/health`, then test registration, login, profile update, posting with/without photos, private/public phone choices, ownership controls, returned/deleted posts and email opt-out using controlled student test accounts.

## Validation

`npm run check` checks all application JavaScript syntax. `npm test` covers identity/profile/password rules, notification and authentication email behavior, hashed codes, resend cooldown, five-attempt lockout, expiry, single use and password reset session-version changes with mocked database/SMTP boundaries. `npm run test:auth:db` starts an isolated server and checks the full verification/reset routes against your development PostgreSQL database using mocked email, then removes its test accounts. Full session, ownership, upload persistence and migration checks require PostgreSQL. Actual SMTP acceptance and mailbox delivery require real provider credentials and controlled student mailboxes. No GitHub push or deployment is performed by these checks.

## Student feedback

The About page accepts a 1-5 experience rating and 10-2,000 characters of feedback from signed-in students. Submissions are saved privately in `portal_feedback`, linked to the session account, with a limit of five per hour. They are not public testimonials, and no email or reply is promised. Authorized administrators can review private feedback in the read-only `/admin` dashboard. The table is created automatically at startup.

## Email verification and password recovery

On startup, additive migrations add `email_verified` (default false), `session_version` and `portal_auth_codes`. No accounts, profiles, feedback or posts are deleted. Existing accounts must verify their college email before signing in again; old sessions are invalidated. Back up a production database before applying migrations.

Registration creates an unverified account and emails an eight-digit code. The verification page accepts the code or lets the student request another. Verification expires after 10 minutes. Login remains blocked until verification succeeds. Missing email configuration or a rejected SMTP message leaves the account unverified and shows a warning; after fixing SMTP, use Verify your email on the login page to resend. Do not register the same account again.

Forgot password on the login page opens the password-reset screen. Request a code, then enter it with a new password and confirmation. Reset codes expire after 30 minutes and work once. Resets revoke all existing sign-ins. Resetting a password does not bypass email verification.

Codes are generated using cryptographic randomness, stored only as bcrypt hashes, and never returned by APIs or logged. Resending replaces the old code. Database row locks and transactions prevent concurrent reuse. Each code permits five incorrect attempts, with a 60-second resend cooldown enforced by PostgreSQL. HTTP request limits add 12 requests per IP per hour and 6 per email per hour; code checks permit 20 per IP per 15 minutes. IP/email counters are process-local, so use a shared rate-limit store before scaling to multiple app instances; per-code attempt and cooldown limits remain database-backed.

Use all seven email variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `APP_BASE_URL`. Port 587 normally uses `SMTP_SECURE=false` with required STARTTLS; port 465 uses `true`. Use a verified sender and the provider's SMTP/app password. Set `APP_BASE_URL=http://localhost:3000` locally, or the real HTTPS origin in production. `.env.example` intentionally has blank values only: fill your private `.env`; do not copy blank values over an existing configuration. Restart the server after changing environment settings.

For privacy, password-reset requests return identical messages for known/unknown addresses, cooldowns and recipient-specific sending failures. The page does not claim delivery: check inbox/spam, then retry later if no email arrives. Missing or invalid SMTP settings are a global error for every address. Registration and verification resend report delivery failures explicitly. SMTP acceptance does not guarantee mailbox delivery.

Run `npm run check`, `npm test`, `npm run test:auth:db`, and `node test/integration.js`. The database checks create and remove temporary fixtures; run them only with a development database. No test sends real email. Actual inbox delivery still needs a configured provider and controlled student mailboxes. There is no deployment or GitHub push in these commands.

## Project structure and clean URLs

The application follows the Zhenphen reference's separation of routes, controllers, models, middleware and views:

```text
server.js                Starts the server and initializes PostgreSQL
app.js                   Express configuration and router mounting
routes/                  Authentication, user, item, feedback, admin and page routes
controllers/             Request validation and HTTP responses by feature
models/                  Parameterized PostgreSQL queries
middleware/              Session refresh, user/admin access, uploads and rate limits
services/                Email delivery and verification/reset code transactions
views/                   EJS page templates rendered by page controllers
public/                  CSS, browser JavaScript and the college logo only
lib/                     Shared validation/photo/session helpers
scripts/check.js         JavaScript syntax checks
test/                    Mocked email tests and database integration checks
```

Page URLs use `/`, `/login`, `/signup`, `/verify`, `/reset-password`, `/profile`, `/browse`, `/my-items`, `/report-lost`, `/report-found`, `/about` and `/admin`. EJS templates stay in `views/`, matching the supplied Zhenphen-UIUX.zip reference; their extensions do not appear in public navigation or new emails. Old `.html` URLs redirect permanently to their clean equivalents, preserving query parameters, including existing emailed links. Views are not exposed as a static directory.

Email links use `APP_BASE_URL` plus `/verify`, `/reset-password` or `/browse?id=...`. For local development use `http://localhost:3000`; localhost links work only on the device running the server. A published app needs its actual reachable HTTPS origin in `APP_BASE_URL`. Restart after changing environment settings.

## User and administrator access

All existing and newly registered accounts default to `role='user'`. No account is automatically promoted. Registration ignores supplied role fields, and profile updates reject role changes. The admin router checks the verified session and administrator role on the server for every request. Roles are refreshed from PostgreSQL, so removing a role takes effect on the next request.

The administrator dashboard is read-only: account/listing/feedback totals, the latest 100 listings and the latest 100 private feedback submissions. It does not expose password hashes, verification codes, phone numbers or a user directory, and it does not delete or edit student content. Ordinary students retain control of their own profiles and posts.

To authorize an administrator, a trusted database maintainer can promote a specific existing, email-verified student account through PostgreSQL. Use a parameterized query in your database tool or replace the example address in this SQL with the intended account:

```sql
UPDATE portal_users SET role='admin'
WHERE email='YOUR_VERIFIED_COLLEGE_EMAIL' AND email_verified=TRUE;
```

Do not promote arbitrary accounts or add public role-management endpoints. To revoke access, set that account's role back to `user`. Sign in normally and open `/admin`; the Admin link appears for authorized accounts.

`npm run test:integration` checks clean routes, legacy redirects, role escalation rejection, administrator permissions and revocation, feedback review and the existing student posting/profile features using disposable database fixtures. All email is mocked. `npm run test:auth:db` checks the full verification/reset flows. Run these only against a development database.

The supplied Zhenphen reference uses EJS: Express sets `view engine` to `ejs`, page routes select a known template, and page controllers call `res.render()`. This project follows that setup. Templates live in `views/*.ejs`, assets in `public/`, and both JavaScript syntax and EJS template compilation are checked by `npm run check`. Public URLs remain extension-free; legacy `.html` links redirect to their canonical routes.

## Branded verification and found-item emails

`services/emailTemplates.js` builds separate authentication and found-item messages. Both include HTML and plain-text alternatives. The HTML uses a responsive table layout, readable text, cream/gold/charcoal styling, and the actual `public/Sherubtse_logo/images.jpg` logo as an inline CID attachment. No substitute logo is generated.

Verification mail has a clear heading, prominent one-time code, 10-minute expiry, and a `/verify` button. Password-reset mail retains its separate 30-minute code and `/reset-password` link using the same branded frame. Codes are generated by the existing code service, never by templates.

Found-item mail says ?Someone has found this item. Does it belong to you?? and includes item name, category, description, location, date found and a `/browse?id=...` link. If the post includes a validated photo, it is attached inline using its original bytes. Some email clients may not display WebP inline; the image is also available on the linked website. User text is HTML-escaped before rendering. Item emails include no verification/reset code, poster contact details or private account data. Recipients receive separate messages and cannot see other student addresses.

The existing SMTP settings are reused with no additional environment variables. Missing settings or send failures still leave posts saved and return a clear warning; SMTP acceptance is distinguished from confirmed inbox delivery. Notification preferences apply to both lost and found alerts.

`npm test` mocks Nodemailer's transport and checks the logo, HTML/plain-text versions, escaped item fields, optional photo, recipient exclusion, code separation and send failures. `npm run test:integration` mocks email delivery and checks that posting a found item invokes its notifier with the saved details and uploaded photo. No automated test sends real email. Actual inbox appearance remains dependent on the recipient's email client and needs a controlled mailbox check.

Notification delivery uses SMTP `sendMail` with each recipient's verified registered `portal_users.email` as the individual `to` address. The notification-preference checkbox controls these inbox emails. Accounts with `email_verified=FALSE` or `notifications_enabled=FALSE` are excluded in PostgreSQL before delivery. A found-item poster is also excluded. No separate personal-email field or alternative domain is introduced; the registered address remains the student's matching Sherubtse college email. SMTP acceptance is not proof of inbox delivery.

## Configure the administrator in .env

Set `ADMIN_EMAIL` in your private `.env` (or Render Environment) to the exact registered Sherubtse email of the intended administrator. That account must register and verify its email first. Restart the server: startup promotes that account to admin and revokes its earlier sessions. Sign in using the account's existing password and open `/admin`. No default password, duplicate account or fake student profile is created. `ADMIN_EMAIL` stays blank in `.env.example`.

If the account does not exist or is unverified, startup prints a pending-setup message and leaves it unprivileged. Verifying the configured account activates its admin role automatically; startup also activates it if it was verified previously. Restarts preserve existing admin passwords and sessions once the role is already assigned. Removing or changing `ADMIN_EMAIL` does not revoke a previously granted role automatically: first remove/change the setting, then explicitly set the old account's database role to `user` to revoke it. Never put a student's password in `.env` for this setup.

All outgoing messages use the display name `sherubtse_lost_found` and the existing verified `EMAIL_FROM` address. The email body shows the college logo beside its branding. Gmail's sender avatar is controlled by the sending Google account's profile picture (or supported domain branding), not by the email's HTML or SMTP display name. Set the sending account's profile picture to the existing college logo if you have permission to manage that account. Existing received messages are not rewritten.

## Current email transport: Google Apps Script HTTPS web app

Email now uses Node's built-in `fetch`, not Nodemailer or SMTP. Set `MAIL_WEB_APP_URL` to your deployed Apps Script HTTPS web app endpoint, `MAIL_WEB_APP_SECRET` to the matching private secret configured in that web app, and `APP_BASE_URL` to your website origin. The old SMTP and `EMAIL_FROM` variables are no longer read by the app. Keep the secret in `.env` or deployment environment settings, never in browser code.

Each message is a separate JSON POST with exactly `{ secret, to, subject, text, html }`. The web app must validate the secret server-side, send the message, and return JSON (e.g. `{ "ok": true }`, or `{ "ok": false }` on failure). HTTP non-2xx responses, `ok:false`, network/JSON errors and a 15-second timeout are treated as failure. No automatic retry is attempted, avoiding duplicate code emails after an ambiguous timeout. Set the sender name/account in Apps Script; the Node JSON contract does not set a sender.

Templates, verification/reset expiry, single-use rules, notification preferences and recipient filtering remain unchanged. The JSON contract has no attachment field: existing template CID references are converted to the public college logo and item-photo URLs. Use a reachable HTTPS `APP_BASE_URL` in production; localhost images cannot load in recipients' email clients. Found-item and verification HTML/plain-text remain separate. Earlier SMTP/CID-attachment instructions describe the former transport and are superseded by this section.

Tests mock `fetch` and never invoke the web app or send real emails. Deployment and live sending require your actual web app URL and shared secret.
