# Email web app setup

1. In Google Apps Script, create a project and paste `Code.gs` into its script editor.
2. In Project Settings > Script Properties, set `MAIL_WEB_APP_SECRET` to the same private value used in your local `.env` and Render Environment. Never put the secret in script source, browser code, screenshots, or Git.
3. Deploy > New deployment > Web app. Execute as the script owner, and choose access that lets your backend POST without an interactive Google sign-in (normally Anyone). Authorize the mail scope using the intended sending account. Your Workspace administrator may restrict public deployments.
4. Copy the deployed HTTPS `/exec` URL into `MAIL_WEB_APP_URL`. Do not use the script editor, `/dev` test URL, or a Google login page URL. After editing the script, update the deployment to a new version.
5. Set `APP_BASE_URL=http://localhost:3000` locally, or your actual public HTTPS website origin on Render. Set these three variables in Render's Environment settings; Render does not read your private local `.env`.
6. Restart the Node app after environment changes. Startup reports only which variable names are missing/invalid, not their values. A configured status confirms syntax/presence, not that Google accepted the deployment or secret.
7. Use the application's Verify email screen with your own registered account. Check inbox/spam. Success is reported only when the deployed web app returns JSON `{ "ok": true }`. Failures leave the account unverified; request a new code after fixing the deployment. This code does not bypass verification.

The backend sends exactly `{ secret, to, subject, text, html }` with a 15-second timeout. The receiver checks the secret and sends through `MailApp`. HTTP errors, missing/invalid JSON, responses other than explicit `ok:true`, Google access/permission errors, quota failures and timeouts are send failures. The backend does not automatically retry an ambiguous timeout, to avoid duplicate emails.

The existing public logo and item-photo links are used in HTML. A localhost `APP_BASE_URL` works for local verification links but its images cannot load on another device or through Gmail's image proxy. A public app origin is needed for those images. Sender avatar/name settings ultimately belong to the Google sending account.

Keep `.env` out of Git. Legacy SMTP variables are ignored. No SMTP ports are needed with this HTTPS method. MailApp account quotas still apply; hosting on Render does not remove Google sending limits. Automated tests use mocked mail and web-app APIs and never send real messages.

## HTTP 401/403 or no reset email

A backend request that receives HTTP 401/403 has not produced the required success JSON. Check that `MAIL_WEB_APP_URL` points to the current deployed `/exec` endpoint and that the deployment permits non-interactive requests from the backend. Choose the script owner for execution and public web-app access when allowed. A domain-only or signed-in-user-only deployment cannot be called by this backend's shared-secret JSON POST. A wrong/revoked deployment URL also needs replacement. If your organization disallows public deployments, ask its administrator to enable an approved deployment; the app must not bypass Google's access controls.

The Node logs now use safe fixed reason codes: `WEB_APP_ACCESS_DENIED`, `HTTP_ERROR`, `INVALID_JSON`, `WEB_APP_REJECTED`, `MISSING_SUCCESS_FLAG`, `TIMEOUT`, or `NETWORK_ERROR`. No recipient, reset code, secret, URL or provider body is logged. A 200 HTML login/error page is `INVALID_JSON`, not success. For `WEB_APP_REJECTED`, confirm the matching secret, MailApp authorization and account quotas privately in Apps Script. Update the deployment version after editing `Code.gs`, update the private environment settings if needed, and restart the Node app before requesting a fresh reset code.

Password-reset requests intentionally return the same browser message for registered and unknown addresses, including recipient-specific sending failures. Look at these safe server diagnostics instead of assuming the neutral browser message confirms delivery. Item-notification opt-out does not block account-security emails.
