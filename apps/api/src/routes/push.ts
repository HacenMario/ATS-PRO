import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PushSubscription } from '../db/models/PushSubscription';
import { asyncHandler } from '../middleware/errors';
import { requireAuth } from '../middleware/auth';
import { env } from '../config/env';
import { audit } from '../services/audit';

const router = Router();
router.use(requireAuth);

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1024),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
}).strict();

/** GET /api/push/public-key — VAPID public key (public by design). */
router.get('/public-key', (_req: Request, res: Response) => {
  res.json({ publicKey: env.VAPID_PUBLIC_KEY || null, supported: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) });
});

/** POST /api/push/subscribe — registers this device. */
router.post('/subscribe', asyncHandler(async (req: Request, res: Response) => {
  const data = subscriptionSchema.parse(req.body);
  await PushSubscription.updateOne(
    { endpoint: data.endpoint },
    {
      $set: {
        userId: req.auth!.userId,
        endpoint: data.endpoint,
        keys: data.keys,
        userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
      },
    },
    { upsert: true },
  );
  await audit(req, 'push.subscribe', { actorId: req.auth!.userId });
  res.status(201).json({ ok: true });
}));

/** POST /api/push/unsubscribe — removes this device (or all). */
router.post('/unsubscribe', asyncHandler(async (req: Request, res: Response) => {
  const endpoint = (req.body?.endpoint as string | undefined);
  if (endpoint) {
    await PushSubscription.deleteOne({ endpoint, userId: req.auth!.userId });
  } else {
    await PushSubscription.deleteMany({ userId: req.auth!.userId });
  }
  await audit(req, 'push.unsubscribe', { actorId: req.auth!.userId });
  res.json({ ok: true });
}));

/** GET /api/push/subscriptions — devices registered for my account. */
router.get('/subscriptions', asyncHandler(async (req: Request, res: Response) => {
  const subs = await PushSubscription.find({ userId: req.auth!.userId }).select('endpoint userAgent createdAt').lean();
  res.json({
    items: subs.map((s) => ({
      id: s._id.toString(),
      endpoint: s.endpoint.slice(0, 60) + '…',
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}));

export default router;
