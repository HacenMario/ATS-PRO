'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api, setTokens, clearTokens, restoreTokens } from '@/lib/api';
import { useLocale } from './locale';
import type { PublicUser } from '@ats/shared';

export interface MembershipInfo {
  id: string;
  workshopId: string;
  workshopName: string;
  workshopStatus: string;
  role: 'worker' | 'delivery_worker' | 'supervisor';
  status: string;
  joinedAt: string | null;
}

export interface PlatformMeta {
  app: { name: string; version: string };
  registrationMode: 'open' | 'invite' | 'closed';
  enabledLanguages: Record<'ar' | 'fr' | 'en', boolean>;
  defaultLanguage: 'ar' | 'fr' | 'en';
  contact: { email: string; phone: string; note: string };
  push: { vapidPublicKey: string | null; enabled: boolean };
  emailConfigured: boolean;
}

interface AuthCtx {
  user: PublicUser | null;
  memberships: MembershipInfo[];
  meta: PlatformMeta | null;
  loading: boolean;
  /** supervisor of at least one workshop (or platform admin) */
  isSupervisor: boolean;
  /** delivery worker of at least one workshop (or platform admin — sees everything) */
  isDeliveryWorker: boolean;
  isSuperAdmin: boolean;
  hasWorkshop: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    name: string; email: string; password: string; preferredLanguage?: string;
    inviteCode: string; recoveryPhrase: string;
    gender?: 'male' | 'female'; birthDate?: string; bloodType?: string; avatar?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  patchMe: (patch: Partial<Pick<PublicUser, 'name' | 'preferredLanguage' | 'theme' | 'fontScale' | 'soundEnabled' | 'avatar'>>) => Promise<PublicUser>;
  refreshMeta: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setLocale, locale } = useLocale();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [memberships, setMemberships] = useState<MembershipInfo[]>([]);
  const [meta, setMeta] = useState<PlatformMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const appliedLangRef = useMemo(() => ({ applied: false }), []);

  const refreshMeta = useCallback(async () => {
    try {
      const m = await api<PlatformMeta>('/api/meta', { noRetry: true });
      setMeta(m);
      // Honour the platform language configuration on first visit.
      if (!localStorage.getItem('ats.lang') && !appliedLangRef.applied) {
        appliedLangRef.applied = true;
        if (m.enabledLanguages?.[m.defaultLanguage]) setLocale(m.defaultLanguage);
        else if (m.enabledLanguages?.[locale]) setLocale(locale);
        else {
          const firstEnabled = (['ar', 'fr', 'en'] as const).find((l) => m.enabledLanguages[l]);
          if (firstEnabled) setLocale(firstEnabled);
        }
      }
    } catch { /* meta is best-effort; UI falls back to defaults */ }
  }, [setLocale, locale, appliedLangRef]);

  const refreshMe = useCallback(async () => {
    try {
      restoreTokens();
      const data = await api<{ user: PublicUser; memberships: MembershipInfo[]; unreadNotifications: number }>('/api/auth/me', { noRetry: false });
      setUser(data.user);
      setMemberships(data.memberships);
      setTokens(null, undefined); // keep whatever refresh token exists
      if (!appliedLangRef.applied) {
        appliedLangRef.applied = true;
        // The locally chosen language (localStorage/cookie) always wins over the
        // server preference — the server value only fills the first visit.
        const stored = localStorage.getItem('ats.lang') || document.cookie.match(/(?:^|; )ats_lang=([^;]*)/)?.[1];
        if (!stored && data.user.preferredLanguage) setLocale(data.user.preferredLanguage);
      }
    } catch {
      setUser(null);
      setMemberships([]);
      clearTokens();
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setLocale]);

  useEffect(() => {
    void refreshMeta();
    void refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ user: PublicUser; memberships: MembershipInfo[]; accessToken: string; refreshToken: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    const me = await api<{ memberships: MembershipInfo[]; user: PublicUser }>('/api/auth/me');
    setMemberships(me.memberships);
    setUser(me.user);
    appliedLangRef.applied = true;
    setLocale(data.user.preferredLanguage);
  }, [setLocale, appliedLangRef]);

  const register = useCallback(async (data: {
    name: string; email: string; password: string; preferredLanguage?: string;
    inviteCode: string; recoveryPhrase: string;
    gender?: 'male' | 'female'; birthDate?: string; bloodType?: string; avatar?: string;
  }) => {
    const res = await api<{ user: PublicUser; accessToken: string; refreshToken: string }>('/api/auth/register', {
      method: 'POST',
      body: { ...data, preferredLanguage: data.preferredLanguage ?? locale },
    });
    setTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
    await refreshMe();
  }, [locale, refreshMe]);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', body: {}, noRetry: true });
    } catch { /* already out */ }
    clearTokens();
    setUser(null);
    setMemberships([]);
  }, []);

  const patchMe = useCallback(async (patch: Partial<Pick<PublicUser, 'name' | 'preferredLanguage' | 'theme' | 'fontScale' | 'soundEnabled' | 'avatar'>>) => {
    const data = await api<{ user: PublicUser }>('/api/auth/me', { method: 'PATCH', body: patch });
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    user,
    memberships,
    meta,
    loading,
    isSupervisor: Boolean(user && (user.role === 'super_admin' || memberships.some((m) => m.role === 'supervisor' && m.status === 'active'))),
    isDeliveryWorker: Boolean(user && (user.role === 'delivery_worker' || memberships.some((m) => m.role === 'delivery_worker' && m.status === 'active'))),
    isSuperAdmin: user?.role === 'super_admin',
    hasWorkshop: memberships.some((m) => m.status === 'active'),
    login,
    register,
    logout,
    refreshMe,
    patchMe,
    refreshMeta,
  }), [user, memberships, meta, loading, login, register, logout, refreshMe, patchMe, refreshMeta]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
