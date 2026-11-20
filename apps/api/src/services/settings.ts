import { PlatformSettings, settingsToData, IPlatformSettings } from '../db/models/PlatformSettings';
import { PlatformSettings as PlatformSettingsData } from '@ats/shared';
import { ApiError } from '../middleware/errors';

let cache: { data: PlatformSettingsData; at: number } | null = null;
const TTL_MS = 5000;

export async function getPlatformSettings(): Promise<PlatformSettingsData> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const doc = await PlatformSettings.findById('global').lean() as unknown as IPlatformSettings | null;
  const data = settingsToData(doc);
  cache = { data, at: Date.now() };
  return data;
}

export async function ensurePlatformSettings(): Promise<PlatformSettingsData> {
  const existing = await PlatformSettings.findById('global');
  if (existing) return settingsToData(existing);
  const doc = await PlatformSettings.create({ _id: 'global' });
  return settingsToData(doc);
}

export async function updatePlatformSettings(input: Partial<PlatformSettingsData>): Promise<PlatformSettingsData> {
  const current = await getPlatformSettings();
  const merged: PlatformSettingsData = {
    registrationMode: input.registrationMode ?? current.registrationMode,
    enabledLanguages: input.enabledLanguages ?? current.enabledLanguages,
    defaultLanguage: input.defaultLanguage ?? current.defaultLanguage,
    contact: { ...current.contact, ...(input.contact ?? {}) },
  };
  const enabled = Object.values(merged.enabledLanguages).filter(Boolean).length;
  if (enabled === 0) throw new ApiError(400, 'admin.settings.atLeastOneLanguage');
  if (!merged.enabledLanguages[merged.defaultLanguage]) throw new ApiError(400, 'admin.settings.atLeastOneLanguage');

  await PlatformSettings.updateOne(
    { _id: 'global' },
    { $set: merged },
    { upsert: true },
  );
  cache = null;
  return merged;
}

export function invalidateSettingsCache(): void {
  cache = null;
}
