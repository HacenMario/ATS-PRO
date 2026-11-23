import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import {
  startSuite, authHeader, createSuperAdmin, makeSupervisor, makeWorkerWithInvite, createWorkshopAsSuperAdmin,
  type Suite,
} from './helpers/suite';

let suite: Suite;
beforeAll(async () => { suite = await startSuite(); });
afterAll(async () => { if (suite) await suite.cleanup(); });

describe('Task statistics: 8-week trend, priority mix, on-time rate', () => {
  let adminToken: string;
  let sup: string;
  let worker: string;
  let workshopId: string;
  let workerId: string;

  beforeAll(async () => {
    adminToken = await createSuperAdmin(suite.app);
    workshopId = (await createWorkshopAsSuperAdmin(suite.app, adminToken, 'Atelier Stats')).id;
    sup = await makeSupervisor(suite.app, adminToken, workshopId, 'Sup Stats');
    worker = await makeWorkerWithInvite(suite.app, sup, workshopId, 'Worker Stats');
    const me = await request(suite.app).get('/api/auth/me').set(authHeader(worker));
    workerId = me.body.user.id;
  });

  it('runs one task through the full approved cycle', async () => {
    const draft = await request(suite.app).post('/api/tasks').set(authHeader(sup))
      .send({ workshopId, title: 'Serrage châssis', description: 'Contrôle du serrage', publish: false, priority: 'high', location: 'L1', safetyNotes: 'Gants' });
    expect(draft.status).toBe(201);
    const id = draft.body.task.id;

    const sched = await request(suite.app).post(`/api/tasks/${id}/schedule`).set(authHeader(sup))
      .send({ assigneeId: workerId, plannedStart: new Date(Date.now() + 1800e3).toISOString(), plannedEnd: new Date(Date.now() + 3600e3).toISOString() });
    expect(sched.status).toBe(200);

    expect((await request(suite.app).post(`/api/tasks/${id}/start`).set(authHeader(worker))).status).toBe(200);
    expect((await request(suite.app).post(`/api/tasks/${id}/report`).set(authHeader(worker)).send({ note: 'OK' })).status).toBe(200);
    const approved = await request(suite.app).post(`/api/tasks/${id}/approve`).set(authHeader(sup)).send({ rating: 5, comment: 'Parfait' });
    expect(approved.status).toBe(200);
    expect(approved.body.task.status).toBe('completed_approved');
  });

  it('GET /api/tasks/stats exposes trend(8), byPriority and onTimeRate', async () => {
    const stats = await request(suite.app).get('/api/tasks/stats').set(authHeader(sup));
    expect(stats.status).toBe(200);

    const trend = stats.body.trend as { weekStart: string; created: number; completed: number }[];
    expect(Array.isArray(trend)).toBe(true);
    expect(trend).toHaveLength(8);
    // buckets are ascending Mondays
    for (let i = 1; i < trend.length; i += 1) {
      expect(new Date(trend[i].weekStart).getTime()).toBeGreaterThan(new Date(trend[i - 1].weekStart).getTime());
    }
    // Week-boundary-proof: the approved task lands in the bucket of ITS week
    // (the last bucket is the CURRENT — possibly empty — week).
    expect(Math.max(...trend.map((p) => p.completed))).toBeGreaterThanOrEqual(1);
    expect(Math.max(...trend.map((p) => p.created))).toBeGreaterThanOrEqual(1);

    const byPriority = stats.body.byPriority as Record<string, number>;
    expect(byPriority.high).toBeGreaterThanOrEqual(1);
    expect(Object.keys(byPriority).sort()).toEqual(['high', 'low', 'medium', 'urgent']);

    // the approved task took far less than its planned hour → on-time rate > 0
    expect(stats.body.onTimeRate).not.toBeNull();
    expect(stats.body.onTimeRate).toBeGreaterThan(0);
    expect(stats.body.onTimeRate).toBeLessThanOrEqual(100);
  });

  it('a worker can still read the stats endpoint (scoped to own tasks)', async () => {
    const stats = await request(suite.app).get('/api/tasks/stats').set(authHeader(worker));
    expect(stats.status).toBe(200);
    expect(Array.isArray(stats.body.trend)).toBe(true);
  });
});
