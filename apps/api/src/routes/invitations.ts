import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { Invitation } from '../db/models/Invitation';
import { Membership } from '../db/models/Membership';
import { Workshop } from '../db/models/Workshop';
import { redeemSchema } from '@ats/shared';
import { ApiError, asyncHandler } from '../middleware/errors';
import { requireAuth } from '../middleware/auth';
import { audit } from '../services/audit';
import { notifyUser } from '../services/notifications';

const router = Router();

/** GET /api/invitations/:code — invite preview (no auth: the receiver may not have an account yet). */
router.get('/:code', asyncHandler(async (req: Request, res: Response) => {
  const code = String(req.params.code ?? '').toUpperCase().trim();
  const invitation = await Invitation.findOne({ code }).lean();
  if (!invitation || invitation.revokedAt || invitation.expiresAt.getTime() < Date.now() || invitation.uses >= invitation.maxUses) {
    throw new ApiError(404, 'invite.invalid');
  }
  const workshop = await Workshop.findById(invitation.workshopId).select('name').lean();
  res.json({
    invite: {
      workshopName: workshop?.name ?? '',
      role: invitation.role,
      autoJoin: invitation.autoJoin,
      expiresAt: invitation.expiresAt.toISOString(),
      remaining: Math.max(0, invitation.maxUses - invitation.uses),
    },
  });
}));

/** POST /api/invitations/redeem — worker joins via code (session required). */
router.post('/redeem', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const data = redeemSchema.parse(req.body);
  const code = data.code.toUpperCase().trim();
  const invitation = await Invitation.findOne({ code });
  if (!invitation || invitation.revokedAt || invitation.expiresAt.getTime() < Date.now() || invitation.uses >= invitation.maxUses) {
    throw new ApiError(400, 'errors.codeInvalid');
  }
  const userId = req.auth!.userId;
  const existing = await Membership.findOne({ workshopId: invitation.workshopId, userId: new Types.ObjectId(userId) });
  if (existing && existing.status === 'active') throw new ApiError(409, 'errors.duplicateMembership');
  if (existing && existing.status === 'pending') throw new ApiError(409, 'errors.pendingMembership');

  const status = invitation.autoJoin ? 'active' : 'pending';
  if (existing) {
    existing.status = status;
    existing.role = invitation.role;
    existing.joinedAt = status === 'active' ? (existing.joinedAt ?? new Date()) : existing.joinedAt;
    await existing.save();
  } else {
    await Membership.create({
      workshopId: invitation.workshopId,
      userId: new Types.ObjectId(userId),
      role: invitation.role,
      status,
      invitedById: invitation.createdById,
      joinedAt: status === 'active' ? new Date() : null,
    });
  }
  invitation.uses += 1;
  await invitation.save();

  const workshop = await Workshop.findById(invitation.workshopId).select('name').lean();
  await notifyUser({
    userId,
    type: 'membership_approved',
    params: { workshop: workshop?.name ?? '' },
    link: '/dashboard',
    workshopId: invitation.workshopId.toString(),
  });
  await audit(req, 'member.status_change', { workshopId: invitation.workshopId.toString(), targetId: userId, meta: { status, via: 'invite_code' } });
  res.status(201).json({ ok: true, status, workshop: workshop?.name ?? '' });
}));

export default router;
