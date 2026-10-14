import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { Role, Session, User } from '../models/index.js';

export const SESSION_COOKIE = 'accounting_session';
export const XSRF_COOKIE = 'XSRF-TOKEN';
const IDLE_MS = 2 * 60 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;

export interface AuthContext {
  userId: Types.ObjectId;
  organizationId: Types.ObjectId;
  type: 'staff' | 'client';
  name: string;
  permissions: string[];
  sessionId: Types.ObjectId;
}
declare module 'express-serve-static-core' {
  interface Request { auth?: AuthContext }
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const secure = env.nodeEnv === 'production';

export const cookieParser: RequestHandler = (req, _res, next) => {
  req.cookies = Object.fromEntries((req.headers.cookie ?? '').split(';').map((c) => c.trim().split(/=(.*)/s).slice(0, 2)).filter(([k]) => k).map(([k, v]) => [k, decodeURIComponent(v ?? '')]));
  next();
};

export function issueXsrf(res: Response): void {
  res.cookie(XSRF_COOKIE, randomBytes(24).toString('base64url'), { httpOnly: false, sameSite: 'lax', secure, path: '/' });
}

/** Double-submit check for state-changing requests: Angular copies the XSRF-TOKEN cookie into X-XSRF-TOKEN. */
export const csrf: RequestHandler = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookie = req.cookies[XSRF_COOKIE];
  if (!cookie || cookie !== req.get('x-xsrf-token')) { res.status(419).json({ message: 'CSRF token mismatch.' }); return; }
  next();
};

export async function startSession(req: Request, res: Response, userId: Types.ObjectId, organizationId: Types.ObjectId): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await Session.create({ tokenHash: sha(token), userId, organizationId, ip: req.ip, userAgent: req.get('user-agent'), expiresAt: new Date(Date.now() + ABSOLUTE_MS) });
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: ABSOLUTE_MS });
  issueXsrf(res); // rotate on login
}

export async function permissionsOf(user: { organizationId: Types.ObjectId; roles: string[] }): Promise<string[]> {
  const roles = await Role.find({ organizationId: user.organizationId, name: { $in: user.roles } }).lean();
  return [...new Set(roles.flatMap((r) => r.permissions))].sort();
}

/** Resolves the cookie to a session, user and tenant. Does not reject; use requireAuth. */
export const loadSession: RequestHandler = async (req, res, next) => {
  try {
    const token = req.cookies[SESSION_COOKIE];
    const s = token && await Session.findOne({ tokenHash: sha(token), expiresAt: { $gt: new Date() } });
    if (!s || Date.now() - s.lastActivityAt.getTime() > IDLE_MS) { if (s) await s.deleteOne(); return next(); }
    const user = await User.findById(s.userId).lean();
    if (!user) return next();
    s.lastActivityAt = new Date();
    await s.save();
    req.auth = { userId: user._id, organizationId: user.organizationId, type: user.type, name: user.name, permissions: await permissionsOf(user), sessionId: s._id };
    next();
  } catch (e) { next(e); }
};

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.auth) { res.status(401).json({ message: 'Unauthenticated.' }); return; }
  next();
};
export const requireType = (type: 'staff' | 'client'): RequestHandler => (req, res, next) =>
  req.auth?.type === type ? next() : void res.status(403).json({ message: 'Forbidden.' });
export const can = (permission: string): RequestHandler => (req: Request, res: Response, next: NextFunction) =>
  req.auth?.permissions.includes(permission) ? next() : void res.status(403).json({ message: 'Forbidden.' });
