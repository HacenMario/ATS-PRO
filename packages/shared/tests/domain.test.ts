import { describe, it, expect } from 'vitest';
import {
  canPerformTaskAction,
  resolveTransition,
  TaskTransitionError,
  assertWorkerSafety,
  TRANSITIONS,
  overduePatch,
  isTerminal,
  ACTIVE_STATUSES,
} from '../src/task-state-machine';
import { plannedDurationMs, actualDurationMs, isPastDue, splitDuration } from '../src/durations';
import { createTaskSchema, scheduleSchema, approveSchema, returnTaskSchema, passwordSchema, registerSchema, taskQuerySchema } from '../src/validation';

const supervisor = { userId: 'u1', role: 'worker' as const, workshopRole: 'supervisor' as const, isAssignee: false };
const workerAssignee = { userId: 'u2', role: 'worker' as const, workshopRole: 'worker' as const, isAssignee: true };
const workerOther = { userId: 'u3', role: 'worker' as const, workshopRole: 'worker' as const, isAssignee: false };
const superAdmin = { userId: 'u9', role: 'super_admin' as const, workshopRole: null, isAssignee: false };
const task = { id: 't1', status: 'scheduled' as const, assigneeId: 'u2' };

describe('RBAC — worker can never approve or schedule', () => {
  it('worker assignee cannot approve/begin_review/return/schedule/cancel/reschedule/create', () => {
    for (const action of ['approve', 'begin_review', 'return', 'schedule', 'cancel', 'reschedule', 'create', 'update'] as const) {
      expect(canPerformTaskAction(workerAssignee, action, task)).toBe(false);
    }
  });
  it('worker assignee can start, set progress, report done, comment, attach', () => {
    for (const action of ['start', 'set_progress', 'report_done', 'comment', 'attach'] as const) {
      expect(canPerformTaskAction(workerAssignee, action, task)).toBe(true);
    }
  });
  it('another worker cannot touch the task', () => {
    expect(canPerformTaskAction(workerOther, 'start', task)).toBe(false);
    expect(canPerformTaskAction(workerOther, 'report_done', task)).toBe(false);
  });
  it('supervisor can manage but never report_done', () => {
    expect(canPerformTaskAction(supervisor, 'report_done', task)).toBe(false);
    expect(canPerformTaskAction(supervisor, 'approve', task)).toBe(true);
    expect(canPerformTaskAction(supervisor, 'begin_review', task)).toBe(true);
    expect(canPerformTaskAction(supervisor, 'return', task)).toBe(true);
  });
  it('super admin inherits supervisor powers', () => {
    expect(canPerformTaskAction(superAdmin, 'approve', task)).toBe(true);
    expect(canPerformTaskAction(superAdmin, 'report_done', task)).toBe(false);
  });
  it('structural safety: no transition available to a worker leads to approved states', () => {
    expect(() => assertWorkerSafety()).not.toThrow();
    for (const t of TRANSITIONS) {
      if (t.to === 'completed_approved' || t.to === 'awaiting_supervisor_review') {
        expect(t.actor).toBe('supervisor');
      }
    }
  });
});

describe('state machine transitions', () => {
  const base = { assigneeId: 'u2' };
  it('draft -> scheduled requires dates and assignee', () => {
    expect(() => resolveTransition('draft', 'schedule', {})).toThrow(TaskTransitionError);
    const r = resolveTransition('draft', 'schedule', { plannedStart: new Date('2026-01-01T08:00:00Z'), plannedEnd: new Date('2026-01-01T10:00:00Z'), ...base });
    expect(r.to).toBe('scheduled');
  });
  it('end before start is rejected', () => {
    expect(() => resolveTransition('draft', 'schedule', { plannedStart: new Date('2026-01-01T10:00:00Z'), plannedEnd: new Date('2026-01-01T08:00:00Z'), ...base })).toThrow(TaskTransitionError);
  });
  it('scheduled -> in_progress sets actualStart', () => {
    const r = resolveTransition('scheduled', 'start', {});
    expect(r.to).toBe('in_progress');
    expect(r.patch.actualStart).toBeInstanceOf(Date);
    expect(r.patch.progress).toBeGreaterThan(0);
  });
  it('in_progress -> worker_reported_done stamps reportedAt and 100%', () => {
    const r = resolveTransition('in_progress', 'report_done', {});
    expect(r.to).toBe('worker_reported_done');
    expect(r.patch.reportedAt).toBeInstanceOf(Date);
    expect(r.patch.progress).toBe(100);
  });
  it('approve requires nothing extra; return requires reason', () => {
    const r = resolveTransition('worker_reported_done', 'approve', { rating: 4, comment: 'good' });
    expect(r.to).toBe('completed_approved');
    expect(r.patch.approvedAt).toBeInstanceOf(Date);
    expect(() => resolveTransition('worker_reported_done', 'return', {})).toThrow(TaskTransitionError);
    const ret = resolveTransition('worker_reported_done', 'return', { reason: 'bad weld' });
    expect(ret.to).toBe('in_progress');
  });
  it('worker cannot report from scheduled (no rule)', () => {
    expect(() => resolveTransition('scheduled', 'report_done', {})).toThrow(TaskTransitionError);
  });
  it('terminal statuses have no transitions except cancelled reschedule', () => {
    expect(isTerminal('completed_approved')).toBe(true);
    expect(() => resolveTransition('completed_approved', 'approve', {})).toThrow(TaskTransitionError);
    const re = resolveTransition('cancelled', 'reschedule', { plannedStart: new Date(), plannedEnd: new Date(Date.now() + 3600e3), ...base });
    expect(re.to).toBe('scheduled');
  });
  it('overdue patch keeps previousStatus', () => {
    expect(overduePatch('scheduled')).toMatchObject({ status: 'overdue', previousStatus: 'scheduled' });
    expect(ACTIVE_STATUSES).toContain('overdue');
  });
});

describe('durations', () => {
  it('planned duration computed from planned dates', () => {
    expect(plannedDurationMs(new Date('2026-01-01T08:00:00Z'), new Date('2026-01-01T09:30:00Z'))).toBe(90 * 60_000);
    expect(plannedDurationMs(null, new Date())).toBeNull();
    expect(plannedDurationMs(new Date('2026-01-01T09:00:00Z'), new Date('2026-01-01T08:00:00Z'))).toBeNull();
  });
  it('actual duration uses actualStart -> approvedAt (fallback reportedAt)', () => {
    const start = new Date('2026-01-01T08:00:00Z');
    const reported = new Date('2026-01-01T09:00:00Z');
    const approved = new Date('2026-01-01T09:20:00Z');
    expect(actualDurationMs(start, reported, approved)).toBe(80 * 60_000);
    expect(actualDurationMs(start, reported, null)).toBe(60 * 60_000);
    expect(actualDurationMs(null, reported, approved)).toBeNull();
    expect(actualDurationMs(start, null, null)).toBeNull();
  });
  it('isPastDue only for active statuses past planned end', () => {
    const past = new Date(Date.now() - 1000);
    expect(isPastDue(past, 'scheduled')).toBe(true);
    expect(isPastDue(past, 'in_progress')).toBe(true);
    expect(isPastDue(past, 'completed_approved')).toBe(false);
    expect(isPastDue(null, 'scheduled')).toBe(false);
  });
  it('splitDuration formats', () => {
    expect(splitDuration(90 * 60_000)).toEqual({ days: 0, hours: 1, minutes: 30 });
    expect(splitDuration(26 * 3600_000)).toEqual({ days: 1, hours: 2, minutes: 0 });
    expect(splitDuration(null)).toBeNull();
  });
});

describe('validation schemas', () => {
  it('password policy is relaxed: only length matters', () => {
    expect(passwordSchema().safeParse('short').success).toBe(false);
    expect(passwordSchema().safeParse('onlypassword').success).toBe(true);
    expect(passwordSchema().safeParse('12345678').success).toBe(true);
    expect(passwordSchema().safeParse('abc123').success).toBe(true);
  });
  it('register requires valid email', () => {
    expect(registerSchema.safeParse({ name: 'Amine', email: 'nope', password: 'goodpass123', inviteCode: 'ABCD-1234', recoveryPhrase: 'blue horse battery' }).success).toBe(false);
    const ok = registerSchema.safeParse({ name: 'Amine', email: 'A@B.co', password: 'goodpass123', inviteCode: 'ABCD-1234', recoveryPhrase: 'blue horse battery' });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.email).toBe('a@b.co');
    const noCode = registerSchema.safeParse({ name: 'Amine', email: 'A@B.co', password: 'goodpass123', recoveryPhrase: 'blue horse battery' });
    expect(noCode.success).toBe(false);
  });
  it('create task: publish requires dates+assignee', () => {
    const bad = createTaskSchema.safeParse({ title: 'abc', description: 'x', publish: true });
    expect(bad.success).toBe(false);
    // dates must be in the future — realistic scheduling
    const future = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
    const good = createTaskSchema.safeParse({
      title: 'abc', description: 'x', publish: true,
      assigneeId: 'u2',
      plannedStart: future(24), plannedEnd: future(26),
    });
    expect(good.success).toBe(true);
    const past = createTaskSchema.safeParse({
      title: 'abc', description: 'x', publish: true,
      assigneeId: 'u2',
      plannedStart: '2026-03-01T08:00:00Z', plannedEnd: '2026-03-01T10:00:00Z',
    });
    expect(past.success).toBe(false);
  });
  it('schedule rejects inverted dates', () => {
    expect(scheduleSchema.safeParse({ plannedStart: '2026-03-01T10:00:00Z', plannedEnd: '2026-03-01T08:00:00Z', assigneeId: 'u2' }).success).toBe(false);
  });
  it('schedule rejects a start time in the past', () => {
    const future = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
    expect(scheduleSchema.safeParse({ plannedStart: future(24), plannedEnd: future(26), assigneeId: 'u2' }).success).toBe(true);
    expect(scheduleSchema.safeParse({ plannedStart: '2026-03-01T08:00:00Z', plannedEnd: future(26), assigneeId: 'u2' }).success).toBe(false);
  });
  it('approve enforces rating range', () => {
    expect(approveSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(approveSchema.safeParse({ rating: 5 }).success).toBe(true);
  });
  it('return requires min 3 chars reason', () => {
    expect(returnTaskSchema.safeParse({ reason: 'no' }).success).toBe(false);
    expect(returnTaskSchema.safeParse({ reason: 'bad weld seam' }).success).toBe(true);
  });
  it('task query clamps defaults', () => {
    const q = taskQuerySchema.parse({});
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(20);
    const q2 = taskQuerySchema.parse({ page: '5', pageSize: '50' });
    expect(q2.page).toBe(5);
    expect(q2.pageSize).toBe(50);
  });
});
