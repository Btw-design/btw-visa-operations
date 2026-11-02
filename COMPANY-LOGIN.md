# Company login edition

This adds a separate work-email/password server for the existing Singapore app. It does not require ChatGPT accounts or call an AI API. It is prepared for external hosting; the existing ChatGPT-hosted Site retains its own platform sign-in and is not converted by these files.

## Try on Windows

1. Stop the previous http-server window with Ctrl+C. Keep the port free for the login server.
2. Download the current GitHub files with `git -C "D:\VISA OPS SOFTWARE" pull --ff-only`.
3. In PowerShell run `cd "D:\VISA OPS SOFTWARE"`, then `node server/setup-admin.mjs`.
4. Enter your own work email, name and a new password of at least 12 characters. Password entry is hidden. Do not paste credentials into a chat or commit them to GitHub.
5. Run `node server/server.mjs` or double-click `Start-Company-Login.cmd`.
6. Open http://127.0.0.1:3000 and sign in. Staff administration creates staff accounts and displays a temporary password once. Deliver it securely to the intended person. First sign-in requires a new password.

The original Start-Visa-Software.cmd remains the static, computer-local edition without login. For the company login edition use Start-Company-Login.cmd. The deployed host must run the login server, never expose dist directly as a public static site.

## Account controls

- Only the initial administrator can create, disable, enable or reset staff accounts. Public registration is unavailable.
- No emails are sent automatically. Forgotten staff passwords are reset by the administrator. Mail delivery and email verification are not configured.
- Passwords use salted scrypt hashes. Session tokens are random, stored as hashes, and delivered in HttpOnly, SameSite cookies (Secure on HTTPS).
- Sessions expire after eight hours, or after one hour without a request. Password change/reset and disable revoke existing sessions. Logout revokes the current session.
- The server rejects cross-origin changes and throttles repeated sign-in attempts. All application assets, PDFs and OCR files require a session. An account with a temporary password cannot access them until the password is changed.
- Authentication records are persisted in data/auth.sqlite. Applicant documents and form answers continue to be processed only inside the browser; the server has no document-upload API.

## External deployment requirements

Use Node.js 24+ and a single server instance with a persistent disk for the SQLite database. The Dockerfile uses Node 24 and a non-root user. No npm install is needed for this server.

Set APP_ORIGIN to the exact HTTPS origin, for example https://visa.example.com (no trailing slash). Set AUTH_DB_PATH to a persistent disk path such as /data/auth.sqlite. The reverse proxy must preserve the original Host header and terminate HTTPS. NODE_ENV=production binds to 0.0.0.0; PORT defaults to 3000. /healthz is available for basic health checks. Passwords and request bodies are never logged by application code; configure the hosting proxy likewise.

Mount /data as persistent writable storage owned by the container's node user (UID 1000). Run the one-time setup command on the deployed host using an interactive terminal: `node server/setup-admin.mjs`. Do not enable staff access until the admin is created and HTTPS is confirmed. Start the server normally afterwards. No default credentials exist.

Before team rollout, choose the host and domain, configure HTTPS and persistent-disk backups, create the administrator, then test anonymous blocking and staff lifecycle on the actual host. The domain, hosting subscription, automated backups, email delivery, multi-factor authentication, administrator recovery and a multi-instance database are not provisioned by this code. For admin recovery the trusted server operator needs a separate controlled recovery procedure; do not edit database hashes manually.

Use a stopped-server backup of the entire data directory (including SQLite WAL files if present), or SQLite's backup API. Keep account backups encrypted and access-restricted. Never put authentication databases or backups in GitHub or a web-served folder.

Run `node --test tests/auth.test.mjs` for the login-server integration tests.
