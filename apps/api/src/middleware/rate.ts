import rateLimit from 'express-rate-limit';

const standardOptions = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  /**
   * In-memory store: correct for a single Railway instance.
   * For horizontal scaling, plug a Redis store here (documented in docs/SECURITY.md).
   */
};

// Integration tests run against one shared process; relax limits there only.
const testMultiplier = process.env.NODE_ENV === 'test' ? 100000 : 1;

export const globalLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  limit: 600 * testMultiplier,
  message: { error: { code: 'errors.rateLimited' } },
});

export const loginLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10 * testMultiplier,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}:${String((req.body?.email ?? '')).toLowerCase()}`,
  message: { error: { code: 'errors.tooManyAttempts' } },
});

export const registerLimiter = rateLimit({
  ...standardOptions,
  windowMs: 60 * 60 * 1000,
  limit: 20 * testMultiplier,
  message: { error: { code: 'errors.tooManyAttempts' } },
});

export const forgotLimiter = rateLimit({
  ...standardOptions,
  windowMs: 60 * 60 * 1000,
  limit: 6 * testMultiplier,
  message: { error: { code: 'errors.tooManyAttempts' } },
});

export const uploadLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  limit: 40 * testMultiplier,
  message: { error: { code: 'errors.rateLimited' } },
});
