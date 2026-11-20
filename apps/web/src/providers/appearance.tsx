'use client';

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { ThemeMode } from '@ats/shared';

type Resolved = 'light' | 'dark';

interface AppearanceCtx {
  theme: ThemeMode;
  resolved: Resolved;
  setTheme: (t: ThemeMode) => void;
  fontScale: number;
  setFontScale: (v: number) => void;
}

const Ctx = createContext<AppearanceCtx | null>(null);
const THEME_KEY = 'ats.theme';
const SCALE_KEY = 'ats.fontScale';

export const FONT_SCALES = [0.85, 1, 1.15, 1.3, 1.45];

function readTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* ignore */ }
  return 'system';
}

function readScale(): number {
  try {
    const v = parseFloat(localStorage.getItem(SCALE_KEY) ?? '1');
    if (v >= 0.85 && v <= 1.6) return FONT_SCALES.includes(v) ? v : 1;
  } catch { /* ignore */ }
  return 1;
}

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [fontScale, setFontScaleState] = useState(1);
  const [systemPref, setSystemPref] = useState<Resolved>('light');

  useEffect(() => {
    const t = readTheme();
    const s = readScale();
    setThemeState(t);
    setFontScaleState(s);
    setSystemPref(systemDark() ? 'dark' : 'light');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemPref(e.matches ? 'dark' : 'light');
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const resolved: Resolved = theme === 'system' ? systemPref : theme;

  // Apply to <html> whenever anything changes.
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('dark', resolved === 'dark');
    el.style.colorScheme = resolved;
  }, [resolved]);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(fontScale));
  }, [fontScale]);

  const value = useMemo<AppearanceCtx>(() => ({
    theme,
    resolved,
    setTheme: (t: ThemeMode) => {
      setThemeState(t);
      try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
      document.cookie = `ats_theme=${t};path=/;max-age=${360 * 24 * 3600};samesite=lax`;
    },
    fontScale,
    setFontScale: (v: number) => {
      setFontScaleState(v);
      try { localStorage.setItem(SCALE_KEY, String(v)); } catch { /* ignore */ }
    },
  }), [theme, resolved, fontScale]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppearance(): AppearanceCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppearance outside AppearanceProvider');
  return ctx;
}
