import mongoose, { Schema, model, Document, Model, Types } from 'mongoose';
import { createHash } from 'node:crypto';

export interface IRefreshToken extends Document {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByHash: string | null;
  ip: string;
  userAgent: string;
  createdAt: Date;
  updatedAt: Date;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true },
);

RefreshTokenSchema.index({ userId: 1, expiresAt: 1 });

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const RefreshToken = (mongoose.models.RefreshToken as Model<IRefreshToken>) || model<IRefreshToken>('RefreshToken', RefreshTokenSchema);
