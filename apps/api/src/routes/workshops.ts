import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { Workshop } from '../db/models/Workshop';
import { Membership } from '../db/models/Membership';
import { Invitation } from '../db/models/Invitation';
import { User } from '../db/models/User';
import { Task } from '../db/models/Task';
import { workshopUpdateSchema, invitationSchema, memberRoleSchema, memberStatusSchema, workshopSchema, createWorkerSchema, setWorkerPasswordSchema, invitationEditSchema } from '@ats/shared';
import { ApiError, asyncHandler } from '../middleware/errors';
import { requireAuth } from '../middleware/auth';
import { requireWorkshopScope, requireSupervisorInScope } from '../middleware/scope';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PasswordResetRequest } from '../db/models/PasswordResetRequest';
import { hashPhrase, sanitizeAvatar } from './auth';
import { revokeAllUserTokens } from '../services/tokens';
import { audit } from '../services/audit';
import { notifyUser, notifyWorkshopSupervisors } from '../services/notifications';

const router = Router();
router.use(requireAuth);

function serializeWorkshop(w: { _id: Types.ObjectId; name: string; description: string; address: string; contactPhone: string; contactEmail: string; timezone: string; status: 'active' | 'suspended'; createdAt: Date }, counts?: { memberCount?: number; activeTaskCount?: number; overdueTaskCount?: number }) {
  return {
    id: w._id.toString(),
    name: w.name,
    description: w.description,
    address: w.address,
    contactPhone: w.contactPhone,
    contactEmail: w.contactEmail,
    timezone: w.timezone,
    status: w.status,
    createdAt: w.createdAt.toISOString(),
    ...counts,
  };
}

/** GET /api/workshops — my workshops (any role) / all workshops (super admin). */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const isSuper = req.auth!.role === 'super_admin';
  if (isSuper) {
    const workshops = await Workshop.find().sort({ createdAt: -1 }).lean();
    const items = [];
    for (const w of workshops) {
      const [memberCount, activeTaskCount, overdueTaskCount] = await Promise.all([
        Membership.countDocuments({ workshopId: w._id, status: 'active' }),
        Task.countDocuments({ workshopId: w._id, status: { $in: ['scheduled', 'in_progress', 'worker_reported_done', 'awaiting_supervisor_review', 'overdue'] } }),
        Task.countDocuments({ workshopId: w._id, status: 'overdue' }),
      ]);
      items.push(serializeWorkshop(w as never, { memberCount, activeTaskCount, overdueTaskCount }));
    }
    res.json({ items });
    return;
  }
  const memberships = await Membership.find({ userId: req.auth!.userId, status: { $in: ['active', 'pending'] } }).lean();
  const ids = memberships.map((m) => m.workshopId);
  const workshops = await Workshop.find({ _id: { $in: ids } }).sort({ createdAt: -1 }).lean();
  const items = workshops.map((w) => {
    const m = memberships.find((mm) => mm.workshopId.toString() === w._id.toString());
    return { ...serializeWorkshop(w as never), membershipRole: m?.role, membershipStatus: m?.status };
  });
  res.json({ items });
}));

/** POST /api/workshops — super admin only. */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  if (req.auth!.role !== 'super_admin') throw new ApiError(403, 'errors.forbidden');
  const data = workshopSchema.parse(req.body);
  const workshop = await Workshop.create({ ...data, createdById: new Types.ObjectId(req.auth!.userId) });
  await audit(req, 'workshop.create', { targetType: 'workshop', targetId: workshop._id.toString(), meta: { name: workshop.name } });
  res.status(201).json({ workshop: serializeWorkshop(workshop as never) });
}));

/** GET /api/workshops/:id — scoped detail. */
router.get('/:workshopId', requireWorkshopScope(), asyncHandler(async (req: Request, res: Response) => {
  const scope = req.workshopScope!;
  const w = await Workshop.findById(scope.workshopId).lean();
  if (!w) throw new ApiError(404, 'errors.notFound');
  const memberCount = await Membership.countDocuments({ workshopId: scope.workshopId, status: 'active' });
  res.json({ workshop: serializeWorkshop(w as never, { memberCount }), myRole: scope.role });
}));

/** PATCH /api/workshops/:id — supervisor of THIS workshop (or super admin). */
router.patch('/:workshopId', requireWorkshopScope(), requireSupervisorInScope, asyncHandler(async (req: Request, res: Response) => {
  const data = workshopUpdateSchema.parse(req.body);
  const w = await Workshop.findByIdAndUpdate(req.workshopScope!.workshopId, { $set: data }, { new: true });
  if (!w) throw new ApiError(404, 'errors.notFound');
  await audit(req, 'workshop.update', { workshopId: w._id.toString(), targetType: 'workshop', targetId: w._id.toString() });
  res.json({ workshop: serializeWorkshop(w as never) });
}));

// ---------- Members ----------

/** GET /api/workshops/:id/members */
router.get('/:workshopId/members', requireWorkshopScope(), asyncHandler(async (req: Request, res: Response) => {
  const scope = req.workshopScope!;
  const members = await Membership.find({ workshopId: scope.workshopId, status: { $in: ['active', 'pending', 'suspended'] } })
    .populate('userId', 'name email lastLoginAt status preferredLanguage')
    .sort({ role: 1, createdAt: 1 })
    .lean();
  const items = members.map((m) => {
    const u = m.userId as unknown as { _id: Types.ObjectId; name: string; email: string; lastLoginAt: Date | null; status: string };
    return {
      id: m._id.toString(),
      userId: u._id.toString(),
      name: u.name,
      email: u.email,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt?.toISOString() ?? null,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      accountStatus: u.status,
    };
  });
  res.json({ items });
}));

/** POST /api/workshops/:id/members — supervisor adds an existing user by email. */
router.post('/:workshopId/members', requireWorkshopScope(), requireSupervisorInScope, asyncHandler(async (req: Request, res: Response) => {
  const scope = req.workshopScope!;
  const body = (req.body ?? {}) as { email?: string; role?: 'worker' | 'supervisor' };
  if (!body.email) throw new ApiError(400, 'errors.invalidEmail');
  const email = String(body.email).toLowerCase().trim();
  const user = await User.findOne({ email }).select('_id name');
  if (!user) throw new ApiError(404, 'errors.userNotFound');
  const role = body.role === 'supervisor' ? 'supervisor' : 'worker';
  const existing = await Membership.findOne({ workshopId: scope.workshopId, userId: user._id });
  if (existing && existing.status === 'active') throw new ApiError(409, 'errors.duplicateMembership');
  if (existing && existing.status === 'pending') throw new ApiError(409, 'errors.pendingMembership');
  if (existing) {
    existing.status = 'active';
    existing.role = role;
    existing.joinedAt = existing.joinedAt ?? new Date();
    await existing.save();
  } else {
    await Membership.create({
      workshopId: scope.workshopId, userId: user._id, role, status: 'active',
      invitedById: new Types.ObjectId(req.auth!.userId), joinedAt: new Date(),
    });
  }
  await notifyUser({
    userId: user._id.toString(),
    type: 'membership_approved',
    params: { workshop: scope.workshop.name },
    link: '/dashboard',
    workshopId: scope.workshopId.toString(),
  });
  await audit(req, 'member.status_change', { workshopId: scope.workshopId.toString(), targetId: user._id.toString(), meta: { role, via: 'added_by_supervisor' } });
  res.status(201).json({ ok: true });
}));

/** PATCH /api/workshops/:id/members/:userId — role/status changes by supervisor. */
router.patch('/:workshopId/members/:userId', requireWorkshopScope(), requireSupervisorInScope, asyncHandler(async (req: Request, res: Response) => {
  const scope = req.workshopScope!;
  const targetUserId = req.params.userId;
  if (!Types.ObjectId.isValid(String(targetUserId))) throw new ApiError(404, 'errors.memberNotFound');

  const roleChange = memberRoleSchema.safeParse(req.body);
  const statusChange = memberStatusSchema.safeParse(req.body);

  if (roleChange.success) {
    const membership = await Membership.findOne({ workshopId: scope.workshopId, userId: new Types.ObjectId(targetUserId), status: 'active' });
    if (!membership) throw new ApiError(404, 'errors.memberNotFound');
    membership.role = roleChange.data.role;
    await membership.save();
    await audit(req, 'member.role_change', { workshopId: scope.workshopId.toString(), targetId: targetUserId, meta: { role: roleChange.data.role } });
    res.json({ ok: true });
    return;
  }
  if (statusChange.success) {
    const membership = await Membership.findOne({ workshopId: scope.workshopId, userId: new Types.ObjectId(targetUserId) });
    if (!membership) throw new ApiError(404, 'errors.memberNotFound');
    const newStatus = statusChange.data.status;
    if (membership.role === 'supervisor' && newStatus !== 'active') {
      const supervisors = await Membership.countDocuments({ workshopId: scope.workshopId, role: 'supervisor', status: 'active' });
      if (supervisors <= 1) throw new ApiError(400, 'members.removeLastSupervisor');
    }
    membership.status = newStatus;
    if (newStatus === 'active' && !membership.joinedAt) membership.joinedAt = new Date();
    await membership.save();
    await audit(req, 'member.status_change', { workshopId: scope.workshopId.toString(), targetId: targetUserId, meta: { status: newStatus } });
    if (newStatus === 'removed') {
      await notifyUser({
        userId: String(targetUserId),
        type: 'membership_removed',
        params: { workshop: scope.workshop.name },
        link: '/workshop',
      });
    }
    res.json({ ok: true });
    return;
  }
  throw new ApiError(400, 'errors.required');
}));

/** POST /api/workshops/:id/members/create - supervisor creates a new account in HIS workshop.
 * role is 'worker' (default) or 'delivery_worker' — both workshop-bound accounts. */
router.post('/:workshopId/members/create', requireWorkshopScope(), requireSupervisorInScope, asyncHandler(async (req: Request, res: Response) => {
  const scope = req.workshopScope!;
  const memberRole = req.body?.role === 'delivery_worker' ? 'delivery_worker' : 'worker';
  const data = createWorkerSchema.parse({ ...(req.body ?? {}), workshopId: scope.workshopId.toString(), role: memberRole });
  const exists = await User.exists({ email: data.email });
  if (exists) throw new ApiError(409, 'errors.duplicateEmail');
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await User.create({
    email: data.email,
    passwordHash,
    name: data.name,
    role: memberRole,
    status: 'active',
    preferredLanguage: 'ar',
    gender: data.gender ?? null,
    birthDate: data.birthDate ?? null,
    bloodType: data.bloodType ?? null,
    recoveryHash: hashPhrase(data.recoveryPhrase),
    avatar: sanitizeAvatar(data.avatar),
  });
  await Membership.create({
    workshopId: scope.workshopId,
    userId: user._id,
    role: memberRole,
    status: 'active',
    invitedById: new Types.ObjectId(req.auth!.userId),
    joinedAt: new Date(),
  });
  await audit(req, 'member.status_change', { workshopId: scope.workshopId.toString(), targetId: user._id.toString(), meta: { via: 'created_by_supervisor', role: memberRole } });
  await notifyWorkshopSupervisors(scope.workshopId.toString(), {
    type: 'worker_created',
    params: { name: user.name, creator: req.user?.name ?? '' },
    link: '/workers',
    workshopId: scope.workshopId.toString(),
    dedupKey: `created:${user._id}`,
  });
  res.status(201).json({ user: { id: user._id.toString(), name: user.name, email: user.email, role: memberRole } });
}));

// ---------- Password reset requests (worker -> supervisor) ----------

/** GET /api/workshops/:id/reset-requests - pending requests for this workshop. */
router.get('/:workshopId/reset-requests', requireWorkshopScope(), requireSupervisorInScope, asyncHandler(async (req: Request, res: Response) => {
  const scope = req.workshopScope!;
  const requests = await PasswordResetRequest.find({ workshopId: scope.workshopId, status: 'pending' })
    .sort({ createdAt: -1 }).limit(50)
    .populate('userId', 'name email avatar')
    .lean();
  res.json({
    items: (requests as unknown as Array<{ _id: { toString(): string }; userId: { _id: { toString(): string }; name?: string; email?: string; avatar?: string | null }; createdAt: Date }>).map((r) => {
      const u = r.userId as unknown as { _id: { toString(): string }; name?: string; email?: string; avatar?: string | null };
      return {
        id: r._id.toString(),
        userId: u._id.toString(),
        name: u.name ?? '',
        email: u.email ?? '',
        avatar: u.avatar ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  });
}));

/** POST /api/workshops/:id/reset-requests/:reqId/approve - set a new password for the worker. */
router.post('/:workshopId/reset-requests/:reqId/approve', requireWorkshopScope(), requireSupervisorInScope, asyncHandler(async (req: Request, res: Response) => {
  const scope = req.workshopScope!;
  const data = setWorkerPasswordSchema.parse(req.body);
  if (!Types.ObjectId.isValid(String(req.params.reqId))) throw new ApiError(404, 'errors.notFound');
  const request = await PasswordResetRequest.findOne({ _id: req.params.reqId, workshopId: scope.workshopId, status: 'pending' });
  if (!request) throw new ApiError(404, 'errors.notFound');
  const target = await User.findById(request.userId).select('+passwordHash');
  if (!target) throw new ApiError(404, 'errors.userNotFound');
  target.passwordHash = await bcrypt.hash(data.password, 12);
  await target.save();
  request.status = 'approved';
  request.handledById = new Types.ObjectId(req.auth!.userId);
  request.handledAt = new Date();
  await request.save();
  await revokeAllUserTokens(target._id.toString());
  await audit(req, 'auth.password_set_by_supervisor', { workshopId: scope.workshopId.toString(), targetId: target._id.toString() });
  await notifyUser({
    userId: target._id.toString(),
    type: 'password_changed',
    params: {},
    link: '/login',
  });
  res.json({ ok: true });
}));

/** POST /api/workshops/:id/reset-requests/:reqId/dismiss */
router.post('/:workshopId/reset-requests/:reqId/dismiss', requireWorkshopScope(), requireSupervisorInScope, asyncHandler(async (req: Request, res: Response) => {
  const scope = req.workshopScope!;
  if (!Types.ObjectId.isValid(String(req.params.reqId))) throw new ApiError(404, 'errors.notFound');
  const request = await PasswordResetRequest.findOne({ _id: req.params.reqId, workshopId: scope.workshopId, status: 'pending' });
  if (!request) throw new ApiError(404, 'errors.notFound');
  request.status = 'dismissed';
  request.handledById = new Types.ObjectId(req.auth!.userId);
  request.handledAt = new Date();
  await request.save();
  res.json({ ok: true });
}));

// ---------- Invitations ----------


/** POST /api/workshops/:id/invitations — supervisor creates a shareable code. */
router.post('/:workshopId/invitations', requireWorkshopScope(), requireSupervisorInScope, asyncHandler(async (req: Request, res: Response) => {
  const scope = req.workshopScope!;
  const data = invitationSchema.parse(req.body ?? {});
  const code = `${scope.workshop.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'WS'}-${randomBytes(4).toString('hex').toUpperCase()}`;
  const invitation = await Invitation.create({
    workshopId: scope.workshopId,
    code,
    role: data.role,
    autoJoin: data.autoJoin,
    maxUses: data.maxUses,
    expiresAt: new Date(Date.now() + data.expiresInDays * 24 * 3600 * 1000),
    createdById: new Types.ObjectId(req.auth!.userId),
  });
  await audit(req, 'workshop.update', { workshopId: scope.workshopId.toString(), targetType: 'invitation', targetId: invitation._id.toString() });
  res.status(201).json({
    invitation: {
      id: invitation._id.toString(),
      code: invitation.code,
      role: invitation.role,
      autoJoin: invitation.autoJoin,
      maxUses: invitation.maxUses,
      uses: invitation.uses,
      expiresAt: invitation.expiresAt.toISOString(),
    },
  });
}));

/** GET /api/workshops/:id/invitations — active codes of the workshop. */
router.get('/:workshopId/invitations', requireWorkshopScope(), requireSupervisorInScope, asyncHandler(async (req: Request, res: Response) => {
  const scope = req.workshopScope!;
  const invitations = await Invitation
    .find({ workshopId: scope.workshopId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  res.json({
    items: invitations.map((i) => ({
      id: i._id.toString(),
      code: i.code,
      role: i.role,
      autoJoin: i.autoJoin,
      maxUses: i.maxUses,
      uses: i.uses,
      expiresAt: i.expiresAt.toISOString(),
      remaining: Math.max(0, i.maxUses - i.uses),
    })),
  });
}));

/** PATCH /api/workshops/:id/invitations/:inviteId - revoke/restore or edit limits. */
router.patch('/:workshopId/invitations/:inviteId', requireWorkshopScope(), requireSupervisorInScope, asyncHandler(async (req: Request, res: Response) => {
  const scope = req.workshopScope!;
  if (!Types.ObjectId.isValid(String(req.params.inviteId))) throw new ApiError(404, 'errors.notFound');
  const invitation = await Invitation.findOne({ _id: req.params.inviteId, workshopId: scope.workshopId });
  if (!invitation) throw new ApiError(404, 'errors.notFound');
  const data = invitationEditSchema.parse(req.body ?? {});
  if (data.maxUses !== undefined) invitation.maxUses = data.maxUses;
  if (data.autoJoin !== undefined) invitation.autoJoin = data.autoJoin;
  if (data.expiresInDays !== undefined) {
    invitation.expiresAt = new Date(Date.now() + data.expiresInDays * 24 * 3600 * 1000);
    invitation.revokedAt = null;
  }
  if (data.revoked !== undefined) invitation.revokedAt = data.revoked ? new Date() : null;
  await invitation.save();
  await audit(req, 'invitation.updated', { workshopId: scope.workshopId.toString(), targetId: invitation._id.toString() });
  res.json({ ok: true });
}));

/** DELETE /api/workshops/:id/invitations/:inviteId */
router.delete('/:workshopId/invitations/:inviteId', requireWorkshopScope(), requireSupervisorInScope, asyncHandler(async (req: Request, res: Response) => {
  const scope = req.workshopScope!;
  if (!Types.ObjectId.isValid(String(req.params.inviteId))) throw new ApiError(404, 'errors.notFound');
  const invitation = await Invitation.findOneAndDelete({ _id: req.params.inviteId, workshopId: scope.workshopId });
  if (!invitation) throw new ApiError(404, 'errors.notFound');
  await audit(req, 'invitation.deleted', { workshopId: scope.workshopId.toString(), targetId: String(req.params.inviteId) });
  res.json({ ok: true });
}));

export default router;
