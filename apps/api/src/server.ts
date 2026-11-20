import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, syncIndexes, disconnectDatabase } from './db/connect';
import { initSocket } from './realtime/socket';
import { startScheduler } from './jobs/scheduler';
import { ensurePlatformSettings } from './services/settings';
import { mailer } from './services/mailer';
import { bootstrapSuperAdmin } from './bootstrap/super-admin';
import type { Server } from 'node:http';

async function main(): Promise<void> {
  console.log(`[api] starting in ${env.NODE_ENV} mode…`);
  await connectDatabase();
  await syncIndexes();
  await ensurePlatformSettings();
  mailer.init();
  await bootstrapSuperAdmin();

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    console.log(`[api] listening on :${env.PORT}`);
  });
  initSocket(server);
  startScheduler();

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} received — shutting down…`);
    server.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[api] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
