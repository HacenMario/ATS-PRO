import mongoose, { Schema, model, Document, Model } from 'mongoose';

export interface IInvitation extends Document {
  workshopId: Schema.Types.ObjectId;
  code: string;
  role: 'worker';
  autoJoin: boolean;
  maxUses: number;
  uses: number;
  createdById: Schema.Types.ObjectId;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    workshopId: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true, index: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    role: { type: String, enum: ['worker'], default: 'worker' },
    autoJoin: { type: Boolean, default: true },
    maxUses: { type: Number, default: 50, min: 1, max: 500 },
    uses: { type: Number, default: 0 },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Invitation = (mongoose.models.Invitation as Model<IInvitation>) || model<IInvitation>('Invitation', InvitationSchema);
