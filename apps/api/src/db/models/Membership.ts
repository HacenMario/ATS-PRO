import mongoose, { Schema, model, Document, Model } from 'mongoose';
import type { MembershipStatus, WorkshopRole } from '@ats/shared';

export interface IMembership extends Document {
  workshopId: Schema.Types.ObjectId;
  userId: Schema.Types.ObjectId;
  role: WorkshopRole;
  status: MembershipStatus;
  invitedById: Schema.Types.ObjectId | null;
  joinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<IMembership>(
  {
    workshopId: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['worker', 'delivery_worker', 'supervisor'], required: true },
    status: { type: String, enum: ['active', 'pending', 'suspended', 'removed'], default: 'active', index: true },
    invitedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    joinedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

MembershipSchema.index({ workshopId: 1, userId: 1 }, { unique: true });
MembershipSchema.index({ userId: 1, status: 1 });
MembershipSchema.index({ workshopId: 1, role: 1, status: 1 });

export const Membership = (mongoose.models.Membership as Model<IMembership>) || model<IMembership>('Membership', MembershipSchema);
