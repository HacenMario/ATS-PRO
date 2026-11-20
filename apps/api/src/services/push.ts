import webpush from 'web-push';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { PushSubscription } from '../db/models/PushSubscription';
import { emitToUser } from '../realtime/socket';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  lang: string;
  requireInteraction?: boolean;
}

export const pushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (pushEnabled) {
  webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:admin@example.com', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

const RETRY_DELAYS_MS = [0, 1500, 5000];

/**
 * Send a Web Push notification to every registered device of the user,
 * with bounded retries (3 attempts, fixed backoff) and automatic cleanup
 * of dead endpoints (404/410). Delivery results are returned for logging.
 */
export async function sendPushToUser(userId: string, payload: PushPayload, notificationId?: string): Promise<{ sent: number; failed: number }> {
  if (!pushEnabled) return { sent: 0, failed: 0 };
  const subs = await PushSubscription.find({ userId }).lean();
  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    let ok = false;
    let lastError: string | undefined;
    for (const delay of RETRY_DELAYS_MS) {
      if (delay > 0) await sleep(delay);
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
          { TTL: 3600 * 24, urgency: 'normal' },
        );
        ok = true;
        break;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        lastError = statusCode ? `HTTP ${statusCode}` : (err as Error).message?.slice(0, 200);
        if (statusCode === 404 || statusCode === 410) {
          // subscription dead — remove it, no retry
          await PushSubscription.deleteOne({ _id: sub._id }).catch(() => undefined);
          break;
        }
      }
    }
    if (ok) sent += 1; else failed += 1;
    if (notificationId) {
      const { AppNotificationDoc } = await import('../db/models/Notification');
      await AppNotificationDoc.updateOne(
        { _id: new Types.ObjectId(notificationId) },
        { $push: { deliveries: { channel: 'push', status: ok ? 'sent' : 'failed', attempts: RETRY_DELAYS_MS.length, lastError: ok ? undefined : lastError, sentAt: ok ? new Date() : undefined } } },
      ).catch(() => undefined);
    }
  }
  return { sent, failed };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function emitRealtimeNotification(userId: string, payload: PushPayload, unreadCount: number): void {
  emitToUser(userId, 'notification', { ...payload, unreadCount });
}
