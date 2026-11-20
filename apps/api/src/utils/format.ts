/** Date/Time formatting helpers for notification params (server-side). */
import { translate, normalizeLocale, Locale } from '@ats/i18n';

export function formatDateTimeParam(date: Date | null | undefined, rawLocale?: string): string {
  if (!date) return '—';
  const locale = normalizeLocale(rawLocale);
  const d = new Date(date);
  const intlLocale = locale === 'ar' ? 'ar-DZ' : locale === 'fr' ? 'fr-FR' : 'en-GB';
  return new Intl.DateTimeFormat(intlLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    numberingSystem: 'latn',
  }).format(d);
}

export function relativeMinutes(minutes: number, locale: Locale): string {
  return translate(locale, 'common.durationMinutes', { n: minutes });
}
