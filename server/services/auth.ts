import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { db } from '../db';

/**
 * Accounts, sessions and roles.
 *
 * Passwords are hashed with scrypt from node:crypto rather than pulling in
 * bcrypt: it is memory-hard, in the standard library, and this codebase
 * avoids dependencies it does not need.
 *
 * Sessions are opaque random tokens held server-side in a table, not signed
 * JWTs, so signing out actually revokes access instead of waiting for an
 * expiry to pass.
 */

export type Role = 'owner' | 'sales' | 'production';

export const ROLES: Role[] = ['owner', 'sales', 'production'];

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_DAYS = 14;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, keyB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, SCRYPT);
  // Constant time, so a wrong password cannot be narrowed down by timing
  return crypto.timingSafeEqual(expected, actual);
}

/** Minimum that is worth enforcing without becoming an obstacle. */
export function passwordProblem(password: string): string | null {
  if (typeof password !== 'string' || password.length < 10) {
    return 'Password must be at least 10 characters';
  }
  if (/^\d+$/.test(password)) return 'Password cannot be only numbers';
  return null;
}

export const userCount = () =>
  (db.prepare('SELECT COUNT(*) as c FROM users WHERE active = 1').get() as any).c as number;

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(token, userId, expires, new Date().toISOString());
  return token;
}

export function destroySession(token: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function userForToken(token: string): SessionUser | null {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND u.active = 1
  `).get(token) as any;
  if (!row) return null;

  if (new Date(row.expires_at).getTime() < Date.now()) {
    destroySession(token);
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

const COOKIE = 'pb_session';

/** One cookie, parsed by hand rather than adding cookie-parser for it. */
export function readSessionCookie(req: Request): string {
  const header = req.headers.cookie;
  if (!header) return '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return '';
}

export function setSessionCookie(res: Response, token: string) {
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
  res.setHeader('Set-Cookie', [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    // Lax still arrives on the Xero OAuth redirect, which is a top-level GET
    'SameSite=Lax',
    `Max-Age=${SESSION_DAYS * 86400}`,
    ...(secure ? ['Secure'] : [])
  ].join('; '));
}

export function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/**
 * Paths that must work without a session.
 *
 * Webhooks authenticate with an HMAC signature instead, and refusing them
 * would silently stop order intake. The OAuth callback is state-protected.
 */
const PUBLIC_PATHS: (RegExp | string)[] = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/session',
  '/api/auth/setup',
  '/api/auth/needs-setup',
  '/api/xero/callback',
  '/api/xero/webhook',
  '/api/shopify/webhook',
  /^\/api\/ecommerce\/webhook\//
];

const isPublic = (path: string) =>
  PUBLIC_PATHS.some(p => (typeof p === 'string' ? p === path : p.test(path)));

/** Attaches req.user when a valid session cookie is present. */
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const user = userForToken(readSessionCookie(req));
  if (user) req.user = user;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isPublic(req.path)) return next();
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue', needsAuth: true });
  return next();
}

export const requireRole = (...allowed: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Sign in to continue', needsAuth: true });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Your account does not have access to this' });
    }
    return next();
  };

/* ------------------------------------------------------------- redaction */

/**
 * Whether this role may see what a job costs and earns.
 *
 * Hiding the figures in the interface alone would be theatre: the JSON is
 * one devtools tab away. Everything that carries cost, markup, margin or
 * profit is stripped here, on the way out.
 */
export const canSeeFinancials = (role?: Role) => role === 'owner';

/** Field names that reveal cost or profitability, wherever they appear. */
const MONEY_FIELDS = new Set([
  'profit', 'marginPct', 'margin', 'markupPct',
  'goodsCost', 'totalCost', 'stockCost', 'unitCost', 'lineCost', 'rawCost',
  'blankCost', 'packagingCost', 'decorationUnitCost', 'setupCost', 'minCharge',
  'costPerUnit', 'landedCostPerUnit', 'fobCostUsd',
  'baseCost', 'priceAdjustment',
  'cogs', 'grossProfit', 'grossMargin', 'realGrossMargin',
  'stockValue', 'stockValuation', 'totalValuation', 'landedValue'
]);

/** Recursively removes cost and profit fields from anything sent to a client. */
export function redactFinancials<T>(payload: T): T {
  const walk = (value: any): any => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(value)) {
        if (MONEY_FIELDS.has(k)) continue;
        out[k] = walk(v);
      }
      return out;
    }
    return value;
  };
  return walk(payload);
}

/**
 * Applies redaction to every JSON response for roles that may not see cost.
 * Installed once, so a new route cannot forget it.
 */
export function redactResponses(req: Request, res: Response, next: NextFunction) {
  if (canSeeFinancials(req.user?.role)) return next();
  const json = res.json.bind(res);
  res.json = (body: any) => json(redactFinancials(body));
  next();
}
