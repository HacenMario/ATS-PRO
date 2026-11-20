import { Types } from 'mongoose';
import { AppNotificationDoc } from '../db/models/Notification';

export async function unreadCountFor(userId: string): Promise<number> {
  return AppNotificationDoc.countDocuments({ userId: new Types.ObjectId(userId), readAt: null });
}
