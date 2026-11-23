/* Temporary debug harness — deleted after diagnosing the trend buckets. */
import request from 'supertest';
import {
  startSuite, authHeader, createSuperAdmin, makeSupervisor, makeWorkerWithInvite, createWorkshopAsSuperAdmin,
} from './tests/helpers/suite';

(async () => {
  const suite = await startSuite();
  try {
    const adminToken = await createSuperAdmin(suite.app);
    const workshopId = (await createWorkshopAsSuperAdmin(suite.app, adminToken, 'Dbg')).id;
    const sup = await makeSupervisor(suite.app, adminToken, workshopId, 'Dbg Sup');
    const worker = await makeWorkerWithInvite(suite.app, sup, workshopId, 'Dbg W');
    const me = await request(suite.app).get('/api/auth/me').set(authHeader(worker));
    const workerId = me.body.user.id;
    const draft = await request(suite.app).post('/api/tasks').set(authHeader(sup))
      .send({ workshopId, title: 'T', description: 'D', publish: false, priority: 'high', location: 'L', safetyNotes: 'S' });
    const id = draft.body.task.id;
    await request(suite.app).post(`/api/tasks/${id}/schedule`).set(authHeader(sup))
      .send({ assigneeId: workerId, plannedStart: new Date(Date.now() + 1800e3).toISOString(), plannedEnd: new Date(Date.now() + 3600e3).toISOString() });
    await request(suite.app).post(`/api/tasks/${id}/start`).set(authHeader(worker));
    await request(suite.app).post(`/api/tasks/${id}/report`).set(authHeader(worker)).send({});
    const ap = await request(suite.app).post(`/api/tasks/${id}/approve`).set(authHeader(sup)).send({ rating: 5, comment: 'ok' });
    console.log('approvedAt:', ap.body.task.approvedAt);
    const stats = await request(suite.app).get('/api/tasks/stats').set(authHeader(sup));
    console.log('trend:', JSON.stringify(stats.body.trend));
    console.log('onTimeRate:', stats.body.onTimeRate, 'byPriority:', JSON.stringify(stats.body.byPriority));
    console.log('NOW:', new Date().toISOString(), 'DAY:', new Date().getUTCDay());
  } finally {
    await suite.cleanup();
    process.exit(0);
  }
})().catch((e) => { console.error('ERR', e); process.exit(1); });
