import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { openDatabase, emailOf, validEmail, validPassword, passwordHash, passwordMatches,
  tokenHash, sessionUser, issueSession, publicUser } from './auth.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', 'dist');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json', '.wasm':'application/wasm', '.pdf':'application/pdf',
  '.jpg':'image/jpeg', '.ico':'image/x-icon', '.woff2':'font/woff2', '.gz':'application/gzip' };
const fail = (status, message) => Object.assign(new Error(message), { status });
async function body(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw fail(415, 'JSON required.');
  let data = '', size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw fail(413, 'Request too large.');
    data += chunk;
  }
  try { const value = JSON.parse(data); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value; }
  catch { throw fail(400, 'Invalid request.'); }
}
export async function createApp({ databasePath, origin, production = false } = {}) {
  origin ||= process.env.APP_ORIGIN || 'http://127.0.0.1:3000';
  const url = new URL(origin);
  if (url.origin !== origin || (production && url.protocol !== 'https:') || !['http:','https:'].includes(url.protocol)) {
    throw Error('APP_ORIGIN must be the exact website origin, using HTTPS in production.');
  }
  const db = openDatabase(databasePath || process.env.AUTH_DB_PATH || resolve(here, '..', 'data', 'auth.sqlite'));
  const secure = url.protocol === 'https:';
  const cookieName = secure ? '__Host-btw_session' : 'btw_session';
  const cookie = (token, age = 28800) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const dummyHash = await passwordHash(randomBytes(32).toString('hex'));
  const server = http.createServer(async (req, res) => {
    const json = (code, value) => { res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    const redirect = path => { res.writeHead(303, { Location:path }); res.end(); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; worker-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const path = new URL(req.url, origin).pathname;
      if (!['GET','HEAD','POST'].includes(req.method)) throw fail(405, 'Method not allowed.');
      if (req.headers.host !== url.host) throw fail(400, 'Unexpected host.');
      if (req.method === 'POST' && req.headers.origin !== origin) throw fail(403, 'Invalid request origin.');
      if (req.method === 'GET' && path === '/healthz') return json(200, { ok:true });
      const rawToken = String(req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
      const user = sessionUser(db, rawToken);
      if (req.method === 'POST' && path === '/api/login') {
        const b = await body(req), email = emailOf(b.email), ip = req.socket.remoteAddress || 'unknown', now = Date.now();
        if (!validEmail(email) || typeof b.password !== 'string' || b.password.length > 128) throw fail(401, 'Email or password is incorrect.');
        db.prepare('DELETE FROM attempts WHERE at<?').run(now - 15 * 60 * 1000);
        const count = db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE email=?').get(email).n;
        const ipCount = db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE ip=?').get(ip).n;
        if (count >= 10 || ipCount >= 200) throw fail(429, 'Too many sign-in attempts. Try again in 15 minutes.');
        db.prepare('INSERT INTO attempts VALUES (?,?,?)').run(email, ip, now);
        const found = db.prepare('SELECT * FROM users WHERE email=?').get(email);
        const match = await passwordMatches(b.password, found?.password_hash || dummyHash);
        const current = found && db.prepare('SELECT * FROM users WHERE id=?').get(found.id);
        if (!match || !current?.active || current.version !== found.version) throw fail(401, 'Email or password is incorrect.');
        if (rawToken) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(rawToken));
        const token = issueSession(db, current.id);
        db.prepare('DELETE FROM attempts WHERE email=? AND ip=?').run(email, ip);
        res.setHeader('Set-Cookie', cookie(token));
        return json(200, publicUser(current));
      }
      if (req.method === 'GET' && ['/login','/account','/admin'].includes(path)) {
        if (path !== '/login' && !user) return redirect('/login');
        if (path === '/admin' && user?.must_change) return redirect('/account');
        if (path === '/admin' && user?.role !== 'admin') throw fail(403, 'Admin access required.');
        if (path === '/login' && user) return redirect(user.must_change ? '/account' : '/');
        return await send(resolve(here,'public','auth.html'));
      }
      if (req.method !== 'POST' && ['/auth.js','/auth.css'].includes(path)) return await send(resolve(here,'public',path.slice(1)));
      if (!user) {
        if (path.startsWith('/api/')) throw fail(401, 'Please sign in.');
        return redirect('/login');
      }
      if (req.method === 'GET' && path === '/api/me') return json(200, publicUser(user));
      if (req.method === 'POST' && path === '/api/logout') {
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(rawToken));
        res.setHeader('Set-Cookie', cookie('',0)); return json(200,{ok:true});
      }
      if (req.method === 'POST' && path === '/api/password') {
        const b = await body(req);
        if (!validPassword(b.newPassword)) throw fail(400,'Use a password of 12–128 characters.');
        if (typeof b.currentPassword !== 'string' || b.currentPassword.length > 128 || !(await passwordMatches(b.currentPassword,user.password_hash))) throw fail(400,'Current password is incorrect.');
        if (b.currentPassword === b.newPassword) throw fail(400,'Choose a different password.');
        const hash = await passwordHash(b.newPassword);
        db.exec('BEGIN IMMEDIATE');
        try {
          const changed = db.prepare('UPDATE users SET password_hash=?,must_change=0,version=version+1 WHERE id=? AND version=? AND active=1').run(hash,user.id,user.version);
          if (!changed.changes) throw fail(409,'Account changed. Sign in again.');
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
          const token = issueSession(db,user.id); db.exec('COMMIT'); res.setHeader('Set-Cookie',cookie(token));
        } catch(e) { db.exec('ROLLBACK'); throw e; }
        return json(200,{ok:true});
      }
      if (user.must_change) {
        if (path.startsWith('/api/')) throw fail(403,'Change your temporary password first.');
        return redirect('/account');
      }
      if (path.startsWith('/api/admin/')) {
        if (user.role !== 'admin') throw fail(403,'Admin access required.');
        if (path === '/api/admin/users' && req.method === 'GET') return json(200,db.prepare('SELECT * FROM users ORDER BY id').all().map(publicUser));
        if (path === '/api/admin/users' && req.method === 'POST') {
          const b = await body(req), email = emailOf(b.email), name = String(b.name || '').trim();
          if (!validEmail(email) || !name || name.length > 100) throw fail(400,'Enter a valid name and work email.');
          if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw fail(409,'An account already exists for this email.');
          const temporaryPassword = randomBytes(18).toString('base64url');
          const hash = await passwordHash(temporaryPassword);
          const actor = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
          if (!actor?.active || actor.version !== user.version || actor.role !== 'admin') throw fail(403,'Sign in again.');
          // Recheck after the async password hash to handle simultaneous requests.
          if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw fail(409,'An account already exists for this email.');
          const result = db.prepare("INSERT INTO users(email,name,password_hash,role,created_at) VALUES (?,?,?,'staff',?)").run(email,name,hash,Date.now());
          return json(201,{user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid)),temporaryPassword});
        }
        const match = path.match(/^\/api\/admin\/users\/(\d+)\/(disable|enable|reset)$/);
        if (match && req.method === 'POST') {
          const id = Number(match[1]), action = match[2];
          if (id === user.id) throw fail(400,'Use Change password for your account. You cannot disable yourself.');
          const target = db.prepare('SELECT * FROM users WHERE id=?').get(id);
          if (!target || target.role !== 'staff') throw fail(404,'Staff account not found.');
          let temporaryPassword, hash;
          if (action === 'reset') { temporaryPassword = randomBytes(18).toString('base64url'); hash = await passwordHash(temporaryPassword); }
          const actor = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
          if (!actor?.active || actor.version !== user.version || actor.role !== 'admin') throw fail(403,'Sign in again.');
          db.exec('BEGIN IMMEDIATE');
          try {
            if (action === 'reset') db.prepare('UPDATE users SET password_hash=?,must_change=1,version=version+1 WHERE id=?').run(hash,id);
            else db.prepare('UPDATE users SET active=?,version=version+1 WHERE id=?').run(action === 'enable' ? 1 : 0,id);
            db.prepare('DELETE FROM sessions WHERE user_id=?').run(id); db.exec('COMMIT');
          } catch(e) { db.exec('ROLLBACK'); throw e; }
          return json(200,{ok:true,...(temporaryPassword ? {temporaryPassword} : {})});
        }
        throw fail(404,'Not found.');
      }
      if (req.method === 'POST' || path.startsWith('/api/')) throw fail(404,'Not found.');
      const decoded = decodeURIComponent(path === '/' ? '/index.html' : path);
      const candidate = resolve(root,'.'+decoded);
      if (!candidate.startsWith(root+sep)) throw fail(404,'Not found.');
      let actual;
      try { actual = await realpath(candidate); } catch { throw fail(404,'Not found.'); }
      if (!actual.startsWith(root+sep)) throw fail(404,'Not found.');
      return await send(actual);

      async function send(file) {
        if (!(await stat(file)).isFile()) throw fail(404,'Not found.');
        let bytes = await readFile(file);
        if (file === resolve(root,'index.html')) {
          bytes = Buffer.from(bytes.toString().replace('</head>','<link rel="stylesheet" href="/auth.css"><script type="module" src="/auth.js"></script></head>')
            .replace('<body>','<body><div class="btw-accountbar"><a href="/account">My account / Sign out</a><a href="/admin">Staff administration</a></div>'));
        }
        res.writeHead(200,{'Content-Type':types[extname(file)] || 'application/octet-stream','Content-Length':bytes.length});
        res.end(req.method === 'HEAD' ? undefined : bytes);
      }
    } catch(e) {
      // Never log bodies, passwords, session cookies or applicant data.
      if (!res.headersSent) json(e.status || 500,{error:e.status ? e.message : 'Server error. Please try again.'});
      else res.end();
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.on('close',()=>db.close());
  return {server,db};
}
// Hostinger launches the entry file through a wrapper, so also start when NODE_ENV=production.
if (process.argv[1] && (resolve(process.argv[1]) === fileURLToPath(import.meta.url) || process.env.NODE_ENV === 'production')) {
  const production = process.env.NODE_ENV === 'production';
  if (production && !process.env.APP_ORIGIN) throw Error('Set APP_ORIGIN to your HTTPS website address.');
  const {server} = await createApp({production});
  server.listen(Number(process.env.PORT || 3000),production ? '0.0.0.0' : '127.0.0.1',()=>console.log('BTW company login server ready. Open '+(process.env.APP_ORIGIN || 'http://127.0.0.1:3000')));
}
