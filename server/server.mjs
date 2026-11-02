import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Open edition: serves dist/ with no sign-in, passwords or one-time codes.
// Applicant documents are processed only in the browser; this server has no upload API or database.
// The login edition is kept in server/auth-server.mjs.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', 'dist');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json', '.wasm':'application/wasm', '.pdf':'application/pdf',
  '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.woff2':'font/woff2', '.gz':'application/gzip' };

export function createApp() {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; worker-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const reply = (code, text, type = 'text/plain; charset=utf-8') => { res.writeHead(code, { 'Content-Type':type }); res.end(text); };
    try {
      if (!['GET','HEAD'].includes(req.method)) return reply(405, 'Method not allowed.');
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (path === '/healthz') return reply(200, '{"ok":true}', 'application/json');
      const candidate = resolve(root, '.' + (path.endsWith('/') ? path + 'index.html' : path));
      if (candidate !== root && !candidate.startsWith(root + sep)) return reply(404, 'Not found.');
      const actual = await realpath(candidate).catch(() => null);
      if (!actual || !actual.startsWith(root + sep) || !(await stat(actual)).isFile()) return reply(404, 'Not found.');
      const bytes = await readFile(actual);
      res.writeHead(200, { 'Content-Type':types[extname(actual)] || 'application/octet-stream', 'Content-Length':bytes.length,
        'Cache-Control':extname(actual) === '.html' ? 'no-cache' : 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { if (!res.headersSent) reply(400, 'Bad request.'); else res.end(); }
  });
}

// Hostinger launches the entry file through a wrapper, so also start when NODE_ENV=production.
if (process.argv[1] && (resolve(process.argv[1]) === fileURLToPath(import.meta.url) || process.env.NODE_ENV === 'production')) {
  const production = process.env.NODE_ENV === 'production';
  createApp().listen(Number(process.env.PORT || 3000), production ? '0.0.0.0' : '127.0.0.1',
    () => console.log('BTW Visa Operations ready on port ' + (process.env.PORT || 3000)));
}
