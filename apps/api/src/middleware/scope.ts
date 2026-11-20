import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Membership } from '../db/models/Membership';
import { Workshop } from '../db/models/Workshop';
import { ApiError } from './errors';
import { Role, WorkshopRole, MembershipStatus } from '@ats/shared';

export interface WorkshopScope {
  workshopId: Types.ObjectId;
  workshop: { _id: unknown; name: string; status: 'active' | 'suspended'; timezone: string };
  role: WorkshopRole | null;
  isSuperAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      workshopScope?: WorkshopScope;
    }
  }
}

/**
 * Server-side workshop isolation: every workshop-scoped request resolves the
 * caller's membership HERE — never in the client. Super admins bypass
 * membership checks but still go through workshop existence checks.
 */
export function requireWorkshopScope(paramName = 'workshopId') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = req.params[paramName];
      if (!raw || !Types.ObjectId.isValid(raw)) throw new ApiError(404, 'errors.notFound');
      const workshopId = new Types.ObjectId(raw);
      const workshop = await Workshop.findById(workshopId).select('name status timezone').lean();
      if (!workshop) throw new ApiError(404, 'errors.notFound');

      const isSuperAdmin = req.auth?.role === 'super_admin';
      let role: WorkshopRole | null = null;

      if (isSuperAdmin) {
        role = null;
      } else {
        const membership = await Membership
          .findOne({ workshopId, userId: req.auth!.userId, status: 'active' })
          .lean();
        if (!membership) throw new ApiError(403, 'errors.notMember');
        role = membership.role;
        if (workshop.status === 'suspended') throw new ApiError(403, 'errors.workshopSuspended');
      }
      req.workshopScope = { workshopId, workshop: workshop as unknown as WorkshopScope['workshop'], role, isSuperAdmin };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Supervisor-only guard *within* an already resolved workshop scope. */
export function requireSupervisorInScope(req: Request, _res: Response, next: NextFunction): void {
  const scope = req.workshopScope;
  if (!scope) throw new ApiError(500, 'errors.serverError');
  if (!scope.isSuperAdmin && scope.role !== 'supervisor') {
    next(new ApiError(403, 'errors.forbidden'));
    return;
  }
  next();
}

export async function myWorkshopIds(userId: string, roles?: WorkshopRole[]): Promise<Types.ObjectId[]> {
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId), status: 'active' as MembershipStatus };
  if (roles?.length) filter.role = { $in: roles };
  const rows = (await Membership.find(filter).select('workshopId').lean()) as unknown as { workshopId: Types.ObjectId }[];
  return rows.map((r) => r.workshopId);
}

export async function membershipsOf(userId: string): Promise<Record<string, unknown>[]> {
  return Membership.find({ userId, status: { $in: ['active', 'pending'] } })
    .populate('workshopId', 'name status')
    .lean() as Promise<Record<string, unknown>[]>;
}

export function isSuperAdminRole(role: Role | undefined): boolean {
  return role === 'super_admin';
}
