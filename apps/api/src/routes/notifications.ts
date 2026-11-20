import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { AppNotificationDoc } from '../db/models/Notification';
import { notificationQuerySchema } from '@ats/shared';
import { asyncHandler, ApiError } from '../middleware/errors';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);


/** GET /api/notifications — paginated, newest first. */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const q = notificationQuerySchema.parse(req.query);
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(req.auth!.userId) };
  if (q.unread === '1') filter.readAt = null;
  const [items, total, unread] = await Promise.all([
    AppNotificationDoc.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
    AppNotificationDoc.countDocuments(filter),
    AppNotificationDoc.countDocuments({ userId: new Types.ObjectId(req.auth!.userId), readAt: null }),
  ]);
  res.json({
    items: items.map((n) => ({
      id: n._id.toString(),
      type: n.type,
      params: n.params,
      link: n.link,
      taskId: n.taskId?.toString() ?? null,
      workshopId: n.workshopId?.toString() ?? null,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    pages: Math.ceil(total / q.pageSize),
    unread,
  });
}));

/** GET /api/notifications/unread-count */
router.get('/unread-count', asyncHandler(async (req: Request, res: Response) => {
  const unread = await AppNotificationDoc.countDocuments({ userId: new Types.ObjectId(req.auth!.userId), readAt: null });
  res.json({ unread });
}));

/** POST /api/notifications/:id/read */
router.post('/:id/read', asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(String(req.params.id))) throw new ApiError(404, 'errors.notFound');
  await AppNotificationDoc.updateOne(
    { _id: new Types.ObjectId(String(req.params.id)), userId: new Types.ObjectId(req.auth!.userId), readAt: null },
    { $set: { readAt: new Date() } },
  );
  const unread = await AppNotificationDoc.countDocuments({ userId: new Types.ObjectId(req.auth!.userId), readAt: null });
  res.json({ ok: true, unread });
}));

/** POST /api/notifications/read-all */
router.post('/read-all', asyncHandler(async (req: Request, res: Response) => {
  const result = await AppNotificationDoc.updateMany(
    { userId: new Types.ObjectId(req.auth!.userId), readAt: null },
    { $set: { readAt: new Date() } },
  );
  res.json({ ok: true, updated: result.modifiedCount });
}));

/** DELETE /api/notifications/all — clear the user's entire inbox. */
router.delete('/all', asyncHandler(async (req: Request, res: Response) => {
  const result = await AppNotificationDoc.deleteMany({ userId: new Types.ObjectId(req.auth!.userId) });
  res.json({ ok: true, deleted: result.deletedCount });
}));

export default router;
