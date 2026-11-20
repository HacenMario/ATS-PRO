import { Request, Response, NextFunction } from 'express';
import { corsOrigins, env } from '../config/env';
import { ApiError } from './errors';

/**
 * CSRF & cross-origin hardening for state-changing requests:
 *  1. If an Origin header is present it MUST be in the allowlist (CORS_ORIGINS).
 *     (Browsers always send Origin on cross-site POSTs; curl may omit it.)
 *  2. Mutating requests must carry a custom header that foreign sites cannot
 *     add without passing a CORS preflight — X-Requested-With: XMLHttpRequest.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function originGuard(req: Request, _res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin) {
    if (corsOrigins.length === 0) {
      if (env.isProd) {
        next(new ApiError(403, 'errors.forbidden'));
        return;
      }
    } else if (!corsOrigins.includes(origin)) {
      next(new ApiError(403, 'errors.forbidden'));
      return;
    }
  }
  next();
}

export function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const header = req.headers['x-requested-with'];
  if (header !== 'XMLHttpRequest') {
    next(new ApiError(403, 'errors.forbidden'));
    return;
  }
  next();
}
