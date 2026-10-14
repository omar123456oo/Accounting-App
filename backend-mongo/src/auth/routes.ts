import { Router } from 'express';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { appendAudit } from '../db/audit-chain.js';
import { roleMatrix } from '../db/permissions.js';
import { Organization, Role, Session, User } from '../models/index.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.js';
import { SESSION_COOKIE, permissionsOf, requireAuth, startSession } from './session.js';

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAD_CREDENTIALS = { errors: { email: ['These credentials do not match our records.'] } };

export const authRouter = Router();

const profile = (u: { _id: Types.ObjectId; name: string; type: string }, permissions: string[]) => ({ user: { id: String(u._id), name: u.name, type: u.type, permissions } });

authRouter.post('/register', async (req, res) => {
  if (!env.registrationOpen) { res.status(403).json({ message: 'Registration is closed.' }); return; }
  const { officeName, name, email, password, passwordConfirmation } = req.body ?? {};
  const errors: Record<string, string[]> = {};
  if (typeof officeName !== 'string' || !officeName.trim()) errors.officeName = ['The office name is required.'];
  if (typeof name !== 'string' || !name.trim()) errors.name = ['The name is required.'];
  const mail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(mail)) errors.email = ['Enter a valid e-mail address.'];
  else if (await User.exists({ email: mail })) errors.email = ['This e-mail address is already registered.'];
  if (typeof password !== 'string' || password.length < 12) errors.password = ['The password must be at least 12 characters.'];
  else if (password !== passwordConfirmation) errors.passwordConfirmation = ['The passwords do not match.'];
  if (Object.keys(errors).length) { res.status(422).json({ errors }); return; }

  const org = await Organization.create({ name: officeName.trim() });
  await Role.insertMany(Object.entries(roleMatrix()).map(([n, permissions]) => ({ organizationId: org._id, name: n, permissions })));
  const owner = await User.create({
    organizationId: org._id, name: name.trim(), email: mail, passwordHash: await hashPassword(password), type: 'staff', roles: ['owner'],
    // TODO: e-mail verification needs a mail transport; until then accounts are verified on registration.
    emailVerifiedAt: new Date(),
  });
  await appendAudit({ organizationId: org._id, actorId: owner._id, action: 'organization.registered', entityType: 'Organization', entityId: String(org._id), ip: req.ip });
  res.status(201).json({ emailVerificationRequired: false });
});

authRouter.post('/login', async (req, res) => {
  const { email, password, otp } = req.body ?? {};
  if (typeof email !== 'string' || !email || typeof password !== 'string' || !password) {
    res.status(422).json({ errors: { ...(!email && { email: ['The e-mail is required.'] }), ...(!password && { password: ['The password is required.'] }) } });
    return;
  }
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash +mfaSecret');
  if (!user) { await verifyPassword(password, DUMMY_HASH); res.status(422).json(BAD_CREDENTIALS); return; }
  if (user.lockedUntil && user.lockedUntil > new Date()) { res.status(423).json({ message: 'Too many failed attempts. The account is locked for 15 minutes.' }); return; }

  if (!await verifyPassword(password, user.passwordHash)) {
    const failed = user.failedLogins + 1;
    await User.updateOne({ _id: user._id }, failed >= MAX_FAILURES ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins: failed });
    await appendAudit({ organizationId: user.organizationId, actorId: user._id, action: failed >= MAX_FAILURES ? 'auth.locked' : 'auth.login_failed', entityType: 'User', entityId: String(user._id), ip: req.ip });
    res.status(422).json(BAD_CREDENTIALS);
    return;
  }
  if (!user.emailVerifiedAt) { res.status(422).json({ errors: { email: ['Please verify your e-mail address first.'] } }); return; }
  if (user.mfaEnabled) { res.status(422).json({ errors: { otp: [otp ? 'The verification code is invalid.' : 'The verification code is required.'] } }); return; } // TODO: TOTP

  await User.updateOne({ _id: user._id }, { failedLogins: 0, $unset: { lockedUntil: 1 } });
  await startSession(req, res, user._id, user.organizationId);
  await appendAudit({ organizationId: user.organizationId, actorId: user._id, action: 'auth.login', entityType: 'User', entityId: String(user._id), ip: req.ip });
  
  res.json(profile(user, await permissionsOf(user)));
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  await Session.deleteOne({ _id: req.auth!.sessionId });
  await appendAudit({ organizationId: req.auth!.organizationId, actorId: req.auth!.userId, action: 'auth.logout', entityType: 'User', entityId: String(req.auth!.userId), ip: req.ip });
  res.clearCookie(SESSION_COOKIE, { path: '/' }).status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  const a = req.auth!;
  res.json(profile({ _id: a.userId, name: a.name, type: a.type }, a.permissions));
});
