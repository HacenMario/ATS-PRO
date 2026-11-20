import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env, cookieSecure, cookieSameSite } from '../config/env';
import { COOKIES, JWT_AUD } from '../config/constants';
import { User } from '../db/models/User';
import { ApiError } from './errors';
import { Role } from '@ats/shared';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: 'active' | 'suspended';
  preferredLanguage: 'ar' | 'fr' | 'en';
  theme: 'light' | 'dark' | 'system';
  fontScale: number;
  soundEnabled: boolean;
  avatar: string | null;
  gender: 'male' | 'female' | null;
  birthDate: string | null;
  bloodType: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; role: Role };
      user?: IUserDoc;
    }
  }
}

type IUserDoc = {
  _id: { toString(): string };
  email: string;
  name: string;
  role: Role;
  status: 'active' | 'suspended';
  preferredLanguage: 'ar' | 'fr' | 'en';
  theme: 'light' | 'dark' | 'system';
  fontScale: number;
  soundEnabled: boolean;
  avatar: string | null;
  gender: 'male' | 'female' | null;
  birthDate: Date | null;
  bloodType: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  save(): Promise<IUserDoc>;
};

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[COOKIES.ACCESS] ?? null;
}

/** Require a valid, non-suspended user. Accepts cookie or Authorization bearer. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    next(new ApiError(401, 'errors.unauthenticated'));
    return;
  }
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { audience: JWT_AUD.WEB }) as {
      sub: string;
      role: Role;
      ver?: number;
    };
    req.auth = { userId: payload.sub, role: payload.role };
    User.findById(payload.sub).select('+tokenVersion')
      .then((user) => {
        if (!user || user.status !== 'active') {
          next(new ApiError(401, 'errors.accountSuspended'));
          return;
        }
        if (typeof payload.ver === 'number' && payload.ver !== (user as unknown as { tokenVersion?: number }).tokenVersion) {
          next(new ApiError(401, 'errors.unauthenticated'));
          return;
        }
        req.user = user as unknown as IUserDoc;
        next();
      })
      .catch(next);
  } catch {
    next(new ApiError(401, 'errors.unauthenticated'));
  }
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'super_admin') {
    next(new ApiError(403, 'errors.forbidden'));
    return;
  }
  next();
}

export function publicUser(user: IUserDoc): AuthUser {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    preferredLanguage: user.preferredLanguage,
    theme: user.theme,
    fontScale: user.fontScale,
    soundEnabled: user.soundEnabled,
    avatar: user.avatar ?? null,
    gender: user.gender ?? null,
    birthDate: user.birthDate ? user.birthDate.toISOString() : null,
    bloodType: user.bloodType ?? null,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

export function setAccessCookie(res: Response, token: string): void {
  res.cookie(COOKIES.ACCESS, token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    maxAge: 15 * 60 * 1000,
    path: '/',
  });
}

export function setRefreshCookie(res: Response, token: string, days: number): void {
  res.cookie(COOKIES.REFRESH, token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    maxAge: days * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(COOKIES.ACCESS, { httpOnly: true, secure: cookieSecure, sameSite: cookieSameSite, path: '/' });
  res.clearCookie(COOKIES.REFRESH, { httpOnly: true, secure: cookieSecure, sameSite: cookieSameSite, path: '/' });
}
