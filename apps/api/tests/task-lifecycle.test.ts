import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import {
  startSuite, authHeader, createSuperAdmin, makeSupervisor, makeWorkerWithInvite, createWorkshopAsSuperAdmin,
  type Suite,
} from './helpers/suite';

let suite: Suite;
beforeAll(async () => { suite = await startSuite(); });
afterAll(async () => { if (suite) await suite.cleanup(); });

describe('Task lifecycle: assignment -> completion -> review -> approval', () => {
  let adminToken: string;
  let sup: string;
  let worker: string;
  let workshopId: string;
  let workerId: string;
  let draftId: string;
  let scheduledId: string;

  beforeAll(async () => {
    adminToken = await createSuperAdmin(suite.app);
    workshopId = (await createWorkshopAsSuperAdmin(suite.app, adminToken, 'Atelier Cycle')).id;
    sup = await makeSupervisor(suite.app, adminToken, workshopId, 'Sup Cycle');
    worker = await makeWorkerWithInvite(suite.app, sup, workshopId, 'Worker Cycle');
    const me = await request(suite.app).get('/api/auth/me').set(authHeader(worker));
    workerId = me.body.user.id;
  });

  it('supervisor creates a draft then schedules it; worker is notified', async () => {
    const draft = await request(suite.app).post('/api/tasks').set(authHeader(sup))
      .send({ workshopId, title: 'Peinture cabine', description: 'Peindre la cabine selon nuancier RAL 5010', publish: false, priority: 'medium', location: 'Hangar 1', safetyNotes: 'Masque' });
    expect(draft.status).toBe(201);
    expect(draft.body.task.status).toBe('draft');
    draftId = draft.body.task.id;

    const sched = await request(suite.app).post(`/api/tasks/${draftId}/schedule`).set(authHeader(sup))
      .send({ assigneeId: workerId, plannedStart: new Date(Date.now() + 1800e3).toISOString(), plannedEnd: new Date(Date.now() + 4 * 3600e3).toISOString() });
    expect(sched.status).toBe(200);
    expect(sched.body.task.status).toBe('scheduled');
    expect(sched.body.task.assigneeId).toBe(workerId);
    expect(Math.abs(sched.body.task.plannedDurationMs - 3.5 * 3600 * 1000)).toBeLessThanOrEqual(5);
    scheduledId = draftId;

    const notifs = await request(suite.app).get('/api/notifications').set(authHeader(worker));
    const assigned = notifs.body.items.find((n: { type: string }) => n.type === 'task_assigned');
    expect(assigned).toBeTruthy();
    expect(assigned.params.title).toBe('Peinture cabine');
    expect(notifs.body.unread).toBe(1);
  });

  it('worker starts, updates progress, reports completion; supervisor is notified', async () => {
    const start = await request(suite.app).post(`/api/tasks/${scheduledId}/start`).set(authHeader(worker));
    expect(start.status).toBe(200);
    expect(start.body.task.status).toBe('in_progress');
    expect(start.body.task.actualStart).toBeTruthy();

    const progress = await request(suite.app).post(`/api/tasks/${scheduledId}/progress`).set(authHeader(worker))
      .send({ progress: 60 });
    expect(progress.status).toBe(200);
    expect(progress.body.task.progress).toBe(60);

    const report = await request(suite.app).post(`/api/tasks/${scheduledId}/report`).set(authHeader(worker)).send({ note: 'Fini' });
    expect(report.status).toBe(200);
    expect(report.body.task.status).toBe('worker_reported_done');
    expect(report.body.task.progress).toBe(100);
    expect(report.body.task.reportedAt).toBeTruthy();

    const supNotifs = await request(suite.app).get('/api/notifications').set(authHeader(sup));
    const reported = supNotifs.body.items.find((n: { type: string }) => n.type === 'task_reported');
    expect(reported).toBeTruthy();
  });

  it('worker CANNOT approve, begin review or return — supervisor-only privileges', async () => {
    const approve = await request(suite.app).post(`/api/tasks/${scheduledId}/approve`).set(authHeader(worker))
      .send({ rating: 5 });
    expect(approve.status).toBe(403);
    expect(approve.body.error.code).toBe('errors.forbidden');

    const review = await request(suite.app).post(`/api/tasks/${scheduledId}/begin-review`).set(authHeader(worker));
    expect(review.status).toBe(403);

    const ret = await request(suite.app).post(`/api/tasks/${scheduledId}/return`).set(authHeader(worker))
      .send({ reason: 'not good' });
    expect(ret.status).toBe(403);
  });

  it('supervisor begins review, returns the task with reason; worker re-works and re-reports', async () => {
    const begin = await request(suite.app).post(`/api/tasks/${scheduledId}/begin-review`).set(authHeader(sup));
    expect(begin.status).toBe(200);
    expect(begin.body.task.status).toBe('awaiting_supervisor_review');

    const ret = await request(suite.app).post(`/api/tasks/${scheduledId}/return`).set(authHeader(sup))
      .send({ reason: 'Coulure de peinture côté gauche — refaire la zone' });
    expect(ret.status).toBe(200);
    expect(ret.body.task.status).toBe('in_progress');
    expect(ret.body.task.returnReason).toContain('Coulure');

    const workerNotifs = await request(suite.app).get('/api/notifications').set(authHeader(worker));
    const returned = workerNotifs.body.items.find((n: { type: string }) => n.type === 'task_returned');
    expect(returned).toBeTruthy();
    expect(returned.params.reason).toContain('Coulure');

    const report2 = await request(suite.app).post(`/api/tasks/${scheduledId}/report`).set(authHeader(worker));
    expect(report2.status).toBe(200);
    expect(report2.body.task.status).toBe('worker_reported_done');
  });

  it('supervisor approves with rating + comment; durations computed; worker notified', async () => {
    const approve = await request(suite.app).post(`/api/tasks/${scheduledId}/approve`).set(authHeader(sup))
      .send({ rating: 4, comment: 'Bon travail après retouche' });
    expect(approve.status).toBe(200);
    expect(approve.body.task.status).toBe('completed_approved');
    expect(approve.body.task.supervisorRating).toBe(4);
    expect(approve.body.task.approvedAt).toBeTruthy();
    expect(approve.body.task.actualDurationMs).toBeGreaterThan(0);
    // actual duration ≈ time from actualStart to approval (sanity bounds)
    expect(approve.body.task.actualDurationMs).toBeLessThan(24 * 3600 * 1000);

    const workerNotifs = await request(suite.app).get('/api/notifications').set(authHeader(worker));
    const approved = workerNotifs.body.items.find((n: { type: string }) => n.type === 'task_approved');
    expect(approved).toBeTruthy();
    expect(approved.params.rating).toBe('4');
  });

  it('change log records every step chronologically', async () => {
    const details = await request(suite.app).get(`/api/tasks/${scheduledId}`).set(authHeader(sup));
    const log = details.body.task.changeLog;
    const actions = log.map((c: { action: string }) => c.action);
    expect(actions).toContain('create');
    expect(actions).toContain('schedule');
    expect(actions).toContain('start');
    expect(actions).toContain('set_progress');
    expect(actions).toContain('report_done');
    expect(actions).toContain('begin_review');
    expect(actions).toContain('return');
    expect(actions).toContain('approve');
    for (let i = 1; i < log.length; i++) {
      expect(new Date(log[i].at).getTime()).toBeGreaterThanOrEqual(new Date(log[i - 1].at).getTime());
    }
  });

  it('overdue sweep marks late tasks and notifies once (dedup)', async () => {
    // Realistic scheduling requires future dates at creation, so create a task
    // whose planned end lapses almost immediately, wait for it, then sweep.
    const t = await request(suite.app).post('/api/tasks').set(authHeader(sup))
      .send({ workshopId, title: 'Task already late', description: 'x', publish: true, priority: 'urgent', assigneeId: workerId, plannedStart: new Date(Date.now() + 500).toISOString(), plannedEnd: new Date(Date.now() + 1500).toISOString() });
    expect(t.status).toBe(201);
    const lateId = t.body.task.id;
    await new Promise((resolve) => setTimeout(resolve, 2000)); // let the end pass

    const { runOverdueSweep } = await import('../src/jobs/scheduler');
    const first = await runOverdueSweep();
    expect(first.overdue).toBeGreaterThanOrEqual(1);
    const second = await runOverdueSweep();
    expect(second.overdue).toBe(0); // dedup — no double sweep

    const details = await request(suite.app).get(`/api/tasks/${lateId}`).set(authHeader(sup));
    expect(details.body.task.status).toBe('overdue');
    expect(details.body.task.previousStatus).toBe('scheduled');

    const workerNotifs = await request(suite.app).get('/api/notifications').set(authHeader(worker));
    const overdueNotifs = workerNotifs.body.items.filter((n: { type: string }) => n.type === 'task_overdue');
    expect(overdueNotifs.length).toBe(1);
  });

  it('overdue task can be rescheduled by the supervisor and restarted by the worker', async () => {
    const list = await request(suite.app).get('/api/tasks?status=overdue').set(authHeader(sup));
    const lateId = list.body.items[0].id;

    const sched = await request(suite.app).post(`/api/tasks/${lateId}/reschedule`).set(authHeader(sup))
      .send({ assigneeId: workerId, plannedStart: new Date(Date.now() + 600e3).toISOString(), plannedEnd: new Date(Date.now() + 2 * 3600e3).toISOString() });
    expect(sched.status).toBe(200);
    expect(sched.body.task.status).toBe('scheduled');

    const start = await request(suite.app).post(`/api/tasks/${lateId}/start`).set(authHeader(worker));
    expect(start.status).toBe(200);
    expect(start.body.task.status).toBe('in_progress');
  });

  it('comments notify the other party and appear in the log', async () => {
    const list = await request(suite.app).get('/api/tasks').set(authHeader(sup));
    const taskId = list.body.items.find((x: { status: string }) => x.status === 'in_progress').id;
    const comment = await request(suite.app).post(`/api/tasks/${taskId}/comment`).set(authHeader(sup))
      .send({ text: 'Pense à protéger la vitre avant de peindre' });
    expect(comment.status).toBe(200);

    const workerNotifs = await request(suite.app).get('/api/notifications').set(authHeader(worker));
    const c = workerNotifs.body.items.find((n: { type: string }) => n.type === 'task_comment');
    expect(c).toBeTruthy();
    expect(c.params.author).toContain('Sup Cycle');
  });

  it('stats endpoint aggregates dashboard figures', async () => {
    const stats = await request(suite.app).get('/api/tasks/stats').set(authHeader(sup));
    expect(stats.status).toBe(200);
    expect(stats.body.total).toBeGreaterThanOrEqual(2);
    expect(stats.body.byStatus['completed_approved']).toBeGreaterThanOrEqual(1);
    expect(stats.body.pendingReviews).toBe(0);
  });

  it('mark-all-read resets unread counter', async () => {
    const res = await request(suite.app).post('/api/notifications/read-all').set(authHeader(worker));
    expect(res.status).toBe(200);
    const me = await request(suite.app).get('/api/auth/me').set(authHeader(worker));
    expect(me.body.unreadNotifications).toBe(0);
  });

  it('cancelled tasks notify the assignee; cancelled -> reschedule allowed for supervisor', async () => {
    const t = await request(suite.app).post('/api/tasks').set(authHeader(sup))
      .send({ workshopId, title: 'To cancel', description: 'x', publish: true, priority: 'low', assigneeId: workerId, plannedStart: new Date(Date.now() + 3600e3).toISOString(), plannedEnd: new Date(Date.now() + 2 * 3600e3).toISOString() });
    const id = t.body.task.id;
    const cancel = await request(suite.app).post(`/api/tasks/${id}/cancel`).set(authHeader(sup))
      .send({ reason: 'Commande annulée par le client' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.task.status).toBe('cancelled');

    const workerNotifs = await request(suite.app).get('/api/notifications').set(authHeader(worker));
    const cancelled = workerNotifs.body.items.find((n: { type: string }) => n.type === 'task_cancelled');
    expect(cancelled).toBeTruthy();

    const re = await request(suite.app).post(`/api/tasks/${id}/reschedule`).set(authHeader(sup))
      .send({ assigneeId: workerId, plannedStart: new Date(Date.now() + 3600e3).toISOString(), plannedEnd: new Date(Date.now() + 3 * 3600e3).toISOString() });
    expect(re.status).toBe(200);
    expect(re.body.task.status).toBe('scheduled');
  });

  it('admin endpoints are closed to supervisors and workers', async () => {
    const users = await request(suite.app).get('/api/admin/users').set(authHeader(sup));
    expect(users.status).toBe(403);
    const settings = await request(suite.app).get('/api/admin/settings').set(authHeader(adminToken));
    expect(settings.status).toBe(200);
    const put = await request(suite.app).put('/api/admin/settings').set(authHeader(adminToken))
      .send({ enabledLanguages: { ar: true, fr: false, en: false } });
    expect(put.status).toBe(200);
    expect(put.body.settings.enabledLanguages.fr).toBe(false);
    const bad = await request(suite.app).put('/api/admin/settings').set(authHeader(adminToken))
      .send({ enabledLanguages: { ar: false, fr: false, en: false } });
    expect(bad.status).toBe(400);
  });

  it('task delete cascades to notifications and removes the task; worker is forbidden', async () => {
    const created = await request(suite.app).post('/api/tasks').set(authHeader(sup))
      .send({ workshopId, title: 'Task doomed to deletion', description: 'x', publish: true, priority: 'medium', assigneeId: workerId, plannedStart: new Date(Date.now() + 3600e3).toISOString(), plannedEnd: new Date(Date.now() + 3 * 3600e3).toISOString() });
    expect(created.status).toBe(201);
    const doomedId = created.body.task.id;

    // the assignment produced a notification tied to the task
    const workerNotifsBefore = await request(suite.app).get('/api/notifications').set(authHeader(worker));
    const assigned = workerNotifsBefore.body.items.find((n: { type: string; taskId?: string }) => n.type === 'task_assigned' && n.taskId === doomedId);
    expect(assigned).toBeTruthy();

    // workers can never hard-delete
    const forbidden = await request(suite.app).delete(`/api/tasks/${doomedId}`).set(authHeader(worker));
    expect(forbidden.status).toBe(403);

    // supervisor deletes: task gone, its notifications gone
    const del = await request(suite.app).delete(`/api/tasks/${doomedId}`).set(authHeader(sup));
    expect(del.status).toBe(200);
    const gone = await request(suite.app).get(`/api/tasks/${doomedId}`).set(authHeader(sup));
    expect(gone.status).toBe(404);

    const workerNotifsAfter = await request(suite.app).get('/api/notifications').set(authHeader(worker));
    const stillThere = workerNotifsAfter.body.items.find((n: { taskId?: string }) => n.taskId === doomedId);
    expect(stillThere).toBeUndefined();
  });

  it('delivery flow: create delivery worker, request delivery after approval, accept, complete, stats', async () => {
    // supervisor creates a delivery-worker account in his workshop
    const created = await request(suite.app).post(`/api/workshops/${workshopId}/members/create`).set(authHeader(sup))
      .send({ name: 'Delivery Hero', email: `dlv-${Date.now()}@test.local`, password: 'Dlv#2026!pw', role: 'delivery_worker', recoveryPhrase: 'delivery recovery phrase 1' });
    expect(created.status).toBe(201);
    expect(created.body.user.role).toBe('delivery_worker');
    const dlvLogin = await request(suite.app).post('/api/auth/login')
      .set('Content-Type', 'application/json').set('X-Requested-With', 'XMLHttpRequest')
      .send({ email: created.body.user.email, password: 'Dlv#2026!pw' });
    expect(dlvLogin.status).toBe(200);
    const dlv = authHeader(dlvLogin.body.accessToken);

    // approved task
    const t = await request(suite.app).post('/api/tasks').set(authHeader(sup))
      .send({ workshopId, title: 'Task to be delivered', description: 'x', publish: true, priority: 'medium', assigneeId: workerId, plannedStart: new Date(Date.now() + 3600e3).toISOString(), plannedEnd: new Date(Date.now() + 3 * 3600e3).toISOString() });
    expect(t.status).toBe(201);
    const id = t.body.task.id;
    await request(suite.app).post(`/api/tasks/${id}/start`).set(authHeader(worker)).expect(200);
    await request(suite.app).post(`/api/tasks/${id}/report`).set(authHeader(worker)).expect(200);
    const approved = await request(suite.app).post(`/api/tasks/${id}/approve`).set(authHeader(sup)).send({ rating: 5 });
    expect(approved.status).toBe(200);

    // delivery requested with customer details; requesting twice fails
    const req1 = await request(suite.app).post(`/api/tasks/${id}/delivery/request`).set(authHeader(sup))
      .send({ customerName: 'زبون الاختبار', customerPhone: '0555112233', deliveryAddress: 'حي النصر، العمارة 12', deliveryFee: 500 });
    expect(req1.status).toBe(200);
    expect(req1.body.task.delivery.status).toBe('pending');
    const req2 = await request(suite.app).post(`/api/tasks/${id}/delivery/request`).set(authHeader(sup))
      .send({ customerName: 'زبون الاختبار', customerPhone: '0555112233', deliveryAddress: 'حي النصر', deliveryFee: 500 });
    expect(req2.status).toBe(409);

    // the delivery worker received the precise notification (requester = workshop)
    const notifs = await request(suite.app).get('/api/notifications').set(dlv);
    const ready = notifs.body.items.find((n: { type: string }) => n.type === 'delivery_ready');
    expect(ready).toBeTruthy();
    expect(ready.params.taskTitle).toBe('Task to be delivered');
    expect(ready.params.customerPhone).toBe('0555112233');
    expect(ready.params.fee).toBe('500');
    expect(typeof ready.params.requester).toBe('string');
    expect(ready.params.requester.length).toBeGreaterThan(0);

    // the ordinary worker cannot accept; the delivery worker can
    const forbidden = await request(suite.app).post(`/api/tasks/${id}/delivery/accept`).set(authHeader(worker));
    expect(forbidden.status).toBe(403);
    const accepted = await request(suite.app).post(`/api/tasks/${id}/delivery/accept`).set(dlv);
    expect(accepted.status).toBe(200);
    expect(accepted.body.task.delivery.status).toBe('accepted');
    const completed = await request(suite.app).post(`/api/tasks/${id}/delivery/complete`).set(dlv);
    expect(completed.status).toBe(200);
    expect(completed.body.task.delivery.status).toBe('delivered');

    // stats: workshop shows 1 delivered; the delivery worker sees personal earnings
    const stats = await request(suite.app).get('/api/tasks/stats').set(dlv);
    expect(stats.status).toBe(200);
    expect(stats.body.delivery.delivered).toBe(1);
    expect(stats.body.delivery.myDelivered).toBe(1);
    expect(stats.body.delivery.myEarnings).toBe(500);
    expect(stats.body.deliveryWorkersCount).toBe(1);
  });

  it('targeted delivery request reaches ONLY the chosen delivery worker', async () => {
    // two delivery workers in the workshop
    const mk = (name: string) => request(suite.app).post(`/api/workshops/${workshopId}/members/create`).set(authHeader(sup))
      .send({ name, email: `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}@test.local`, password: 'Dlv#2026!pw', role: 'delivery_worker', recoveryPhrase: `recovery ${name} phrase 123` });
    const w1 = await mk('Target One');
    const w2 = await mk('Target Two');
    expect(w1.status).toBe(201);
    expect(w2.status).toBe(201);

    const created = await request(suite.app).post('/api/tasks').set(authHeader(sup))
      .send({ workshopId, title: 'Targeted delivery task', description: 'x', publish: true, priority: 'medium', assigneeId: workerId, plannedStart: new Date(Date.now() + 3600e3).toISOString(), plannedEnd: new Date(Date.now() + 3 * 3600e3).toISOString() });
    expect(created.status).toBe(201);
    const id = created.body.task.id;
    await request(suite.app).post(`/api/tasks/${id}/start`).set(authHeader(worker)).expect(200);
    await request(suite.app).post(`/api/tasks/${id}/report`).set(authHeader(worker)).expect(200);
    await request(suite.app).post(`/api/tasks/${id}/approve`).set(authHeader(sup)).send({ rating: 4 }).expect(200);

    // supervisor targets ONLY w1
    const req1 = await request(suite.app).post(`/api/tasks/${id}/delivery/request`).set(authHeader(sup))
      .send({ customerName: 'زبون موجّه', customerPhone: '0777000111', deliveryAddress: 'شارع الاستقلال 4', deliveryFee: 300, deliveryWorkerId: w1.body.user.id });
    expect(req1.status).toBe(200);

    // w1 got the offer; w2 did not
    const login1 = await request(suite.app).post('/api/auth/login')
      .set('Content-Type', 'application/json').set('X-Requested-With', 'XMLHttpRequest')
      .send({ email: w1.body.user.email, password: 'Dlv#2026!pw' });
    const login2 = await request(suite.app).post('/api/auth/login')
      .set('Content-Type', 'application/json').set('X-Requested-With', 'XMLHttpRequest')
      .send({ email: w2.body.user.email, password: 'Dlv#2026!pw' });
    const n1 = await request(suite.app).get('/api/notifications').set(authHeader(login1.body.accessToken));
    const got1 = n1.body.items.find((n: { type: string }) => n.type === 'delivery_ready');
    expect(got1).toBeTruthy();
    expect(got1.params.customerPhone).toBe('0777000111');
    const n2 = await request(suite.app).get('/api/notifications').set(authHeader(login2.body.accessToken));
    const got2 = n2.body.items.find((n: { type: string }) => n.type === 'delivery_ready');
    expect(got2).toBeUndefined();
  });
});
