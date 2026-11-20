import { AuditLog } from '../db/models/AuditLog';
import { Request } from 'express';

/** Write-only audit trail for sensitive actions. Never throws to the caller. */
export async function audit(
  req: Request | null,
  action: string,
  data: {
    actorId?: string | null;
    actorEmail?: string;
    workshopId?: string | null;
    targetType?: string;
    targetId?: string | null;
    meta?: Record<string, string | number | boolean | null>;
  } = {},
): Promise<void> {
  try {
    await AuditLog.create({
      actorId: data.actorId ?? req?.auth?.userId ?? null,
      actorEmail: data.actorEmail ?? req?.user?.email ?? '',
      action,
      workshopId: data.workshopId ?? null,
      targetType: data.targetType ?? '',
      targetId: data.targetId ?? null,
      meta: data.meta ?? {},
      ip: req?.ip ?? '',
    });
  } catch (err) {
    console.error('[audit] failed to write entry:', (err as Error).message);
  }
}
