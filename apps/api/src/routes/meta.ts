import { Router, Request, Response } from 'express';
import { getPlatformSettings } from '../services/settings';
import { env } from '../config/env';
import { pushEnabled } from '../services/push';

const router = Router();

/**
 * GET /api/meta — public bootstrap data for the web app.
 * Contains NO secrets: public configuration only.
 */
router.get('/', async (_req: Request, res: Response) => {
  const settings = await getPlatformSettings();
  res.json({
    app: { name: 'Advanced Tasks Supervisor', version: '1.0.0' },
    registrationMode: settings.registrationMode,
    enabledLanguages: settings.enabledLanguages,
    defaultLanguage: settings.defaultLanguage,
    contact: settings.contact,
    push: { vapidPublicKey: env.VAPID_PUBLIC_KEY || null, enabled: pushEnabled },
    emailConfigured: Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),
  });
});

export default router;
