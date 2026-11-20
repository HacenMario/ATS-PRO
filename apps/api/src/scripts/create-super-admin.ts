/** Standalone script: create (or promote) the Super Admin. Same rules as boot bootstrap. */
import 'dotenv/config';
import { bootstrapSuperAdmin } from '../bootstrap/super-admin';
import { connectDatabase, disconnectDatabase } from '../db/connect';
import { env } from '../config/env';

async function main(): Promise<void> {
  await connectDatabase();
  await bootstrapSuperAdmin();
  await disconnectDatabase();
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed:', err instanceof Error ? err.message : err);
  void env; // keep env import for validation side-effects
  process.exit(1);
});
