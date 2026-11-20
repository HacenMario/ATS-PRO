import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { corsOrigins } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { originGuard, csrfGuard } from './middleware/security';
import { globalLimiter } from './middleware/rate';
import authRoutes from './routes/auth';
import workshopRoutes from './routes/workshops';
import taskRoutes from './routes/tasks';
import notificationRoutes from './routes/notifications';
import pushRoutes from './routes/push';
import adminRoutes from './routes/admin';
import metaRoutes from './routes/meta';
import invitationRoutes from './routes/invitations';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ contentSecurityPolicy: false })); // API only — CSP handled by the web app

  app.use(
    cors({
      origin: (origin, cb) => {
        // No origin (curl, mobile app, same-origin proxy): allowed.
        // With an allowlist configured, foreign origins are refused.
        if (!origin) return cb(null, true);
        if (corsOrigins.length === 0 || corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('CORS: origin not allowed'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      maxAge: 86400,
    }),
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(globalLimiter);
  app.use(originGuard);
  app.use(csrfGuard);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: Math.round(process.uptime()), ts: new Date().toISOString() });
  });

  app.use('/api/meta', metaRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/workshops', workshopRoutes);
  app.use('/api/invitations', invitationRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/push', pushRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
