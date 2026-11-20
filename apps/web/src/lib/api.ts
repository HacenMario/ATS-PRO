'use client';

/**
 * Typed API client for the Railway-hosted API.
 *
 * Transport strategy (see docs/SECURITY.md):
 *  - Cookies (httpOnly, SameSite=None) are always sent with credentials: 'include'.
 *  - A Bearer access token is ALSO kept in memory (and a refresh fallback in
 *    localStorage) so the app keeps working when third-party cookies are
 *    blocked (e.g. Safari with vercel.app + railway.app dev domains).
 *  - On 401 the client retries once via /auth/refresh, then gives up.
 */
import type { ApiErrorBody } from '@ats/shared';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

let accessToken: string | null = null;
let refreshToken: string | null = null;

const RT_KEY = 'ats.rt';
const XRW = 'XMLHttpRequest';

export function setTokens(access?: string | null, refresh?: string | null): void {
  if (access !== undefined) accessToken = access;
  if (refresh !== undefined) {
    refreshToken = refresh;
    try {
      if (refresh) localStorage.setItem(RT_KEY, refresh);
      else localStorage.removeItem(RT_KEY);
    } catch { /* private mode */ }
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Restore a persisted refresh token (cookie may be blocked cross-site). */
export function restoreTokens(): void {
  try {
    refreshToken = localStorage.getItem(RT_KEY);
  } catch { /* ignore */ }
}

export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  try { localStorage.removeItem(RT_KEY); } catch { /* ignore */ }
}

export class ApiRequestError extends Error {
  constructor(public code: string, public status: number, public fields?: Record<string, string>) {
    super(code);
    this.name = 'ApiRequestError';
  }
}

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': XRW },
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function ensureFresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => { refreshing = null; });
  }
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  /** skip the automatic single 401-retry */
  noRetry?: boolean;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData, signal, noRetry } = options;
  const headers: Record<string, string> = { 'X-Requested-With': XRW };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (!formData && body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      headers,
      signal,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ApiRequestError('errors.networkError', 0);
  }

  if (res.status === 401 && !noRetry) {
    const ok = await ensureFresh();
    if (ok) return api<T>(path, { ...options, noRetry: true });
    clearTokens();
    throw new ApiRequestError('errors.unauthenticated', 401);
  }

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  try { data = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    const errBody = (data as ApiErrorBody | null)?.error;
    throw new ApiRequestError(errBody?.code ?? 'errors.serverError', res.status, errBody?.fields);
  }
  return data as T;
}

/** Absolute URL for API-hosted files (downloads stream from Railway, not Vercel). */
export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}
