import { ar, Dict, DictKey } from './ar';
import { fr } from './fr';
import { en } from './en';

export type Locale = 'ar' | 'fr' | 'en';

export const LOCALES: Locale[] = ['ar', 'fr', 'en'];
export const RTL_LOCALES: Locale[] = ['ar'];

export const LOCALE_LABELS: Record<Locale, string> = {
  ar: 'العربية',
  fr: 'Français',
  en: 'English',
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  ar: '/flags/dz.svg',
  fr: '/flags/fr.svg',
  en: '/flags/gb.svg',
};

export const DEFAULT_LOCALE: Locale = 'ar';

export const dictionaries: Record<Locale, Dict> = { ar, fr, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as string[]).includes(value);
}

export function normalizeLocale(value: unknown, fallback: Locale = DEFAULT_LOCALE): Locale {
  return isLocale(value) ? value : fallback;
}

export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function dirOf(locale: Locale): 'rtl' | 'ltr' {
  return isRTL(locale) ? 'rtl' : 'ltr';
}

export function getDict(locale: Locale): Dict {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

/** Translate a key in a locale, with {name} placeholder interpolation. */
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number | null | undefined>,
): string {
  const dict = getDict(locale);
  let out: string = dict[key as DictKey] ?? getDict(DEFAULT_LOCALE)[key as DictKey] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== null && v !== undefined) out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}

/** All keys of the reference dictionary (ar). */
export function referenceKeys(): string[] {
  return Object.keys(ar);
}

/** Keys missing from a dictionary compared to the reference (ar). */
export function missingKeys(locale: Locale): string[] {
  const ref = referenceKeys();
  const dict = getDict(locale);
  return ref.filter((k) => !(k in dict) || typeof dict[k as DictKey] !== 'string');
}

/** Keys present in a dictionary but absent from the reference. */
export function extraKeys(locale: Locale): string[] {
  const ref = new Set(referenceKeys());
  return Object.keys(getDict(locale)).filter((k) => !ref.has(k));
}

export type { Dict, DictKey };
export { ar, fr, en };
