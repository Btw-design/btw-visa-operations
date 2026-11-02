import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const derive = promisify(scrypt);
let hashing = 0;
const waiting = [];
export const emailOf = value => String(value || '').trim().toLowerCase();
export const validEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
export const validPassword = password => typeof password === 'string' && password.length >= 12 && password.length <= 128;
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  if (hashing >= 4) {
    if (waiting.length >= 32) throw Object.assign(new Error('Sign-in is busy. Please try again shortly.'), {status:503});
    await new Promise(resolve => waiting.push(resolve));
  }
  hashing++;
  try {
    const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
    return `${salt}:${hash.toString('hex')}`;
  } finally { hashing--; waiting.shift()?.(); }
}
export async function passwordMatches(password, stored) {
  const [salt, expected] = stored.split(':');
  const actual = (await passwordHash(password, salt)).split(':')[1];
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','staff')),
      active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (email TEXT NOT NULL, ip TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS attempts_time ON attempts(at);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);`);
  return db;
}
export function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role,
    active: Boolean(user.active), mustChangePassword: Boolean(user.must_change) };
}
export function sessionUser(db, token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const now = Date.now(), hash = tokenHash(token);
  const user = db.prepare(`SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id
    WHERE token_hash=? AND active=1 AND expires_at>? AND last_seen>?`).get(hash, now, now - 60 * 60 * 1000);
  if (user) db.prepare('UPDATE sessions SET last_seen=? WHERE token_hash=?').run(now, hash);
  return user || null;
}
export function issueSession(db, userId) {
  const token = randomBytes(32).toString('hex'), now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at<? OR last_seen<?').run(now, now - 60 * 60 * 1000);
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?)').run(tokenHash(token), userId, now, now, now + 8 * 60 * 60 * 1000);
  return token;
}
