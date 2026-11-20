import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

/** Application error with a stable i18n error code. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public fields?: Record<string, string>,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'errors.notFound' } });
}

const STATUS_TO_CODE: Record<number, string> = {
  401: 'errors.unauthenticated',
  403: 'errors.forbidden',
  404: 'errors.notFound',
  409: 'errors.serverError',
  429: 'errors.rateLimited',
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError || (err as { name?: string })?.name === 'ZodError') {
    const issues = ((err as ZodError).issues ?? []) as { path: (string | number)[]; message: string }[];
    const fields: Record<string, string> = {};
    for (const issue of issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    const first = issues[0]?.message ?? 'errors.required';
    res.status(400).json({ error: { code: first, fields } });
    return;
  }
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, fields: err.fields } });
    return;
  }
  // Log server-side without leaking secrets; client gets a generic message.
  console.error('[api] unhandled error:', err instanceof Error ? `${err.name}: ${err.message}` : err);
  const status = (err as { status?: number })?.status;
  if (typeof status === 'number' && STATUS_TO_CODE[status]) {
    res.status(status).json({ error: { code: STATUS_TO_CODE[status] } });
    return;
  }
  res.status(500).json({ error: { code: 'errors.serverError' } });
}
