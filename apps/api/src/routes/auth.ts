import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { User } from '../db/models/User';
import { Membership } from '../db/models/Membership';
import { Invitation } from '../db/models/Invitation';
import { Workshop } from '../db/models/Workshop';
import { PasswordResetRequest } from '../db/models/PasswordResetRequest';
import {
  registerSchema, loginSchema, recoverPasswordSchema, requestResetSchema,
  changePasswordSchema, updateMeSchema,
} from '@ats/shared';
import { ApiError, asyncHandler } from '../middleware/errors';
import { requireAuth, publicUser, setAccessCookie, setRefreshCookie, clearAuthCookies } from '../middleware/auth';
import { loginLimiter, forgotLimiter } from '../middleware/rate';
import {
  signAccessToken, issueRefreshToken, rotateRefreshToken, revokeRefreshToken, revokeAllUserTokens,
} from '../services/tokens';
import { audit } from '../services/audit';
import { getPlatformSettings } from '../services/settings';
import { notifyUser, notifyWorkshopSupervisors } from '../services/notifications';
import { env } from '../config/env';
import { MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES, JWT_AUD, SOCKET_TOKEN_TTL } from '../config/constants';
import { refreshCookieFrom } from './helpers';

const router = Router();

/** Normalize a recovery phrase: trim, lowercase, collapse spaces. */
export function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, ' ');
}
/** SHA-256 of the normalized recovery phrase (parity with self-registration). */
export function hashPhrase(phrase: string): string {
  return createHash('sha256').update(normalizePhrase(phrase)).digest('hex');
}

/** Accept only reasonably-sized data:image/* URLs (parity with self-registration). */
export function sanitizeAvatar(avatar: string | undefined | null): string | null {
  if (!avatar) return null;
  if (!avatar.startsWith('data:image/')) return null;
  if (avatar.length > 400_000) return null;
  return avatar;
}

/** POST /api/auth/register — self-registration ALWAYS requires a valid invite code. */
router.post('/register', asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const settings = await getPlatformSettings();
  if (settings.registrationMode === 'closed') throw new ApiError(403, 'errors.registrationDisabled');

  // Invite code is mandatory in every self-registration mode.
  const code = data.inviteCode.toUpperCase().trim();
  const invitation = await Invitation.findOne({ code });
  if (!invitation || invitation.revokedAt || invitation.expiresAt.getTime() < Date.now() || invitation.uses >= invitation.maxUses) {
    throw new ApiError(400, 'errors.inviteRequired');
  }

  const exists = await User.exists({ email: data.email });
  if (exists) throw new ApiError(409, 'errors.duplicateEmail');

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await User.create({
    email: data.email,
    passwordHash,
    name: data.name,
    role: 'worker',
    status: 'active',
    preferredLanguage: data.preferredLanguage,
    gender: data.gender ?? null,
    birthDate: data.birthDate ?? null,
    bloodType: data.bloodType ?? null,
    recoveryHash: hashPhrase(data.recoveryPhrase),
    avatar: sanitizeAvatar(data.avatar),
  });

  const membershipStatus = invitation.autoJoin ? 'active' : 'pending';
  await Membership.create({
    workshopId: invitation.workshopId,
    userId: user._id,
    role: invitation.role,
    status: membershipStatus,
    invitedById: invitation.createdById,
    joinedAt: membershipStatus === 'active' ? new Date() : null,
  });
  invitation.uses += 1;
  await invitation.save();
  await audit(req, 'auth.register_with_invite', { actorId: user._id.toString(), workshopId: invitation.workshopId.toString() });

  const supervisors = await Membership.find({ workshopId: invitation.workshopId, role: 'supervisor', status: 'active' }).lean();
  const workshopName = (await Workshop.findById(invitation.workshopId).select('name'))?.name ?? '';
  for (const sup of supervisors) {
    await notifyUser({
      userId: sup.userId.toString(),
      type: 'invitation_used',
      params: { name: user.name, workshop: workshopName },
      link: '/workers',
      workshopId: invitation.workshopId.toString(),
      dedupKey: `joined:${user._id}:${invitation.workshopId}`,
    });
  }

  await audit(req, 'auth.register', { actorId: user._id.toString(), actorEmail: user.email });

  const access = await signAccessToken(user._id.toString(), user.role, JWT_AUD.WEB);
  const refresh = await issueRefreshToken(user._id.toString(), req.ip ?? '', req.headers['user-agent'] ?? '');
  setAccessCookie(res, access);
  setRefreshCookie(res, refresh.token, env.REFRESH_TOKEN_TTL_DAYS);

  res.status(201).json({
    user: publicUser(user),
    accessToken: access,
    refreshToken: refresh.token,
  });
}));

/** POST /api/auth/login */
router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const user = await User.findOne({ email: data.email }).select('+failedLoginAttempts +lockUntil +passwordHash');
  if (!user) throw new ApiError(401, 'errors.invalidCredentials');
  if (user.status !== 'active') throw new ApiError(403, 'errors.accountSuspended');
  if (user.lockUntil && user.lockUntil.getTime() > Date.now()) throw new ApiError(429, 'errors.tooManyAttempts');

  const ok = await bcrypt.compare(data.password, user.passwordHash);
  if (!ok) {
    user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
    if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    await audit(req, 'auth.login_failed', { actorEmail: data.email });
    throw new ApiError(401, 'errors.invalidCredentials');
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  user.lastLoginAt = new Date();
  await user.save();

  const access = await signAccessToken(user._id.toString(), user.role, JWT_AUD.WEB);
  const refresh = await issueRefreshToken(user._id.toString(), req.ip ?? '', req.headers['user-agent'] ?? '');
  setAccessCookie(res, access);
  setRefreshCookie(res, refresh.token, env.REFRESH_TOKEN_TTL_DAYS);
  await audit(req, 'auth.login', { actorId: user._id.toString(), actorEmail: user.email });

  res.json({ user: publicUser(user), accessToken: access, refreshToken: refresh.token });
}));

/** POST /api/auth/refresh — rotates the refresh token (reuse detection revokes the family). */
router.post('/refresh', asyncHandler(async (req, res) => {
  const presented = (req.body?.refreshToken as string | undefined) || (req.cookies?.[refreshCookieFrom()] as string | undefined);
  if (!presented) throw new ApiError(401, 'errors.unauthenticated');
  const { userId, refresh } = await rotateRefreshToken(presented, req.ip ?? '', req.headers['user-agent'] ?? '');
  const user = await User.findById(userId);
  if (!user || user.status !== 'active') throw new ApiError(401, 'errors.accountSuspended');
  const access = await signAccessToken(userId, user.role, JWT_AUD.WEB);
  setAccessCookie(res, access);
  setRefreshCookie(res, refresh.token, env.REFRESH_TOKEN_TTL_DAYS);
  res.json({ user: publicUser(user), accessToken: access, refreshToken: refresh.token });
}));

/** POST /api/auth/logout */
router.post('/logout', asyncHandler(async (req, res) => {
  const presented = (req.body?.refreshToken as string | undefined) || (req.cookies?.[refreshCookieFrom()] as string | undefined);
  await revokeRefreshToken(presented);
  clearAuthCookies(res);
  if (req.auth) await audit(req, 'auth.logout', { actorId: req.auth.userId });
  res.json({ ok: true });
}));

/** GET /api/auth/me — user + memberships + unread notification count. */
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const memberships = await Membership.find({ userId: req.auth!.userId, status: { $in: ['active', 'pending'] } })
    .populate('workshopId', 'name status')
    .lean();
  const { unreadCountFor } = await import('../utils/notifications-util');
  res.json({
    user: publicUser(req.user!),
    memberships: memberships.map((m) => ({
      id: m._id.toString(),
      workshopId: (m.workshopId as unknown as { _id: string })._id?.toString?.() ?? m.workshopId,
      workshopName: (m.workshopId as unknown as { name?: string }).name ?? '',
      workshopStatus: (m.workshopId as unknown as { status?: string }).status ?? 'active',
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt?.toISOString() ?? null,
    })),
    unreadNotifications: await unreadCountFor(req.auth!.userId),
  });
}));

/** PATCH /api/auth/me — profile preferences + avatar (base64, auto-saved). */
router.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const data = updateMeSchema.parse(req.body);
  const user = req.user!;
  if (data.name !== undefined) user.name = data.name;
  if (data.preferredLanguage !== undefined) user.preferredLanguage = data.preferredLanguage;
  if (data.theme !== undefined) user.theme = data.theme;
  if (data.fontScale !== undefined) user.fontScale = data.fontScale;
  if (data.soundEnabled !== undefined) user.soundEnabled = data.soundEnabled;
  if (data.avatar !== undefined) user.avatar = sanitizeAvatar(data.avatar);
  await user.save();
  res.json({ user: publicUser(user) });
}));

/** POST /api/auth/change-password */
router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const data = changePasswordSchema.parse(req.body);
  const user = await User.findById(req.auth!.userId).select('+passwordHash');
  if (!user) throw new ApiError(404, 'errors.userNotFound');
  const ok = await bcrypt.compare(data.currentPassword, user.passwordHash);
  if (!ok) throw new ApiError(400, 'errors.invalidCredentials');
  const same = await bcrypt.compare(data.newPassword, user.passwordHash);
  if (same) throw new ApiError(400, 'errors.passwordSameAsOld');
  user.passwordHash = await bcrypt.hash(data.newPassword, 12);
  await user.save();
  await revokeAllUserTokens(user._id.toString());
  await audit(req, 'auth.password_change', { actorId: user._id.toString() });
  res.json({ ok: true });
}));

/**
 * POST /api/auth/recover-password — recovery-phrase based (replaces the email flow).
 * Failing phrase/email combinations return a generic invalid-credentials error to
 * avoid account enumeration; success resets the password and revokes all sessions.
 */
router.post('/recover-password', forgotLimiter, asyncHandler(async (req, res) => {
  const data = recoverPasswordSchema.parse(req.body);
  const user = await User.findOne({ email: data.email }).select('+recoveryHash +passwordHash');
  if (!user || !user.recoveryHash || user.status !== 'active') {
    throw new ApiError(400, 'errors.invalidCredentials');
  }
  if (hashPhrase(data.recoveryPhrase) !== user.recoveryHash) {
    await audit(req, 'auth.recover_failed', { actorEmail: data.email });
    throw new ApiError(400, 'errors.invalidCredentials');
  }
  user.passwordHash = await bcrypt.hash(data.newPassword, 12);
  await user.save();
  await revokeAllUserTokens(user._id.toString());
  await audit(req, 'auth.password_recovered', { actorId: user._id.toString() });
  await notifyUser({
    userId: user._id.toString(),
    type: 'password_changed',
    params: {},
    link: '/login',
  });
  res.json({ ok: true });
}));

/**
 * POST /api/auth/request-reset — worker asks his workshop supervisors for a
 * password reset. Creates a request + notification to the supervisors.
 */
router.post('/request-reset', forgotLimiter, asyncHandler(async (req, res) => {
  const data = requestResetSchema.parse(req.body);
  const user = await User.findOne({ email: data.email }).select('_id name email status');
  // Generic response — no account enumeration.
  if (user && user.status === 'active') {
    const membership = await Membership.findOne({ userId: user._id, status: 'active' }).select('workshopId');
    const existing = await PasswordResetRequest.findOne({ userId: user._id, status: 'pending' });
    if (membership && !existing) {
      const request = await PasswordResetRequest.create({
        userId: user._id,
        workshopId: membership.workshopId,
        status: 'pending',
      });
      await notifyWorkshopSupervisors(membership.workshopId.toString(), {
        type: 'password_reset_request',
        params: { name: user.name, email: user.email },
        // Deep-link straight into the password-reset requests tab.
        link: '/workers?tab=requests',
        workshopId: membership.workshopId.toString(),
        dedupKey: `reset-req:${request._id}`,
      });
      await audit(req, 'auth.reset_requested', { targetId: user._id.toString(), actorEmail: user.email });
    }
  }
  res.json({ ok: true });
}));

/** GET /api/auth/socket-token — short-lived JWT for the Socket.IO handshake. */
router.get('/socket-token', requireAuth, asyncHandler(async (_req, res) => {
  const token = await signAccessToken(_req.auth!.userId, _req.auth!.role, JWT_AUD.SOCKET);
  res.json({ token, expiresIn: SOCKET_TOKEN_TTL });
}));

export default router;
