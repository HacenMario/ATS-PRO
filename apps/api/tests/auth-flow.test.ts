import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { startSuite, registerUser, loginUser, authHeader, XHR, createSuperAdmin, makeSupervisor, makeWorkerWithInvite, createWorkshopAsSuperAdmin, type Suite } from './helpers/suite';

let suite: Suite;
beforeAll(async () => { suite = await startSuite(); });
afterAll(async () => { if (suite) await suite.cleanup(); });

describe('Authentication flow', () => {
  const seedCode = () => (suite.app as unknown as { __seedInvite: string }).__seedInvite;

  it('registers a user and returns tokens', async () => {
    const { app } = suite;
    const res = await request(app).post('/api/auth/register').set(XHR)
      .send({ name: 'Amine Worker', email: 'worker1@test.local', password: 'Worker#2026!pw', preferredLanguage: 'fr', inviteCode: seedCode(), recoveryPhrase: 'blue horse battery' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('worker1@test.local');
    expect(res.body.user.preferredLanguage).toBe('fr');
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it('rejects duplicate email', async () => {
    const { app } = suite;
    const res = await request(app).post('/api/auth/register').set(XHR)
      .send({ name: 'Xavier', email: 'worker1@test.local', password: 'Worker#2026!pw', inviteCode: seedCode(), recoveryPhrase: 'blue horse battery' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('errors.duplicateEmail');
  });

  it('rejects short passwords and missing invite codes', async () => {
    const { app } = suite;
    const short = await request(app).post('/api/auth/register').set(XHR)
      .send({ name: 'Yassine', email: 'weak@test.local', password: 'abc', inviteCode: (app as unknown as { __seedInvite: string }).__seedInvite, recoveryPhrase: 'blue horse battery' });
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe('errors.passwordShort');

    const noCode = await request(app).post('/api/auth/register').set(XHR)
      .send({ name: 'Yassine', email: 'nocode@test.local', password: 'anypassword', recoveryPhrase: 'blue horse battery' });
    expect(noCode.status).toBe(400);
    expect(noCode.body.error.code).toBe('errors.inviteRequired');
  });

  it('logs in and /me returns memberships + unread count', async () => {
    const { app } = suite;
    const login = await request(app).post('/api/auth/login').set(XHR)
      .send({ email: 'worker1@test.local', password: 'Worker#2026!pw' });
    expect(login.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set(authHeader(login.body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('worker1@test.local');
    expect(me.body.unreadNotifications).toBe(0);
    expect(Array.isArray(me.body.memberships)).toBe(true);
  });

  it('refresh rotates tokens and rejects reuse (theft detection)', async () => {
    const { app } = suite;
    const login = await loginUser(app, 'worker1@test.local', 'Worker#2026!pw');
    const first = await request(app).post('/api/auth/refresh').set(XHR).send({ refreshToken: login.refreshToken });
    expect(first.status).toBe(200);
    // Reuse of the OLD token must now fail and revoke the family.
    const reuse = await request(app).post('/api/auth/refresh').set(XHR).send({ refreshToken: login.refreshToken });
    expect(reuse.status).toBe(401);
    // And the new token is dead too (family revoked).
    const second = await request(app).post('/api/auth/refresh').set(XHR).send({ refreshToken: first.body.refreshToken });
    expect(second.status).toBe(401);
  });

  it('locks the account after 5 failed attempts then unlocks after 15 min', async () => {
    const { app } = suite;
    await registerUser(app, { name: 'Locky', email: 'locky@test.local', password: 'Worker#2026!pw' });
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/auth/login').set(XHR)
        .send({ email: 'locky@test.local', password: 'WrongPass#1' });
      expect(res.status).toBe(401);
    }
    const locked = await request(app).post('/api/auth/login').set(XHR)
      .send({ email: 'locky@test.local', password: 'Worker#2026!pw' });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('errors.tooManyAttempts');

    // simulate lock expiry
    const { User } = await import('../src/db/models/User');
    await User.updateOne({ email: 'locky@test.local' }, { $set: { lockUntil: new Date(Date.now() - 1000) } });
    const ok = await request(app).post('/api/auth/login').set(XHR)
      .send({ email: 'locky@test.local', password: 'Worker#2026!pw' });
    expect(ok.status).toBe(200);
  });

  it('password change requires the current password and revokes sessions', async () => {
    const { app } = suite;
    const user = await registerUser(app, { name: 'Changer', email: 'changer@test.local', password: 'Worker#2026!pw' });
    const bad = await request(app).post('/api/auth/change-password').set(authHeader(user.accessToken))
      .send({ currentPassword: 'Nope#12345', newPassword: 'NewPass#2026ok' });
    expect(bad.status).toBe(400);

    const ok = await request(app).post('/api/auth/change-password').set(authHeader(user.accessToken))
      .send({ currentPassword: 'Worker#2026!pw', newPassword: 'NewPass#2026ok' });
    expect(ok.status).toBe(200);

    // old access token is still valid (15-min JWT) but refresh must be revoked
    const refresh = await request(app).post('/api/auth/refresh').set(XHR).send({ refreshToken: user.refreshToken });
    expect(refresh.status).toBe(401);
    const relogin = await loginUser(app, 'changer@test.local', 'NewPass#2026ok');
    expect(relogin.accessToken).toBeTruthy();
  });

  it('recovery phrase resets the password directly (no email involved)', async () => {
    const { app } = suite;
    await registerUser(app, { name: 'Resettable', email: 'resettable@test.local', password: 'Worker#2026!pw', recoveryPhrase: 'blue horse battery' });

    const badPhrase = await request(app).post('/api/auth/recover-password').set(XHR)
      .send({ email: 'resettable@test.local', recoveryPhrase: 'wrong phrase here', newPassword: 'NewPass#2026ok' });
    expect(badPhrase.status).toBe(400);

    const ok = await request(app).post('/api/auth/recover-password').set(XHR)
      .send({ email: 'resettable@test.local', recoveryPhrase: 'Blue Horse  Battery ', newPassword: 'NewPass#2026ok' });
    expect(ok.status).toBe(200);
    const relogin = await loginUser(app, 'resettable@test.local', 'NewPass#2026ok');
    expect(relogin.user.role).toBe('worker');
  });

  it('worker can request a password reset to supervisors; supervisor approves with a new password', async () => {
    const { app } = suite;
    const adminToken = await createSuperAdmin(app);
    const workshopId = (await createWorkshopAsSuperAdmin(app, adminToken, 'Atelier Reset')).id;
    const supToken = await makeSupervisor(app, adminToken, workshopId, 'Sup Reset');
    const worker = await makeWorkerWithInvite(app, supToken, workshopId, 'Reset Worker');

    const me = await request(app).get('/api/auth/me').set(authHeader(worker));
    const workerId = me.body.user.id;
    const workerEmail = me.body.user.email;

    const reqRes = await request(app).post('/api/auth/request-reset').set(XHR).send({ email: workerEmail });
    expect(reqRes.status).toBe(200);

    const list = await request(app).get(`/api/workshops/${workshopId}/reset-requests`).set(authHeader(supToken));
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBe(1);
    expect(list.body.items[0].email).toBe(workerEmail);
    const reqId = list.body.items[0].id;

    const approve = await request(app).post(`/api/workshops/${workshopId}/reset-requests/${reqId}/approve`)
      .set(authHeader(supToken)).send({ password: 'FreshPass#77' });
    expect(approve.status).toBe(200);

    // old session revoked; new password works
    const meAfter = await request(app).get('/api/auth/me').set(authHeader(worker));
    expect(meAfter.status).toBe(401);
    const relogin = await loginUser(app, workerEmail, 'FreshPass#77');
    expect(relogin.user.id).toBe(workerId);
    void workerId;
  });

  it('super admin sets a password directly; responsible supervisor is notified with the plaintext', async () => {
    const { app } = suite;
    const adminToken = await createSuperAdmin(app);
    const workshopId = (await createWorkshopAsSuperAdmin(app, adminToken, 'Atelier AdminPw')).id;
    const supToken = await makeSupervisor(app, adminToken, workshopId, 'Sup AdminPw');
    const workerToken = await makeWorkerWithInvite(app, supToken, workshopId, 'Pw Worker');
    const me = await request(app).get('/api/auth/me').set(authHeader(workerToken));
    const workerId = me.body.user.id;

    const setPw = await request(app).post(`/api/admin/users/${workerId}/set-password`)
      .set(authHeader(adminToken)).send({ password: 'DirectPw#2026' });
    expect(setPw.status).toBe(200);

    // supervisor received the plaintext via notification
    const supNotifs = await request(app).get('/api/notifications?pageSize=5').set(authHeader(supToken));
    const pwNotif = supNotifs.body.items.find((n: { type: string }) => n.type === 'password_changed_by_admin');
    expect(pwNotif).toBeTruthy();
    expect(pwNotif.params.password).toBe('DirectPw#2026');
  });

  it('super admin can create a worker account linked to a workshop', async () => {
    const { app } = suite;
    const adminToken = await createSuperAdmin(app);
    const workshopId = (await createWorkshopAsSuperAdmin(app, adminToken, 'Atelier Create')).id;
    const created = await request(app).post('/api/admin/users').set(authHeader(adminToken))
      .send({ name: 'Created Worker', email: `cw-${Date.now()}@test.local`, password: 'easyone', workshopId, role: 'worker', recoveryPhrase: 'recovery phrase test 123' });
    expect(created.status).toBe(201);
    const login = await loginUser(app, created.body.user.email, 'easyone');
    expect(login.user.role).toBe('worker');
  });

  it('CSRF guard rejects mutations without the custom header', async () => {
    const { app } = suite;
    const res = await request(app).post('/api/auth/login').send({ email: 'worker1@test.local', password: 'Worker#2026!pw' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('errors.forbidden');
  });

  it('unauthenticated /me returns 401', async () => {
    const { app } = suite;
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('errors.unauthenticated');
  });
});
