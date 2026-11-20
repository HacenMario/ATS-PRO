/** Shared test harness: in-memory MongoDB + app + auth helpers. */
import './env';
import request from 'supertest';
import type { Express } from 'express';

export const XHR = { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' };

export interface Suite {
  app: Express;
  uri: string;
  cleanup: () => Promise<void>;
}

export async function startSuite(): Promise<Suite> {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri('ats');

  const { connectDatabase, disconnectDatabase, syncIndexes } = await import('../../src/db/connect');
  const { createApp } = await import('../../src/app');

  await connectDatabase(uri);
  await syncIndexes();
  // Open registration inside tests (default platform mode is invite-only),
  // and clear the module-level settings cache so stale values never leak
  // between suites running in the same process.
  const { PlatformSettings } = await import('../../src/db/models/PlatformSettings');
  const { invalidateSettingsCache } = await import('../../src/services/settings');
  await PlatformSettings.updateOne({ _id: 'global' }, { $set: { registrationMode: 'open' } }, { upsert: true });
  invalidateSettingsCache();

  // Seed a workshop + supervisor + open invitation so tests can exercise the
  // now-mandatory invite-code registration path.
  const bcrypt = (await import('bcryptjs')).default;
  const { User } = await import('../../src/db/models/User');
  const { Workshop } = await import('../../src/db/models/Workshop');
  const { Invitation } = await import('../../src/db/models/Invitation');
  const sup = await User.create({
    email: `seed-sup-${Date.now()}@test.local`,
    passwordHash: await bcrypt.hash('Supervisor#2026!', 10),
    name: 'Seed Supervisor',
    role: 'supervisor',
    status: 'active',
    recoveryHash: 'seeded',
  });
  const ws = await Workshop.create({
    name: 'Seed Workshop',
    description: '',
    address: '',
    contactPhone: '',
    contactEmail: '',
    timezone: 'Africa/Algiers',
    status: 'active',
    createdById: sup._id,
  });
  const inv = await Invitation.create({
    workshopId: ws._id,
    code: `SEED-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
    role: 'worker',
    autoJoin: true,
    maxUses: 500,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    createdById: sup._id,
  });
  const app = createApp();
  (app as unknown as { __seedInvite: string }).__seedInvite = inv.code;
  return {
    app,
    uri,
    cleanup: async () => {
      await disconnectDatabase();
      await mongod.stop();
    },
  };
}

export async function registerUser(app: Express, data: { name: string; email: string; password: string; inviteCode?: string; recoveryPhrase?: string }) {
  const code = data.inviteCode ?? (app as unknown as { __seedInvite?: string }).__seedInvite ?? 'SEED-NOPE';
  const res = await request(app)
    .post('/api/auth/register')
    .set(XHR)
    .send({ preferredLanguage: 'ar', recoveryPhrase: data.recoveryPhrase ?? 'my-secret-phrase', ...data, inviteCode: code });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { user: { id: string; email: string; role: string }; accessToken: string; refreshToken: string };
}

export async function loginUser(app: Express, email: string, password: string) {
  const res = await request(app).post('/api/auth/login').set(XHR).send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { user: { id: string; role: string }; accessToken: string; refreshToken: string };
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}`, 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' };
}

export async function createWorkshopAsSuperAdmin(app: Express, adminToken: string, name: string): Promise<{ id: string }> {
  const { default: request2 } = await import('supertest');
  const res = await request2(app)
    .post('/api/workshops')
    .set(authHeader(adminToken))
    .send({ name, description: 'Atelier de test', address: '', contactPhone: '', contactEmail: '', timezone: 'Africa/Algiers', status: 'active' });
  if (res.status !== 201) throw new Error(`workshop create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.workshop.id };
}

/** Creates the super admin directly in the DB (bootstrap is skipped in tests) then logs in. */
export async function createSuperAdmin(app: Express): Promise<string> {
  const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const { User } = await import('../../src/db/models/User');
  const bcrypt = (await import('bcryptjs')).default;
  await User.create({
    email,
    passwordHash: await bcrypt.hash('SuperAdmin#2026!x', 10),
    name: 'Admin',
    role: 'super_admin',
    status: 'active',
    recoveryHash: 'seeded',
  });
  const relogin = await loginUser(app, email, 'SuperAdmin#2026!x');
  return relogin.accessToken;
}

/** Creates any account directly in the DB (test bootstrap helper). */
export async function seedUser(data: { name: string; email: string; password: string; role?: string }): Promise<{ id: string }> {
  const { User } = await import('../../src/db/models/User');
  const bcrypt = (await import('bcryptjs')).default;
  const u = await User.create({
    email: data.email,
    passwordHash: await bcrypt.hash(data.password, 10),
    name: data.name,
    role: data.role ?? 'worker',
    status: 'active',
    recoveryHash: 'seeded',
  });
  return { id: u._id.toString() };
}

/** Creates a supervisor account directly in the DB + active membership, then logs in. */
export async function makeSupervisor(app: Express, adminToken: string, workshopId: string, name: string): Promise<string> {
  const email = `${name.toLowerCase().replace(/\s+/g, '')}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const { Membership } = await import('../../src/db/models/Membership');
  const user = await seedUser({ name, email, password: 'Supervisor#2026!', role: 'supervisor' });
  await Membership.create({
    workshopId,
    userId: user.id,
    role: 'supervisor',
    status: 'active',
    joinedAt: new Date(),
  });
  const relogin = await loginUser(app, email, 'Supervisor#2026!');
  return relogin.accessToken;
}

export async function makeWorkerWithInvite(app: Express, supervisorToken: string, workshopId: string, name: string): Promise<string> {
  const res = await request(app)
    .post(`/api/workshops/${workshopId}/invitations`)
    .set(authHeader(supervisorToken))
    .send({ role: 'worker', expiresInDays: 7, maxUses: 10, autoJoin: true });
  if (res.status !== 201) throw new Error(`invite create failed: ${res.status} ${JSON.stringify(res.body)}`);
  const code = res.body.invitation.code;
  const user = await registerUser(app, { name, email: `${name.toLowerCase().replace(/\s+/g, '')}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`, password: 'Worker#2026!pw', inviteCode: code });
  return user.accessToken;
}
