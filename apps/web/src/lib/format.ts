'use client';

import { translate, normalizeLocale, Locale } from '@ats/i18n';
import type { DictKey } from '@ats/i18n';

/** Client-side translator bound to a locale (params: {name} interpolation). */
export function makeT(locale: Locale) {
  return (key: string, params?: Record<string, string | number | null | undefined>): string =>
    translate(normalizeLocale(locale), key, params);
}

export type TFunc = ReturnType<typeof makeT>;
export type { DictKey };

const LOCALE_TAGS: Record<Locale, string> = { ar: 'ar-DZ', fr: 'fr-FR', en: 'en-GB' };

export function intlLocale(locale: Locale): string {
  return LOCALE_TAGS[locale];
}

/** Locale-aware number formatting with latin digits (amounts, counts). */
export function formatNumber(value: number, _locale?: Locale): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(value);
}

/** Strict, locale-independent timestamp: YYYY/MM/DD HH:mm:ss (24h, latin digits). */
export function formatDateTime(value: string | Date | null | undefined, _locale?: Locale): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

export function formatDate(value: string | Date | null | undefined, locale: Locale): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', numberingSystem: 'latn' }).format(d);
}

export function formatTime(value: string | Date | null | undefined, locale: Locale): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(intlLocale(locale), { timeStyle: 'short', numberingSystem: 'latn' }).format(d);
}

/** 90 min → «1 س و 30 د» style, locale-aware unit labels come from the dictionary. */
export function formatDuration(ms: number | null | undefined, t: TFunc): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return t('common.durationMinutes', { n: 1 });
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(t('common.durationDays', { n: days }));
  if (hours) parts.push(t('common.durationHours', { n: hours }));
  if (minutes && parts.length < 2) parts.push(t('common.durationMinutes', { n: minutes }));
  return parts.join(' + ') || t('common.durationMinutes', { n: 0 });
}

/** value for <input type="datetime-local"> in the user's LOCAL timezone. */
export function toLocalInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Human relative time for notifications: «قبل 5 دقائق». */
export function formatRelative(value: string | Date, locale: Locale): string {
  const d = new Date(value);
  const diff = Date.now() - d.getTime();
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(-days, 'day');
  return formatDate(d, locale);
}
