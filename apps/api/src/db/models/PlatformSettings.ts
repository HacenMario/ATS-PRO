import mongoose, { Schema, model, Document, Model } from 'mongoose';
import type { PlatformSettings as PlatformSettingsData } from '@ats/shared';

export interface IPlatformSettings extends Document {
  registrationMode: 'open' | 'invite' | 'closed';
  enabledLanguages: Record<'ar' | 'fr' | 'en', boolean>;
  defaultLanguage: 'ar' | 'fr' | 'en';
  contact: { email: string; phone: string; note: string };
  createdAt: Date;
  updatedAt: Date;
}

const PlatformSettingsSchema = new Schema(
  {
    _id: { type: String, default: 'global' },
    registrationMode: { type: String, enum: ['open', 'invite', 'closed'], default: 'invite' },
    enabledLanguages: {
      ar: { type: Boolean, default: true },
      fr: { type: Boolean, default: true },
      en: { type: Boolean, default: true },
    },
    defaultLanguage: { type: String, enum: ['ar', 'fr', 'en'], default: 'ar' },
    contact: {
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      note: { type: String, default: '', maxlength: 500 },
    },
  },
  { timestamps: true },
);

export const PlatformSettings = (mongoose.models.PlatformSettings as unknown as Model<IPlatformSettings>) || model<IPlatformSettings>('PlatformSettings', PlatformSettingsSchema);

export function settingsToData(doc: unknown): PlatformSettingsData {
  if (!doc) {
    return {
      registrationMode: 'invite',
      enabledLanguages: { ar: true, fr: true, en: true },
      defaultLanguage: 'ar',
      contact: { email: '', phone: '', note: '' },
    };
  }
  const d = doc as IPlatformSettings;
  return {
    registrationMode: d.registrationMode,
    enabledLanguages: { ...d.enabledLanguages },
    defaultLanguage: d.defaultLanguage,
    contact: { ...d.contact },
  };
}
