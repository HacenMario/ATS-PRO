import { Types } from 'mongoose';
import { AppNotificationDoc, IAppNotification, DeliveryRecord } from '../db/models/Notification';
import { User } from '../db/models/User';
import { translate, normalizeLocale, Locale } from '@ats/i18n';
import { sendPushToUser, emitRealtimeNotification, pushEnabled } from './push';
import { NotificationType } from '@ats/shared';
import { unreadCountFor } from '../utils/notifications-util';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  params?: Record<string, string>;
  link?: string | null;
  taskId?: string | null;
  workshopId?: string | null;
  /** Unique per user — prevents duplicate notifications (e.g. due-soon/overdue loops). */
  dedupKey?: string | null;
  push?: boolean;
}

function renderFor(locale: Locale, type: NotificationType, params: Record<string, string>): { title: string; body: string } {
  return {
    title: translate(locale, `notif.title.${type}`, params),
    body: translate(locale, `notif.body.${type}`, params),
  };
}

export async function unreadCount(userId: string): Promise<number> {
  return unreadCountFor(userId);
}

/**
 * Persist an in-app notification, push it over realtime, and (optionally)
 * deliver a Web Push to the user's devices in the user's language.
 * Deduplicated by dedupKey when provided.
 */
export async function notifyUser(input: CreateNotificationInput): Promise<IAppNotification | null> {
  const { userId, type } = input;
  if (input.dedupKey) {
    const exists = await AppNotificationDoc.exists({ userId: new Types.ObjectId(userId), dedupKey: input.dedupKey });
    if (exists) return null;
  }
  const user = await User.findById(userId).select('preferredLanguage soundEnabled status').lean();
  if (!user || user.status !== 'active') return null;

  const params = input.params ?? {};
  const locale = normalizeLocale(user.preferredLanguage);

  const doc = await AppNotificationDoc.create({
    userId: new Types.ObjectId(userId),
    workshopId: input.workshopId ? new Types.ObjectId(input.workshopId) : null,
    taskId: input.taskId ? new Types.ObjectId(input.taskId) : null,
    type,
    params,
    link: input.link ?? null,
    dedupKey: input.dedupKey ?? null,
    readAt: null,
    deliveries: [{ channel: 'in_app', status: 'sent', sentAt: new Date() } as DeliveryRecord],
  });

  // Realtime (Socket.IO) — always, independent of push support.
  const rendered = renderFor(locale, type, params);
  const unread = await unreadCount(userId);
  const pushPayload = { ...rendered, url: input.link ?? '/', tag: input.dedupKey ?? undefined, lang: locale };
  emitRealtimeNotification(userId, pushPayload, unread);

  // Web Push — async, with retries recorded on the notification document.
  if (input.push !== false && pushEnabled) {
    void sendPushToUser(userId, pushPayload, doc._id.toString()).catch((err) => {
      console.error('[notify] push dispatch failed:', (err as Error).message);
    });
  }
  return doc;
}

/** Notify all active supervisors of a workshop. */
export async function notifyWorkshopSupervisors(workshopId: string, input: Omit<CreateNotificationInput, 'userId'>): Promise<void> {
  return notifyWorkshopRole(workshopId, 'supervisor', input);
}

/** Notify all active members of a workshop holding a given role. */
export async function notifyWorkshopRole(workshopId: string, role: 'supervisor' | 'worker' | 'delivery_worker', input: Omit<CreateNotificationInput, 'userId'>): Promise<void> {
  const { Membership } = await import('../db/models/Membership');
  const members = await Membership
    .find({ workshopId: new Types.ObjectId(workshopId), role, status: 'active' })
    .select('userId')
    .lean();
  await Promise.all(members.map((m) => notifyUser({ ...input, userId: m.userId.toString() })));
}
