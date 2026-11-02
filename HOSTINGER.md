# Hostinger deployment

The interface is plain HTML, CSS and JavaScript in `dist/`, including `dist/index.html`. There is no React migration or paid OCR API. The server is JavaScript on Node.js and enforces individual staff login. The latest passport extraction fixes are included.

## Choose the correct Hostinger product

**The supplied complete deployment targets Hostinger VPS with Docker Compose.** It retains the existing SQLite account store on a named persistent volume and provides HTTPS through Caddy. It has no AWS-specific dependency.

Uploading `dist/` directly into `public_html` exposes the static edition without the company login. Do not use that route for the private staff website. HTML, CSS and browser JavaScript alone cannot enforce server-side password protection.

Hostinger also offers managed Node.js Web Apps on eligible plans and Node 24. However, this edition needs a writable persistent SQLite database. Hostinger documents MariaDB for Web/Cloud databases and directs SQLite requirements to VPS. Do not select a managed or static plan on the assumption it can run this complete edition. A MariaDB-backed authentication adapter would be a separate change, and is not implemented here.

Official references:
- https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/
- https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/
- https://www.hostinger.com/support/1583226-which-database-management-system-is-used-at-hostinger/

## First deployment on a Hostinger VPS

Use a VPS with Docker Engine and the Docker Compose plugin. Access it through SSH or the Hostinger terminal. If using Hostinger Docker Manager, supply the repository and Compose file `deploy/hostinger/compose.yaml`; the build context must include the repository root. Set the two environment variables in that manager. The command-line route below is the reference setup.

1. Download or clone this private GitHub repository to the VPS. Keep the repository private. Use a read-only deploy key or Hostinger's private repository connection; do not embed a GitHub token in a command or commit.
2. Point your chosen domain's DNS A record at the Hostinger VPS IPv4 address. Remove stale AAAA records unless IPv6 is correctly routed to this VPS.
3. Allow TCP 80 and 443 in the VPS/provider firewall. Restrict SSH to the operator's IP. Do not expose port 3000. Ports 80/443 must be available rather than already used by another web server.
4. From the repository root:

```sh
cd deploy/hostinger
cp .env.example .env
nano .env
```

Replace the example domain and certificate email with your actual values. Save this file only on the server. It is ignored by Git. Then:

```sh
docker compose build --pull
docker compose run --rm app node server/setup-admin.mjs
docker compose up -d
docker compose ps
```

The setup command prompts interactively for your administrator email, name and password. No credentials are supplied in this repository. Docker volumes inherit the app image's `/data` ownership on creation. `btw_visa_hostinger_auth` holds accounts and sessions. Caddy obtains and renews HTTPS certificates when DNS and ports are ready. It forwards the original Host header to the login server. Requests reach the app only through this proxy.

Confirm HTTPS, sign in, create a temporary staff account, change its initial password, and verify an anonymous browser cannot access `/`, `/app.js` or `/form-14a.pdf` without sign-in. Test a known passport and its downloaded PDF. No ten-user capacity guarantee has been established; test the actual staff devices and plan before rollout.

## Updates

Keep `.env` and all three named volumes. From the repository root, pull the reviewed changes with `git pull --ff-only`, then:

```sh
cd deploy/hostinger
docker compose build --pull
docker compose up -d
docker compose ps
```

Do not run `docker compose down -v`, delete named volumes, rerun administrator bootstrap, or overwrite authentication data as part of a routine update. Retain the previous image for rollback until login and OCR are verified. A GitHub push does not itself deploy to Hostinger unless a deployment integration is separately configured. No auto-deployment credential or workflow is enabled by this repository.

## Existing AWS or Windows accounts

New Hostinger deployments start with a separate account database. To retain existing staff accounts, arrange an intentional database migration before administrator setup: stop the old app, back up the complete authentication data directory, transfer it over SSH into the new auth volume, and preserve UID 1000 ownership. Do not copy a live SQLite file alone, upload databases to GitHub, or overwrite an existing Hostinger database. Sessions should be revoked on migration; staff may sign in again.

Keep AWS running until Hostinger passes the acceptance checks and DNS migration. Changing repository files does not stop or remove AWS resources. Retire AWS resources deliberately afterwards to stop their running costs.

## Backups

The authentication volume survives container replacement, but not deletion of the VPS. Configure encrypted backups outside the VPS. For a consistent offline backup, stop the app, archive the entire `btw_visa_hostinger_auth` volume including WAL/SHM files if present, then restart the app. Store it outside any web-served or Git directory and test restoration on a separate environment. Backup scheduling is not provisioned automatically.

## Runtime and data

`npm start` launches `server/server.mjs`; Node 24 is the supported deployment runtime. The server uses `PORT` (default 3000), `NODE_ENV=production`, `APP_ORIGIN` (exact HTTPS origin) and `AUTH_DB_PATH` (persistent database path). The Compose file sets these values. No frontend build is needed; all browser assets, including OCR language data and PDF tools, are already in `dist/`.

Applicant documents and answers are processed in the user's browser. Only account, session and login-throttle records are stored by this server. This deployment does not add OpenAI calls, usage credits, applicant uploads, email delivery, MFA or automatic database migration.
