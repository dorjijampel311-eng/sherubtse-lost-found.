# Sherubtse College Lost & Found

A student community portal using Express, PostgreSQL, server-side sessions and the included college logo. Browse/search lost and found reports, post optional photos, manage your own posts, and update your profile and notification preferences. No sample listings are seeded.

## Set up in VS Code

1. Install Node.js 20+ and PostgreSQL. Open this folder in VS Code and choose Terminal > New Terminal.
2. Run `npm ci`.
3. If `.env` does not exist, run `Copy-Item .env.example .env` in PowerShell. Do not overwrite an existing configuration.
4. In pgAdmin, create `sherubtse_lost_found`. Set `DATABASE_URL` in `.env` to `postgresql://postgres:YOUR_PASSWORD@localhost:5432/sherubtse_lost_found` (URL-encode special password characters).
5. Set a random `SESSION_SECRET` of at least 32 characters. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Use `PGSSLMODE=disable` for local PostgreSQL; use `require` if a hosted provider requires TLS.
6. Run `npm run dev` or `npm start`. If Windows blocks watch-mode child processes, use `npm start`. Open http://localhost:3000 and check http://localhost:3000/health.
7. Run `npm run check` and `npm test`. With the local server running, `node test/integration.js` checks PostgreSQL flows using temporary accounts and posts that are removed afterward. Run this only against a development database.

Tables and additive profile/notification migrations run on startup. Back up production databases before updates. Existing users and reports are preserved; notifications default to off. Legacy accounts with nonmatching student identities cannot sign in or publish; a maintainer must resolve their ownership separately. Student identity fields cannot be changed through the profile API.

## Student accounts and privacy

Registration requires exactly eight digits, a matching email such as `07240068.sherubtse@rub.edu.bt`, full name, programme, year 1?4, phone and a password (at least 10 characters, at most 72 UTF-8 bytes). Both browser and server validate identities. Email format validation does not prove mailbox ownership or current enrollment; this project does not implement email verification or college SSO.

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

New lost posts notify eligible student accounts that opted in (including the poster if opted in). Found posts do not trigger email. Messages contain item name, category, location, date and a direct post link, without passwords or poster contact details. Each recipient receives a separate message. Missing configuration or sending errors are returned as warnings while the listing remains saved. SMTP acceptance is reported accurately and does not guarantee inbox delivery. Check provider logs and spam folders when testing.

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

`npm run check` checks all application JavaScript syntax. `npm test` covers identity/profile rules and notification behavior with isolated mocked database/SMTP boundaries. Full session, ownership, upload persistence and migration checks require PostgreSQL. Actual SMTP acceptance and mailbox delivery require real provider credentials and controlled student mailboxes. No GitHub push or deployment is performed by these checks.
