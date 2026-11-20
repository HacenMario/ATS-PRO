/**
 * Central environment configuration.
 * - Fails fast with a CLEAR, secret-free message when mandatory vars are absent.
 * - Never logs values, only variable names.
 */
import { z } from 'zod';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET (min 32 chars)'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET (min 32 chars)'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  CORS_ORIGINS: z.string().default(''),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  COOKIE_CROSS_SITE: z.enum(['true', 'false']).default('false'),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default(''),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(20).default(4),
  MAX_FILES_PER_TASK: z.coerce.number().int().min(1).max(20).default(6),
  // test-only: skip automatic super-admin bootstrap during integration tests
  ATS_SKIP_BOOTSTRAP: z.enum(['true', 'false']).default('false'),
});

export type Env = z.infer<typeof envSchema> & { isProd: boolean };

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || String(i.message)))];
    throw new ConfigError(
      `Missing or invalid environment variables: ${names.join(', ')}. ` +
      'See apps/api/.env.example for the full list. The server did NOT start.',
    );
  }
  const e = parsed.data;
  if (e.NODE_ENV === 'production') {
    if (/CHANGE_ME|your-domain\.example/.test(e.JWT_ACCESS_SECRET + e.JWT_REFRESH_SECRET)) {
      throw new ConfigError('JWT secrets still contain template values. Generate random secrets before production.');
    }
    if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY) {
      console.warn('[config] VAPID keys missing — Web Push notifications are disabled (in-app notifications still work).');
    }
  }
  return { ...e, isProd: e.NODE_ENV === 'production' };
}

export const env: Env = loadEnv();

export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
export const cookieSameSite = env.COOKIE_CROSS_SITE === 'true' ? ('none' as const) : ('lax' as const);
export const cookieSecure = env.COOKIE_SECURE === 'true' || env.isProd;
export const maxUploadBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
