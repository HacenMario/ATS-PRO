'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { makeT, type TFunc } from '@/lib/format';
import type { Locale } from '@ats/i18n';
import { dirOf } from '@ats/i18n';

interface LocaleCtx {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  t: TFunc;
  setLocale: (l: Locale) => void;
  enabledLanguages: Record<Locale, boolean> | null;
  setEnabledLanguages: (v: Record<Locale, boolean>) => void;
}

const Ctx = createContext<LocaleCtx | null>(null);

const LS_KEY = 'ats.lang';
const COOKIE = 'ats_lang';

function readInitial(): Locale | null {
  try {
    const saved = localStorage.getItem(LS_KEY) ?? document.cookie.match(/(?:^|; )ats_lang=([^;]*)/)?.[1];
    if (saved === 'ar' || saved === 'fr' || saved === 'en') return saved;
  } catch { /* ignore */ }
  return null;
}

function applyDom(locale: Locale, scale?: number) {
  const el = document.documentElement;
  el.lang = locale;
  el.dir = dirOf(locale);
  if (scale !== undefined) {
    el.style.setProperty('--font-scale', String(scale));
  }
}

export function LocaleProvider({ children, defaultLocale = 'ar' }: { children: ReactNode; defaultLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [enabledLanguages, setEnabledLanguages] = useState<Record<Locale, boolean> | null>(null);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(LS_KEY, l); } catch { /* ignore */ }
    document.cookie = `${COOKIE}=${l};path=/;max-age=${360 * 24 * 3600};samesite=lax`;
  }, []);

  // Adopt any persisted choice that differs from the cookie-derived default
  // AFTER hydration (keeps the client tree identical to the SSR tree, so no
  // hydration mismatch is ever reported). The early inline script already
  // fixed <html> lang/dir before paint, so there is no visual flash.
  useEffect(() => {
    const initial = readInitial();
    if (initial && initial !== defaultLocale) setLocaleState(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<LocaleCtx>(() => {
    return {
      locale,
      dir: dirOf(locale),
      t: makeT(locale),
      setLocale,
      enabledLanguages,
      setEnabledLanguages,
    };
  }, [locale, enabledLanguages, setLocale]);

  // Apply dir/lang to <html> on mount and on change.
  useEffect(() => {
    applyDom(locale);
  }, [locale]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLocale outside LocaleProvider');
  return ctx;
}
