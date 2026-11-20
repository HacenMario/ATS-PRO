import mongoose, { Schema, model, Document, Model, Types } from 'mongoose';

export interface IAuditLog extends Document {
  actorId: Types.ObjectId | null;
  actorEmail: string;
  action: string;
  workshopId: Types.ObjectId | null;
  targetType: string;
  targetId: string | null;
  meta: Record<string, string | number | boolean | null>;
  ip: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorEmail: { type: String, default: '' },
    action: { type: String, required: true, index: true },
    workshopId: { type: Schema.Types.ObjectId, ref: 'Workshop', default: null },
    targetType: { type: String, default: '' },
    targetId: { type: String, default: null },
    meta: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '', maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ workshopId: 1, createdAt: -1 });

export const AuditLog = (mongoose.models.AuditLog as Model<IAuditLog>) || model<IAuditLog>('AuditLog', AuditLogSchema);
