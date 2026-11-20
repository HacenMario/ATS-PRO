import { connect, connection, disconnect, Model, models } from 'mongoose';
import { env } from '../config/env';
import { User } from './models/User';
import { Workshop } from './models/Workshop';
import { Membership } from './models/Membership';
import { Invitation } from './models/Invitation';
import { Task } from './models/Task';
import { AppNotificationDoc } from './models/Notification';
import { PushSubscription } from './models/PushSubscription';
import { RefreshToken } from './models/RefreshToken';
import { AuditLog } from './models/AuditLog';
import { PlatformSettings } from './models/PlatformSettings';

/** Idempotent connection with graceful error messages (no secrets in output). */
export async function connectDatabase(uri?: string): Promise<void> {
  const target = uri ?? env.MONGODB_URI;
  if (connection.readyState === 1) return;
  try {
    await connect(target, {
      serverSelectionTimeoutMS: 10000,
      appName: 'ats-api',
    });
  } catch (err) {
    throw new Error(
      `Could not connect to MongoDB. Check MONGODB_URI and network access. (reason: ${(err as Error).message})`,
    );
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (connection.readyState !== 0) await disconnect();
}

/** Ensure indexes exist (useful on Atlas fresh deployments). */
export async function syncIndexes(): Promise<void> {
  const registry: Model<unknown>[] = [
    User, Workshop, Membership, Invitation, Task,
    AppNotificationDoc, PushSubscription, RefreshToken, AuditLog, PlatformSettings,
  ].map((m) => (models[(m.modelName as never)] ?? m) as Model<unknown>);
  for (const model of registry) {
    await model.syncIndexes();
  }
}
