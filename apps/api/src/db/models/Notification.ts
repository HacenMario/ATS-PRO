import mongoose, { Schema, model, Document, Model, Types } from 'mongoose';
import type { NotificationType, Locale } from '@ats/shared';

export interface DeliveryRecord {
  channel: 'in_app' | 'push';
  status: 'sent' | 'failed';
  attempts: number;
  lastError?: string;
  sentAt?: Date;
}

export interface IAppNotification extends Document {
  userId: Types.ObjectId;
  workshopId: Types.ObjectId | null;
  taskId: Types.ObjectId | null;
  type: NotificationType;
  /** i18n parameter bag — rendered client-side in the user's current language */
  params: Record<string, string>;
  link: string | null;
  dedupKey: string | null;
  readAt: Date | null;
  deliveries: DeliveryRecord[];
  createdAt: Date;
  updatedAt: Date;
}

const DeliverySchema = new Schema(
  {
    channel: { type: String, enum: ['in_app', 'push'], required: true },
    status: { type: String, enum: ['sent', 'failed'], required: true },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    sentAt: { type: Date },
  },
  { _id: false },
);
void DeliverySchema;

const NotificationSchema = new Schema<IAppNotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    workshopId: { type: Schema.Types.ObjectId, ref: 'Workshop', default: null },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    type: { type: String, required: true, index: true },
    params: { type: Schema.Types.Mixed, default: {} },
    link: { type: String, default: null },
    dedupKey: { type: String, default: null },
    readAt: { type: Date, default: null },
    deliveries: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true },
);

NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
// Unique dedup ONLY among real dedup keys. `sparse: true` was not enough:
// a field explicitly set to null IS indexed (null ≠ missing), so two
// notifications without a dedupKey for the same user collided with E11000
// and crashed unrelated flows. partialFilterExpression properly excludes them.
NotificationSchema.index(
  { userId: 1, dedupKey: 1 },
  { unique: true, partialFilterExpression: { dedupKey: { $type: 'string' } } },
);
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 120 }); // 120 days retention

export const AppNotificationDoc = (mongoose.models.Notification as Model<IAppNotification>) || model<IAppNotification>('Notification', NotificationSchema);
export type NotificationLocale = Locale;
