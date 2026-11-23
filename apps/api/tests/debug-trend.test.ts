import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { Task } from '../src/db/models/Task';
import {
  startSuite, authHeader, createSuperAdmin, makeSupervisor, makeWorkerWithInvite, createWorkshopAsSuperAdmin,
  type Suite,
} from './helpers/suite';

let suite: Suite;
beforeAll(async () => { suite = await startSuite(); });
afterAll(async () => { if (suite) await suite.cleanup(); });

describe('DEBUG trend buckets', () => {
  let adminToken: string;
  let sup: string;
  let worker: string;
  let workshopId: string;
  let workerId: string;
  let taskId: string;

  beforeAll(async () => {
    adminToken = await createSuperAdmin(suite.app);
    workshopId = (await createWorkshopAsSuperAdmin(suite.app, adminToken, 'Dbg')).id;
    sup = await makeSupervisor(suite.app, adminToken, workshopId, 'Dbg Sup');
    worker = await makeWorkerWithInvite(suite.app, sup, workshopId, 'Dbg W');
    const me = await request(suite.app).get('/api/auth/me').set(authHeader(worker));
    workerId = me.body.user.id;
    const draft = await request(suite.app).post('/api/tasks').set(authHeader(sup))
      .send({ workshopId, title: 'T', description: 'D', publish: false, priority: 'high', location: 'L', safetyNotes: 'S' });
    console.log('DRAFT STATUS:', draft.status, 'BODY:', JSON.stringify(draft.body).slice(0, 300));
    taskId = draft.body.task?.id;
    await request(suite.app).post(`/api/tasks/${taskId}/schedule`).set(authHeader(sup))
      .send({ assigneeId: workerId, plannedStart: new Date(Date.now() + 1800e3).toISOString(), plannedEnd: new Date(Date.now() + 3600e3).toISOString() });
    await request(suite.app).post(`/api/tasks/${taskId}/start`).set(authHeader(worker));
    await request(suite.app).post(`/api/tasks/${taskId}/report`).set(authHeader(worker)).send({});
    await request(suite.app).post(`/api/tasks/${taskId}/approve`).set(authHeader(sup)).send({ rating: 5, comment: 'ok' });
  });

  it('raw $dateTrunc output', async () => {
    const doc = await Task.findById(taskId).select('status approvedAt createdAt').lean();
    console.log('DOC:', JSON.stringify(doc));
    const rows = await Task.aggregate([
      { $match: { status: 'completed_approved' } },
      { $group: { _id: { $dateTrunc: { date: '$approvedAt', unit: 'week', startOfWeek: 'monday' } }, n: { $sum: 1 } } },
    ]);
    console.log('TRUNC ROWS:', JSON.stringify(rows, (_, v) => (v instanceof Date ? v.toISOString() : v)));
    const d = new Date();
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    console.log('ANCHOR:', x.toISOString(), 'UTCday:', d.getUTCDay());
    const stats = await request(suite.app).get('/api/tasks/stats').set(authHeader(sup));
    console.log('TREND:', JSON.stringify(stats.body.trend));
    console.log('RATE:', stats.body.onTimeRate);
    expect(true).toBe(true);
  });
});
