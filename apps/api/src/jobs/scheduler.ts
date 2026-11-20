/**
 * Background scheduler:
 *  - Marks overdue tasks (plannedEnd in the past for active statuses) and
 *    notifies worker + supervisors ONCE per overdue episode.
 *  - Sends "due soon" alerts 60 minutes before the planned end (once).
 * Runs every 60s; unref'd so it never keeps the process alive; stoppable for tests.
 */
import { Task } from '../db/models/Task';
import { overduePatch, isPastDue, DUE_SOON_WINDOW_MS } from '@ats/shared';
import { notifyUser, notifyWorkshopSupervisors } from '../services/notifications';

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function runOverdueSweep(now = new Date()): Promise<{ overdue: number; dueSoon: number }> {
  let overdue = 0;
  let dueSoon = 0;

  // ---- overdue ----
  const lateCandidates = await Task.find({
    status: { $in: ['scheduled', 'in_progress', 'worker_reported_done'] },
    plannedEnd: { $lt: now },
    overdueNotifiedAt: null,
  }).limit(200);

  for (const task of lateCandidates) {
    if (!isPastDue(task.plannedEnd, task.status, now)) continue;
    const previous = task.status as typeof task.status;
    Object.assign(task, overduePatch(previous));
    task.overdueNotifiedAt = now;
    task.changeLog.push({
      at: now.toISOString(),
      byUserId: 'system',
      byName: 'system',
      action: 'update' as const,
      from: previous,
      to: 'overdue',
      note: 'auto-overdue',
    });
    await task.save();
    overdue += 1;

    if (task.assigneeId) {
      await notifyUser({
        userId: task.assigneeId.toString(),
        type: 'task_overdue',
        params: { title: task.title },
        link: `/tasks/${task._id}`,
        taskId: task._id.toString(),
        workshopId: task.workshopId.toString(),
        dedupKey: `overdue:${task._id}`,
      });
    }
    await notifyWorkshopSupervisors(task.workshopId.toString(), {
      type: 'task_overdue',
      params: { title: task.title },
      link: `/tasks/${task._id}`,
      taskId: task._id.toString(),
      workshopId: task.workshopId.toString(),
      dedupKey: `overdue:${task._id}`,
    });
  }

  // ---- audit log weekly retention (delete entries older than 7 days) ----
  try {
    const { AuditLog } = await import('../db/models/AuditLog');
    await AuditLog.deleteMany({ createdAt: { $lt: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } });
  } catch { /* retention cleanup is best-effort */ }

  // ---- due soon ----
  const horizon = new Date(now.getTime() + DUE_SOON_WINDOW_MS);
  const soon = await Task.find({
    status: { $in: ['scheduled', 'in_progress'] },
    plannedEnd: { $gte: now, $lte: horizon },
    dueSoonNotifiedAt: null,
    assigneeId: { $ne: null },
  }).limit(200);

  for (const task of soon) {
    task.dueSoonNotifiedAt = now;
    await task.save();
    dueSoon += 1;
    const minutes = Math.max(1, Math.round((task.plannedEnd!.getTime() - now.getTime()) / 60000));
    const assignee = task.assigneeId!.toString();
    await notifyUser({
      userId: assignee,
      type: 'task_due_soon',
      params: { title: task.title, minutes: String(minutes) },
      link: `/tasks/${task._id}`,
      taskId: task._id.toString(),
      workshopId: task.workshopId.toString(),
      dedupKey: `due-soon:${task._id}`,
    });
  }
  return { overdue, dueSoon };
}

export function startScheduler(): void {
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runOverdueSweep();
    } catch (err) {
      console.error('[scheduler] sweep failed:', (err as Error).message);
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, 60_000);
  timer.unref();
  void tick();
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
