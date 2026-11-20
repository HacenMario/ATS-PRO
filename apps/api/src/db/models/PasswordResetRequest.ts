import mongoose, { Schema, model, Document, Types } from 'mongoose';

export interface IPasswordResetRequest extends Document {
  userId: Types.ObjectId;
  workshopId: Types.ObjectId | null;
  status: 'pending' | 'approved' | 'dismissed';
  handledById: Types.ObjectId | null;
  handledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PasswordResetRequestSchema = new Schema<IPasswordResetRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    workshopId: { type: Schema.Types.ObjectId, ref: 'Workshop', default: null },
    status: { type: String, enum: ['pending', 'approved', 'dismissed'], default: 'pending', index: true },
    handledById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    handledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

PasswordResetRequestSchema.index({ workshopId: 1, status: 1 });

export const PasswordResetRequest = (mongoose.models.PasswordResetRequest as mongoose.Model<IPasswordResetRequest>) || model<IPasswordResetRequest>('PasswordResetRequest', PasswordResetRequestSchema);
