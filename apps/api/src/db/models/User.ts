import mongoose, { Schema, model, Document, Model } from 'mongoose';
import type { Role, AccountStatus, Locale, ThemeMode } from '@ats/shared';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
  status: AccountStatus;
  preferredLanguage: Locale;
  theme: ThemeMode;
  fontScale: number;
  soundEnabled: boolean;
  avatar: string | null;
  gender: 'male' | 'female' | null;
  birthDate: Date | null;
  bloodType: string | null;
  recoveryHash: string | null;
  tokenVersion: number;
  failedLoginAttempts: number;
  lockUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 200 },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    role: { type: String, enum: ['worker', 'delivery_worker', 'supervisor', 'super_admin'], required: true, index: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
    preferredLanguage: { type: String, enum: ['ar', 'fr', 'en'], default: 'ar' },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    fontScale: { type: Number, default: 1, min: 1, max: 1.6 },
    soundEnabled: { type: Boolean, default: true },
    avatar: { type: String, default: null },
    gender: { type: String, enum: ['male', 'female'], default: null },
    birthDate: { type: Date, default: null },
    bloodType: { type: String, default: null, maxlength: 4 },
    recoveryHash: { type: String, default: null, select: false },
    tokenVersion: { type: Number, default: 0, select: false },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, collation: { locale: 'en', strength: 2 } },
);

// Case-insensitive unique email via collation + explicit unique index
UserSchema.index({ email: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const User = (mongoose.models.User as Model<IUser>) || model<IUser>('User', UserSchema);
