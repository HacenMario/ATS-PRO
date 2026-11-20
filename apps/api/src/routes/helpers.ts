import { COOKIES } from '../config/constants';

/** The cookie name for refresh tokens (single source of truth for auth routes). */
export function refreshCookieFrom(): string {
  return COOKIES.REFRESH;
}

export function parseIntOr(value: string | undefined, fallback: number): number {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}
