import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../db/models/User';
import { Workshop } from '../db/models/Workshop';
import { Membership } from '../db/models/Membership';
import { AuditLog } from '../db/models/AuditLog';
import { Task } from '../db/models/Task';
import { AppNotificationDoc as Notification } from '../db/models/Notification';
import { PasswordResetRequest } from '../db/models/PasswordResetRequest';
import { hashPhrase, sanitizeAvatar } from './auth';
import { adminUpdateUserSchema, platformSettingsSchema, createWorkerSchema, setWorkerPasswordSchema, invitationEditSchema } from '@ats/shared';
import { ApiError, asyncHandler } from '../middleware/errors';
import { requireAuth, requireSuperAdmin } from '../middleware/auth';
import { audit } from '../services/audit';
import { revokeAllUserTokens } from '../services/tokens';
import { updatePlatformSettings, getPlatformSettings } from '../services/settings';
import { notifyUser, notifyWorkshopSupervisors } from '../services/notifications';
import { Invitation } from '../db/models/Invitation';

const router = Router();
router.use(requireAuth, requireSuperAdmin);

// ---------- Users ----------

/** GET /api/admin/users */
router.get('/users', asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '25'), 10) || 25));
  const q = String(req.query.q ?? '').trim();
  const filter: Record<string, unknown> = {};
  if (q) filter.$or = [{ name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }];
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    User.countDocuments(filter),
  ]);
  const userIds = users.map((u) => u._id);
  const memberships = await Membership.find({ userId: { $in: userIds }, status: 'active' }).populate('workshopId', 'name').lean();
  res.json({
    items: users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      workshops: memberships
        .filter((m) => m.userId.toString() === u._id.toString())
        .map((m) => ({
          workshopId: m.workshopId.toString(),
          workshopName: (m.workshopId as unknown as { name?: string }).name ?? '',
          role: m.role,
        })),
    })),
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
  });
}));

/** PATCH /api/admin/users/:id — suspend/activate, change platform role, rename. */
router.patch('/users/:id', asyncHandler(async (req: Request, res: Response) => {
  const data = adminUpdateUserSchema.parse(req.body);
  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'errors.userNotFound');
  if (target.role === 'super_admin' && target._id.toString() !== req.auth!.userId) {
    throw new ApiError(403, 'errors.cannotModifySuperAdmin');
  }
  if (target._id.toString() === req.auth!.userId && data.status === 'suspended') {
    throw new ApiError(400, 'errors.forbidden');
  }
  if (data.status !== undefined && data.status !== target.status) {
    target.status = data.status;
    if (data.status === 'suspended') await revokeAllUserTokens(target._id.toString());
    await notifyUser({
      userId: target._id.toString(),
      type: data.status === 'suspended' ? 'account_suspended' : 'account_activated',
      params: {},
      link: '/dashboard',
      push: false,
    });
    await audit(req, data.status === 'suspended' ? 'user.suspend' : 'user.activate', { targetId: target._id.toString(), targetType: 'user' });
  }
  if (data.role !== undefined && data.role !== target.role && target.role !== 'super_admin') {
    target.role = data.role;
    // Keep workshop memberships in sync so the new role applies EVERYWHERE
    // immediately (permissions, dashboards, supervisor notifications are all
    // membership-driven). Super-admin is a platform-level role only.
    if (data.role !== 'super_admin') {
      await Membership.updateMany(
        { userId: target._id, status: 'active' },
        { $set: { role: data.role } },
      );
    }
    await audit(req, 'user.role_change', { targetId: target._id.toString(), targetType: 'user', meta: { role: data.role } });
  }
  if (data.name !== undefined) target.name = data.name;
  if (data.email !== undefined && data.email !== target.email) {
    const clash = await User.exists({ email: data.email, _id: { $ne: target._id } });
    if (clash) throw new ApiError(409, 'errors.duplicateEmail');
    target.email = data.email;
  }
  await target.save();
  res.json({ ok: true });
}));

/** DELETE /api/admin/users/:id — permanently remove a worker/supervisor account. */
router.delete('/users/:id', asyncHandler(async (req: Request, res: Response) => {
  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'errors.userNotFound');
  if (target.role === 'super_admin') throw new ApiError(403, 'errors.cannotModifySuperAdmin');
  if (target._id.toString() === req.auth!.userId) throw new ApiError(400, 'errors.forbidden');

  const userId = target._id;
  // Unassign the user's open tasks (keep history: assigneeName/changeLog intact).
  await Task.updateMany(
    { assigneeId: userId, status: { $nin: ['completed_approved', 'cancelled'] } },
    { $set: { assigneeId: null } },
  );
  await Membership.deleteMany({ userId });
  await Notification.deleteMany({ userId });
  await PasswordResetRequest.deleteMany({ userId });
  await revokeAllUserTokens(userId.toString());
  await target.deleteOne();
  await audit(req, 'user.deleted', { targetId: userId.toString(), targetType: 'user', meta: { email: target.email } });
  res.json({ ok: true });
}));

/**
 * POST /api/admin/users — create a worker (or supervisor) account and attach it
 * to a workshop directly. Password chosen here is shared once with the person.
 */
router.post('/users', asyncHandler(async (req: Request, res: Response) => {
  const data = createWorkerSchema.parse(req.body);
  const exists = await User.exists({ email: data.email });
  if (exists) throw new ApiError(409, 'errors.duplicateEmail');
  if (!data.workshopId || !Types.ObjectId.isValid(data.workshopId)) throw new ApiError(400, 'errors.workshopRequired');
  const workshop = await Workshop.findById(data.workshopId).select('name status');
  if (!workshop) throw new ApiError(404, 'errors.notFound');

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await User.create({
    email: data.email,
    passwordHash,
    name: data.name,
    role: data.role,
    status: 'active',
    gender: data.gender ?? null,
    birthDate: data.birthDate ?? null,
    bloodType: data.bloodType ?? null,
    recoveryHash: hashPhrase(data.recoveryPhrase),
    avatar: sanitizeAvatar(data.avatar),
  });
  await Membership.create({
    workshopId: workshop._id,
    userId: user._id,
    role: data.role,
    status: 'active',
    invitedById: new Types.ObjectId(req.auth!.userId),
    joinedAt: new Date(),
  });
  await audit(req, 'user.created', { targetId: user._id.toString(), workshopId: workshop._id.toString(), meta: { role: data.role } });
  await notifyWorkshopSupervisors(workshop._id.toString(), {
    type: 'worker_created',
    params: { name: user.name, creator: req.user?.name ?? '' },
    link: '/workers',
    workshopId: workshop._id.toString(),
    dedupKey: `created:${user._id}`,
  });
  res.status(201).json({ user: { id: user._id.toString(), name: user.name, email: user.email } });
}));

/**
 * POST /api/admin/users/:id/set-password — direct password change (replaces the
 * old one-time reset link). The plaintext password is included in the realtime
 * notification sent to the worker's responsible supervisor(s), per the platform
 * operating procedure; the worker gets a generic change notification too.
 */
router.post('/users/:id/set-password', asyncHandler(async (req: Request, res: Response) => {
  const data = setWorkerPasswordSchema.parse(req.body);
  const target = await User.findById(req.params.id).select('+passwordHash');
  if (!target) throw new ApiError(404, 'errors.userNotFound');
  if (target.role === 'super_admin' && target._id.toString() !== req.auth!.userId) {
    throw new ApiError(403, 'errors.cannotModifySuperAdmin');
  }
  target.passwordHash = await bcrypt.hash(data.password, 12);
  await target.save();
  await revokeAllUserTokens(target._id.toString());
  await audit(req, 'auth.password_set_by_admin', { targetId: target._id.toString(), actorEmail: target.email });

  await notifyUser({
    userId: target._id.toString(),
    type: 'password_changed',
    params: {},
    link: '/login',
  });
  const memberships = await Membership.find({ userId: target._id, status: 'active' }).select('workshopId').lean();
  for (const m of memberships) {
    await notifyWorkshopSupervisors(m.workshopId.toString(), {
      type: 'password_changed_by_admin',
      params: { name: target.name, password: data.password },
      link: '/workers',
      workshopId: m.workshopId.toString(),
      dedupKey: `pw-admin:${target._id}:${Date.now()}`,
    });
  }
  res.json({ ok: true });
}));

// ---------- Workshops ----------

/** PATCH /api/admin/workshops/:id — suspend/activate/edit any workshop. */
router.patch('/workshops/:id', asyncHandler(async (req: Request, res: Response) => {
  const target = await Workshop.findById(req.params.id);
  if (!target) throw new ApiError(404, 'errors.notFound');
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.status === 'string' && ['active', 'suspended'].includes(body.status) && body.status !== target.status) {
    target.status = body.status as 'active' | 'suspended';
    await audit(req, body.status === 'suspended' ? 'workshop.suspend' : 'workshop.activate', {
      workshopId: target._id.toString(), targetId: target._id.toString(), targetType: 'workshop',
    });
  }
  for (const field of ['name', 'description', 'address', 'contactPhone', 'contactEmail', 'timezone'] as const) {
    if (typeof body[field] === 'string') target[field] = body[field] as string;
  }
  await target.save();
  res.json({ ok: true });
}));

// ---------- Invitation codes management (full super-admin control) ----------

/** GET /api/admin/invitations — every code across all workshops. */
router.get('/invitations', asyncHandler(async (_req: Request, res: Response) => {
  const invitations = await Invitation.find().sort({ createdAt: -1 }).limit(200)
    .populate('workshopId', 'name')
    .populate('createdById', 'name')
    .lean();
  res.json({
    items: invitations.map((i) => ({
      id: i._id.toString(),
      code: i.code,
      role: i.role,
      autoJoin: i.autoJoin,
      maxUses: i.maxUses,
      uses: i.uses,
      revoked: Boolean(i.revokedAt),
      expired: i.expiresAt.getTime() < Date.now(),
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
      workshopName: (i.workshopId as unknown as { name?: string })?.name ?? '',
      workshopId: (i.workshopId as unknown as { _id?: { toString(): string } })?._id?.toString?.() ?? '',
      createdByName: (i.createdById as unknown as { name?: string })?.name ?? '',
    })),
  });
}));

/** PATCH /api/admin/invitations/:id — edit limits/expiry/auto-join and/or toggle revocation. */
router.patch('/invitations/:id', asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(String(req.params.id))) throw new ApiError(404, 'errors.notFound');
  const data = invitationEditSchema.parse(req.body);
  const invitation = await Invitation.findById(req.params.id);
  if (!invitation) throw new ApiError(404, 'errors.notFound');
  if (data.maxUses !== undefined) invitation.maxUses = data.maxUses;
  if (data.autoJoin !== undefined) invitation.autoJoin = data.autoJoin;
  if (data.expiresInDays !== undefined) {
    invitation.expiresAt = new Date(Date.now() + data.expiresInDays * 24 * 3600 * 1000);
    invitation.revokedAt = null;
  }
  if (data.revoked !== undefined) invitation.revokedAt = data.revoked ? new Date() : null;
  await invitation.save();
  await audit(req, 'invitation.updated', { targetId: invitation._id.toString(), meta: { revoked: Boolean(invitation.revokedAt) } });
  res.json({ ok: true });
}));

/** DELETE /api/admin/invitations/:id — permanent delete. */
router.delete('/invitations/:id', asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(String(req.params.id))) throw new ApiError(404, 'errors.notFound');
  const invitation = await Invitation.findByIdAndDelete(req.params.id);
  if (!invitation) throw new ApiError(404, 'errors.notFound');
  await audit(req, 'invitation.deleted', { targetId: String(req.params.id), meta: { code: invitation.code } });
  res.json({ ok: true });
}));

// ---------- Activity log ----------


/** GET /api/admin/activity */
router.get('/activity', asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '30'), 10) || 30));
  const [items, total] = await Promise.all([
    AuditLog.find().sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize)
      .populate('actorId', 'name email')
      .lean(),
    AuditLog.countDocuments(),
  ]);
  res.json({
    items: items.map((a) => ({
      id: a._id.toString(),
      action: a.action,
      actorId: a.actorId ? (a.actorId as unknown as { _id: Types.ObjectId })._id.toString() : null,
      actorName: (a.actorId as unknown as { name?: string })?.name ?? '',
      actorEmail: a.actorEmail,
      workshopId: a.workshopId?.toString() ?? null,
      targetType: a.targetType,
      targetId: a.targetId,
      meta: a.meta,
      ip: a.ip,
      createdAt: a.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
  });
}));

/** DELETE /api/admin/activity — one-click audit log wipe (audited itself). */
router.delete('/activity', asyncHandler(async (req: Request, res: Response) => {
  const removed = await AuditLog.deleteMany({});
  await AuditLog.create({
    actorId: new Types.ObjectId(req.auth!.userId),
    actorEmail: req.user?.email ?? '',
    action: 'activity.clear',
    targetType: 'audit_log',
    meta: { removed: removed.deletedCount ?? 0 },
    ip: req.ip ?? '',
  });
  res.json({ ok: true, removed: removed.deletedCount ?? 0 });
}));

// ---------- Platform settings ----------

/** GET /api/admin/settings */
router.get('/settings', asyncHandler(async (_req: Request, res: Response) => {
  res.json({ settings: await getPlatformSettings() });
}));

/** PUT /api/admin/settings */
router.put('/settings', asyncHandler(async (req: Request, res: Response) => {
  const data = platformSettingsSchema.parse(req.body);
  const settings = await updatePlatformSettings(data);
  await audit(req, 'settings.update', { targetType: 'platform_settings' });
  res.json({ settings });
}));

export default router;
