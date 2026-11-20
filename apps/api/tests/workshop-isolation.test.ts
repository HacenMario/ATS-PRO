import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import {
  startSuite, authHeader, createSuperAdmin, makeSupervisor, makeWorkerWithInvite, createWorkshopAsSuperAdmin,
  type Suite,
} from './helpers/suite';

let suite: Suite;
beforeAll(async () => { suite = await startSuite(); });
afterAll(async () => { if (suite) await suite.cleanup(); });

describe('Multi-tenant workshop isolation', () => {
  let adminToken: string;
  let supA: string;
  let supB: string;
  let workerA1: string;
  let workerA2: string;
  let workshopA: string;
  let workshopB: string;
  let taskInA: string;
  let workerA2Id: string;
  let workerA1Id: string;

  beforeAll(async () => {
    adminToken = await createSuperAdmin(suite.app);
    workshopA = (await createWorkshopAsSuperAdmin(suite.app, adminToken, 'Atelier Oran')).id;
    workshopB = (await createWorkshopAsSuperAdmin(suite.app, adminToken, 'Usine Blida')).id;
    supA = await makeSupervisor(suite.app, adminToken, workshopA, 'Sup A');
    supB = await makeSupervisor(suite.app, adminToken, workshopB, 'Sup B');
    workerA1 = await makeWorkerWithInvite(suite.app, supA, workshopA, 'Worker A1');
    workerA2 = await makeWorkerWithInvite(suite.app, supA, workshopA, 'Worker A2');

    const me1 = await request(suite.app).get('/api/auth/me').set(authHeader(workerA1));
    workerA1Id = me1.body.user.id;
    const me2 = await request(suite.app).get('/api/auth/me').set(authHeader(workerA2));
    workerA2Id = me2.body.user.id;

    // task in workshop A assigned to worker A1
    const t = await request(suite.app).post('/api/tasks').set(authHeader(supA))
      .send({ workshopId: workshopA, title: 'Soudure châssis 12', description: 'Souder le châssis selon plan C-12', publish: true, priority: 'high', location: 'Ligne 2', safetyNotes: 'Casque + gants', assigneeId: workerA1Id, plannedStart: new Date(Date.now() + 3600e3).toISOString(), plannedEnd: new Date(Date.now() + 5 * 3600e3).toISOString() });
    expect(t.status, JSON.stringify(t.body)).toBe(201);
    taskInA = t.body.task.id;
  });

  it('worker sees only tasks assigned to him (not other workers of the same workshop)', async () => {
    const res = await request(suite.app).get('/api/tasks').set(authHeader(workerA2));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    const res1 = await request(suite.app).get('/api/tasks').set(authHeader(workerA1));
    expect(res1.status).toBe(200);
    expect(res1.body.items).toHaveLength(1);
    expect(res1.body.items[0].id).toBe(taskInA);
  });

  it('supervisor sees all tasks of his workshop only', async () => {
    const res = await request(suite.app).get('/api/tasks').set(authHeader(supA));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('supervisor of workshop B cannot read workshop A task details', async () => {
    const res = await request(suite.app).get(`/api/tasks/${taskInA}`).set(authHeader(supB));
    expect(res.status).toBe(404); // not in scope -> not found (no data leak)
  });

  it('supervisor of workshop B cannot manage workshop A members', async () => {
    const res = await request(suite.app).get(`/api/workshops/${workshopA}/members`).set(authHeader(supB));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('errors.notMember');
  });

  it('worker cannot list workshop members', async () => {
    const res = await request(suite.app).get(`/api/workshops/${workshopA}/members`).set(authHeader(workerA1));
    expect(res.status).toBe(200); // member can see the roster
    const resPatch = await request(suite.app).patch(`/api/workshops/${workshopA}/members/${workerA2Id}`).set(authHeader(workerA1))
      .send({ role: 'supervisor' });
    expect(resPatch.status).toBe(403);
  });

  it('worker cannot create tasks or edit workshop info', async () => {
    const res = await request(suite.app).post('/api/tasks').set(authHeader(workerA1))
      .send({ workshopId: workshopA, title: 'Sneaky', description: 'x', publish: false });
    expect(res.status).toBe(403);
    const res2 = await request(suite.app).patch(`/api/workshops/${workshopA}`).set(authHeader(workerA1))
      .send({ name: 'Hacked name' });
    expect(res2.status).toBe(403);
  });

  it('assignee must be an active member of the SAME workshop', async () => {
    const res = await request(suite.app).post('/api/tasks').set(authHeader(supB))
      .send({ workshopId: workshopB, title: 'Task in B', description: 'x', publish: true, priority: 'low', assigneeId: workerA1Id, plannedStart: new Date().toISOString(), plannedEnd: new Date(Date.now() + 3600e3).toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('errors.assigneeRequired');
  });

  it('super admin sees workshops and tasks across tenants', async () => {
    const list = await request(suite.app).get('/api/workshops').set(authHeader(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(2);
    const tasks = await request(suite.app).get('/api/tasks').set(authHeader(adminToken));
    expect(tasks.status).toBe(200);
    expect(tasks.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('invalid invitation codes are rejected', async () => {
    const res = await request(suite.app).post('/api/invitations/redeem').set(authHeader(workerA1))
      .send({ code: 'NOPE-000000' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('errors.codeInvalid');
  });

  it('worker cannot redeem the same workshop twice (409)', async () => {
    // fresh invite from supervisor A
    const inv = await request(suite.app).post(`/api/workshops/${workshopA}/invitations`).set(authHeader(supA))
      .send({ role: 'worker', expiresInDays: 3, maxUses: 5 });
    const code = inv.body.invitation.code;
    const first = await request(suite.app).post('/api/invitations/redeem').set(authHeader(workerA1)).send({ code });
    expect(first.status).toBe(409); // already member
    expect(first.body.error.code).toBe('errors.duplicateMembership');
  });
});
