import { Types } from 'mongoose';
import { Task, ITask } from '../db/models/Task';
import { User } from '../db/models/User';
import { Workshop } from '../db/models/Workshop';
import { ApiError } from '../middleware/errors';
import {
  canPerformTaskAction,
  resolveTransition,
  TaskActor,
  TaskAction,
  TaskDeliveryAction,
  RequestDeliveryInput,
  TaskSnapshot,
  TaskStatus,
  plannedDurationMs,
  actualDurationMs,
  ACTIVE_STATUSES,
} from '@ats/shared';
import { notifyUser, notifyWorkshopSupervisors, notifyWorkshopRole } from './notifications';
import { deleteTaskAttachments } from './attachments';
import { audit } from './audit';
import { Request } from 'express';
import { formatDateTimeParam } from '../utils/format';

function actorFrom(req: Request, task: { assigneeId: Types.ObjectId | null }, role: TaskActor['role'], workshopRole: TaskActor['workshopRole']): TaskActor {
  const userId = req.auth!.userId;
  return {
    userId,
    role,
    workshopRole,
    isAssignee: Boolean(task.assigneeId && task.assigneeId.toString() === userId),
  };
}

export function serializeTask(task: ITask & { _doc?: unknown }, extra?: { workshopName?: string; assigneeName?: string | null; createdByName?: string }) {
  const doc = task.toObject ? task.toObject({ virtuals: false }) : task;
  return {
    id: (doc as ITask)._id.toString(),
    workshopId: (doc as ITask).workshopId.toString(),
    workshopName: extra?.workshopName,
    title: (doc as ITask).title,
    description: (doc as ITask).description,
    assigneeId: (doc as ITask).assigneeId ? (doc as ITask).assigneeId!.toString() : null,
    assigneeName: extra?.assigneeName ?? null,
    createdById: (doc as ITask).createdById.toString(),
    createdByName: extra?.createdByName,
    status: (doc as ITask).status,
    previousStatus: (doc as ITask).previousStatus ?? null,
    priority: (doc as ITask).priority,
    progress: (doc as ITask).progress,
    plannedStart: (doc as ITask).plannedStart?.toISOString() ?? null,
    plannedEnd: (doc as ITask).plannedEnd?.toISOString() ?? null,
    actualStart: (doc as ITask).actualStart?.toISOString() ?? null,
    reportedAt: (doc as ITask).reportedAt?.toISOString() ?? null,
    reviewStartedAt: (doc as ITask).reviewStartedAt?.toISOString() ?? null,
    approvedAt: (doc as ITask).approvedAt?.toISOString() ?? null,
    plannedDurationMs: (doc as ITask).plannedDurationMs ?? null,
    actualDurationMs: (doc as ITask).actualDurationMs ?? null,
    location: (doc as ITask).location,
    safetyNotes: (doc as ITask).safetyNotes,
    attachments: (doc as ITask).attachments.map((a) => ({
      ...a,
      uploadedAt: a.uploadedAt,
    })),
    supervisorComment: (doc as ITask).supervisorComment,
    supervisorRating: (doc as ITask).supervisorRating ?? null,
    returnReason: (doc as ITask).returnReason,
    changeLog: (doc as ITask).changeLog.map((c) => ({ ...c, at: c.at })),
    delivery: (doc as ITask).delivery
      ? {
          status: (doc as ITask).delivery!.status,
          customerName: (doc as ITask).delivery!.customerName,
          customerPhone: (doc as ITask).delivery!.customerPhone,
          address: (doc as ITask).delivery!.address,
          fee: (doc as ITask).delivery!.fee,
          workerId: (doc as ITask).delivery!.workerId ? (doc as ITask).delivery!.workerId!.toString() : null,
          workerName: (doc as ITask).delivery!.workerName ?? null,
          requestedAt: (doc as ITask).delivery!.requestedAt,
          deliveredAt: (doc as ITask).delivery!.deliveredAt ?? null,
        }
      : null,
    createdAt: (doc as ITask).createdAt.toISOString(),
    updatedAt: (doc as ITask).updatedAt.toISOString(),
  };
}

async function hydrateTasks(tasks: ITask[]): Promise<ReturnType<typeof serializeTask>[]> {
  if (tasks.length === 0) return [];
  const userIds = new Set<string>();
  const workshopIds = new Set<string>();
  for (const t of tasks) {
    if (t.assigneeId) userIds.add(t.assigneeId.toString());
    userIds.add(t.createdById.toString());
    workshopIds.add(t.workshopId.toString());
  }
  const [users, workshops] = await Promise.all([
    User.find({ _id: { $in: [...userIds].map((id) => new Types.ObjectId(id)) } }).select('name').lean(),
    Workshop.find({ _id: { $in: [...workshopIds].map((id) => new Types.ObjectId(id)) } }).select('name').lean(),
  ]);
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));
  const wsById = new Map(workshops.map((w) => [w._id.toString(), w.name]));
  return tasks.map((t) =>
    serializeTask(t, {
      workshopName: wsById.get(t.workshopId.toString()),
      assigneeName: t.assigneeId ? nameById.get(t.assigneeId.toString()) ?? null : null,
      createdByName: nameById.get(t.createdById.toString()),
    }),
  );
}

async function loadScopedTask(taskId: string, req: Request): Promise<{ task: ITask; actor: TaskActor }> {
  if (!Types.ObjectId.isValid(taskId)) throw new ApiError(404, 'errors.taskNotFound');
  const userId = req.auth!.userId;
  const role = req.auth!.role;

  if (role === 'super_admin') {
    const task = await Task.findById(taskId);
    if (!task) throw new ApiError(404, 'errors.taskNotFound');
    return { task, actor: { userId, role: 'super_admin', workshopRole: null, isAssignee: task.assigneeId?.toString() === userId } };
  }
  const { Membership } = await import('../db/models/Membership');
  const membership = await Membership
    .findOne({ workshopId: (await Task.findById(taskId).select('workshopId'))?.workshopId, userId, status: 'active' })
    .lean();
  const task = await Task.findById(taskId);
  if (!task || !membership) throw new ApiError(404, 'errors.taskNotFound');
  return {
    task,
    actor: actorFrom(req, task, role, membership.role as TaskActor['workshopRole']),
  };
}

async function addChangeLog(
  task: ITask,
  req: Request,
  action: TaskAction | TaskDeliveryAction,
  opts: { from?: TaskStatus | null; to?: TaskStatus | null; field?: string; note?: string } = {},
): Promise<void> {
  task.changeLog.push({
    at: new Date().toISOString(),
    byUserId: req.auth!.userId,
    byName: req.user?.name ?? '',
    action,
    from: opts.from ?? null,
    to: opts.to ?? null,
    field: opts.field,
    note: opts.note,
  });
}

async function setDurations(task: ITask): Promise<void> {
  task.plannedDurationMs = plannedDurationMs(task.plannedStart, task.plannedEnd);
  task.actualDurationMs = actualDurationMs(task.actualStart, task.reportedAt, task.approvedAt);
}

function snapshotOf(task: ITask): TaskSnapshot {
  return {
    id: task._id.toString(),
    status: task.status,
    assigneeId: task.assigneeId ? task.assigneeId.toString() : null,
  };
}

// ---------- Operations ----------

/** Supervisor / platform manager sends an approved task to the workshop
 * delivery workers with the customer details (name, phone, address, fee).
 * The requester shown everywhere is the WORKSHOP (owner of the task), not the
 * individual who pressed the button. When input.deliveryWorkerId targets one
 * delivery worker, only that worker is notified/offered; otherwise every
 * delivery worker of the workshop receives the live offer. */
export async function requestDelivery(req: Request, taskId: string, input: RequestDeliveryInput): Promise<ReturnType<typeof serializeTask>> {
  const { task, actor } = await loadScopedTask(taskId, req);
  if (actor.role !== 'super_admin' && actor.workshopRole !== 'supervisor') throw new ApiError(403, 'errors.forbidden');
  if (task.status !== 'completed_approved') throw new ApiError(409, 'errors.deliveryNotAllowed');
  if (task.delivery) throw new ApiError(409, 'errors.deliveryAlreadyRequested');

  const workshopId = task.workshopId.toString();
  const workshop = await Workshop.findById(task.workshopId).select('name').lean();
  const workshopName = workshop?.name ?? '';

  // Optional direct targeting: the chosen account must be an ACTIVE delivery
  // worker of THIS workshop.
  let targetedId: string | null = null;
  if (input.deliveryWorkerId) {
    if (!Types.ObjectId.isValid(input.deliveryWorkerId)) throw new ApiError(400, 'errors.memberNotFound');
    const { Membership } = await import('../db/models/Membership');
    const target = await Membership.findOne({
      workshopId: task.workshopId,
      userId: new Types.ObjectId(input.deliveryWorkerId),
      role: 'delivery_worker',
      status: 'active',
    }).lean();
    if (!target) throw new ApiError(400, 'errors.deliveryWorkerInvalid');
    targetedId = input.deliveryWorkerId;
  }

  task.delivery = {
    status: 'pending',
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    address: input.deliveryAddress,
    fee: input.deliveryFee,
    workerId: null,
    workerName: null,
    requestedAt: new Date().toISOString(),
    deliveredAt: null,
  };
  await addChangeLog(task, req, 'delivery_requested', { note: `${input.customerName}|${input.deliveryFee}` });
  await task.save();

  const notifyOne = async (userId: string): Promise<void> => {
    await notifyUser({
      type: 'delivery_ready',
      params: {
        taskTitle: task.title,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        address: input.deliveryAddress,
        fee: String(input.deliveryFee),
        requester: workshopName,
      },
      link: `/tasks/${task._id.toString()}`,
      workshopId,
      dedupKey: `delivery-ready:${task._id.toString()}`,
      userId,
    });
    const { emitToUser } = await import('../realtime/socket');
    emitToUser(userId, 'delivery_offer', {
      taskId: task._id.toString(),
      taskTitle: task.title,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      address: input.deliveryAddress,
      fee: input.deliveryFee,
      workshopName,
    });
  };

  if (targetedId) {
    await notifyOne(targetedId);
  } else {
    const { Membership } = await import('../db/models/Membership');
    const deliveryWorkers = await Membership
      .find({ workshopId: task.workshopId, role: 'delivery_worker', status: 'active' })
      .select('userId')
      .lean();
    await Promise.all(deliveryWorkers.map((w) => notifyOne(w.userId.toString())));
  }
  await audit(req, 'task.delivery_requested', { workshopId, targetType: 'task', targetId: task._id.toString(), meta: { targeted: targetedId ?? 'all' } });
  return serializeTask(task);
}

/** Delivery worker claims a pending delivery for their workshop. */
export async function acceptDelivery(req: Request, taskId: string): Promise<ReturnType<typeof serializeTask>> {
  const { task, actor } = await loadScopedTask(taskId, req);
  if (actor.workshopRole !== 'delivery_worker') throw new ApiError(403, 'errors.forbidden');
  if (!task.delivery || task.delivery.status !== 'pending') throw new ApiError(409, 'errors.deliveryInvalidState');

  task.delivery.status = 'accepted';
  task.delivery.workerId = req.auth!.userId; // mongoose casts to ObjectId on save
  task.delivery.workerName = req.user?.name ?? '';
  await addChangeLog(task, req, 'delivery_accepted');
  await task.save();

  await notifyWorkshopRole(task.workshopId.toString(), 'supervisor', {
    type: 'delivery_accepted',
    params: { taskTitle: task.title, worker: req.user?.name ?? '' },
    link: `/tasks/${task._id.toString()}`,
    workshopId: task.workshopId.toString(),
    dedupKey: `delivery-accepted:${task._id.toString()}`,
  });
  await audit(req, 'task.delivery_accepted', { workshopId: task.workshopId.toString(), targetType: 'task', targetId: task._id.toString() });
  return serializeTask(task);
}

/** Delivery worker (the one who claimed it) marks the delivery as completed. */
export async function completeDelivery(req: Request, taskId: string): Promise<ReturnType<typeof serializeTask>> {
  const { task, actor } = await loadScopedTask(taskId, req);
  if (actor.workshopRole !== 'delivery_worker') throw new ApiError(403, 'errors.forbidden');
  if (!task.delivery || task.delivery.status !== 'accepted') throw new ApiError(409, 'errors.deliveryInvalidState');
  if (task.delivery.workerId?.toString() !== req.auth!.userId) throw new ApiError(403, 'errors.forbidden');

  task.delivery.status = 'delivered';
  task.delivery.deliveredAt = new Date().toISOString();
  await addChangeLog(task, req, 'delivery_done');
  await task.save();

  await notifyWorkshopRole(task.workshopId.toString(), 'supervisor', {
    type: 'delivery_done',
    params: { taskTitle: task.title, worker: req.user?.name ?? '' },
    link: `/tasks/${task._id.toString()}`,
    workshopId: task.workshopId.toString(),
    dedupKey: `delivery-done:${task._id.toString()}`,
  });
  await audit(req, 'task.delivery_done', { workshopId: task.workshopId.toString(), targetType: 'task', targetId: task._id.toString() });
  return serializeTask(task);
}

/** Hard-delete a task and everything tied to it: GridFS attachment files,
 * notifications pointing at the task, and the task document itself. The audit
 * trail keeps a 'task.delete' entry (it lives outside the task document).
 * Allowed to supervisors of the workshop and the platform manager. */
export async function deleteTask(req: Request, taskId: string): Promise<{ ok: true }> {
  const { task, actor } = await loadScopedTask(taskId, req);
  if (!canPerformTaskAction(actor, 'cancel', snapshotOf(task))) {
    throw new ApiError(403, 'errors.forbidden');
  }

  // 1. GridFS attachment files (they are not documents — must go explicitly).
  await deleteTaskAttachments(task);
  // 2. Notifications referencing the task (per-recipient copies).
  const { AppNotificationDoc } = await import('../db/models/Notification');
  await AppNotificationDoc.deleteMany({ taskId: task._id });
  // 3. The task document itself (change log, comments, attachments metadata).
  await task.deleteOne();

  await audit(req, 'task.delete', {
    workshopId: task.workshopId.toString(),
    targetType: 'task',
    targetId: task._id.toString(),
  });
  return { ok: true };
}

export async function createTask(
  req: Request,
  workshopId: string,
  input: {
    title: string; description: string; assigneeId?: string; priority: 'low' | 'medium' | 'high' | 'urgent';
    location: string; safetyNotes: string; plannedStart?: Date | null; plannedEnd?: Date | null; publish: boolean;
  },
): Promise<ReturnType<typeof serializeTask>> {
  if (!Types.ObjectId.isValid(workshopId)) throw new ApiError(404, 'errors.notFound');
  const workshop = await Workshop.findById(workshopId).select('name status').lean();
  if (!workshop) throw new ApiError(404, 'errors.notFound');
  const workshopIdObj = new Types.ObjectId(workshopId);
  const { Membership } = await import('../db/models/Membership');
  let role: 'worker' | 'supervisor' | null = null;
  if (req.auth!.role === 'super_admin') {
    role = null;
  } else {
    const membership = await Membership
      .findOne({ workshopId: new Types.ObjectId(workshopId), userId: new Types.ObjectId(req.auth!.userId), status: 'active' })
      .lean();
    if (!membership) throw new ApiError(403, 'errors.notMember');
    role = membership.role as 'worker' | 'supervisor';
    if (role !== 'supervisor') throw new ApiError(403, 'errors.forbidden');
    if (workshop.status === 'suspended') throw new ApiError(403, 'errors.workshopSuspended');
  }

  // The assignee must be an ACTIVE member of THIS workshop — never guessed from input.
  let assigneeId: Types.ObjectId | null = null;
  let assigneeDoc: { _id: Types.ObjectId; name: string; preferredLanguage: string } | null = null;
  if (input.assigneeId) {
    const membership = await Membership
      .findOne({ workshopId: workshopIdObj, userId: new Types.ObjectId(input.assigneeId), status: 'active' })
      .lean();
    if (!membership) throw new ApiError(400, 'errors.assigneeRequired');
    assigneeId = new Types.ObjectId(input.assigneeId);
    assigneeDoc = await User.findById(assigneeId).select('name preferredLanguage').lean();
  }

  const now = new Date();
  const status: TaskStatus = input.publish ? 'scheduled' : 'draft';
  const task = await Task.create({
    workshopId: workshopIdObj,
    title: input.title,
    description: input.description,
    assigneeId,
    createdById: new Types.ObjectId(req.auth!.userId),
    status,
    previousStatus: null,
    priority: input.priority,
    progress: 0,
    plannedStart: input.publish ? input.plannedStart! : input.plannedStart ?? null,
    plannedEnd: input.publish ? input.plannedEnd! : input.plannedEnd ?? null,
    location: input.location,
    safetyNotes: input.safetyNotes,
    changeLog: [{
      at: now.toISOString(),
      byUserId: req.auth!.userId,
      byName: req.user?.name ?? '',
      action: input.publish ? 'schedule' : 'create',
      to: status,
    }],
  });
  await setDurations(task);
  await task.save();

  await audit(req, input.publish ? 'task.create' : 'task.create_draft', {
    workshopId: workshopIdObj.toString(),
    targetType: 'task',
    targetId: task._id.toString(),
  });

  if (status === 'scheduled' && assigneeId && assigneeDoc) {
    await notifyUser({
      userId: assigneeDoc._id.toString(),
      type: 'task_assigned',
      params: {
        title: task.title,
        creator: req.user?.name ?? '',
        start: formatDateTimeParam(task.plannedStart, assigneeDoc.preferredLanguage),
      },
      link: `/tasks/${task._id}`,
      taskId: task._id.toString(),
      workshopId: workshopIdObj.toString(),
      dedupKey: `assigned:${task._id}`,
    });
  }
  return serializeTask(task, { workshopName: workshop.name, assigneeName: assigneeDoc?.name ?? null, createdByName: req.user?.name });
}

export async function updateTaskDetails(
  req: Request,
  taskId: string,
  input: { title?: string; description?: string; priority?: 'low' | 'medium' | 'high' | 'urgent'; location?: string; safetyNotes?: string; assigneeId?: string },
): Promise<ReturnType<typeof serializeTask>> {
  const { task, actor } = await loadScopedTask(taskId, req);
  if (!canPerformTaskAction(actor, 'update', snapshotOf(task))) throw new ApiError(403, 'errors.forbidden');
  if (['completed_approved', 'cancelled'].includes(task.status)) throw new ApiError(400, 'errors.invalidTransition');

  const before = { assigneeId: task.assigneeId?.toString() ?? null, title: task.title };
  if (input.title !== undefined) task.title = input.title;
  if (input.description !== undefined) task.description = input.description;
  if (input.priority !== undefined) task.priority = input.priority;
  if (input.location !== undefined) task.location = input.location;
  if (input.safetyNotes !== undefined) task.safetyNotes = input.safetyNotes;

  let newAssignee: { _id: Types.ObjectId; name: string; preferredLanguage: string } | null = null;
  if (input.assigneeId && input.assigneeId !== before.assigneeId) {
    const { Membership } = await import('../db/models/Membership');
    const membership = await Membership
      .findOne({ workshopId: task.workshopId, userId: new Types.ObjectId(input.assigneeId), status: 'active' })
      .lean();
    if (!membership) throw new ApiError(400, 'errors.assigneeRequired');
    task.assigneeId = new Types.ObjectId(input.assigneeId);
    newAssignee = await User.findById(task.assigneeId).select('name preferredLanguage').lean();
  }

  await addChangeLog(task, req, 'update', { note: 'details' });
  await setDurations(task);
  await task.save();
  await audit(req, 'task.update', { workshopId: task.workshopId.toString(), targetType: 'task', targetId: task._id.toString() });

  // Notify the (possibly new) assignee about the update.
  const assigneeId = task.assigneeId?.toString();
  if (assigneeId && assigneeId !== req.auth!.userId) {
    const lang = newAssignee?.preferredLanguage ?? 'ar';
    await notifyUser({
      userId: assigneeId,
      type: newAssignee ? 'task_assigned' : 'task_updated',
      params: {
        title: task.title,
        creator: req.user?.name ?? '',
        start: formatDateTimeParam(task.plannedStart, lang),
      },
      link: `/tasks/${task._id}`,
      taskId: task._id.toString(),
      workshopId: task.workshopId.toString(),
      dedupKey: newAssignee ? `assigned:${task._id}` : `updated:${task._id}:${Date.now()}`,
    });
  }
  return serializeTask(task);
}

export async function scheduleTask(req: Request, taskId: string, input: { plannedStart: Date; plannedEnd: Date; assigneeId: string }, reschedule: boolean): Promise<ReturnType<typeof serializeTask>> {
  const { task, actor } = await loadScopedTask(taskId, req);
  const action: TaskAction = reschedule ? 'reschedule' : 'schedule';
  if (!canPerformTaskAction(actor, action, snapshotOf(task))) throw new ApiError(403, 'errors.forbidden');

  const { Membership } = await import('../db/models/Membership');
  const membership = await Membership
    .findOne({ workshopId: task.workshopId, userId: new Types.ObjectId(input.assigneeId), status: 'active' })
    .lean();
  if (!membership) throw new ApiError(400, 'errors.assigneeRequired');

  const result = resolveTransition(task.status, action, {
    plannedStart: input.plannedStart,
    plannedEnd: input.plannedEnd,
    assigneeId: input.assigneeId,
    now: new Date(),
  });
  Object.assign(task, result.patch);
  task.assigneeId = new Types.ObjectId(input.assigneeId);
  await addChangeLog(task, req, action, { from: task.previousStatus, to: 'scheduled' });
  await setDurations(task);
  await task.save();
  await audit(req, reschedule ? 'task.reschedule' : 'task.schedule', { workshopId: task.workshopId.toString(), targetType: 'task', targetId: task._id.toString() });

  const assignee = await User.findById(task.assigneeId).select('preferredLanguage name').lean();
  if (assignee && assignee._id.toString() !== req.auth!.userId) {
    await notifyUser({
      userId: assignee._id.toString(),
      type: reschedule ? 'task_rescheduled' : 'task_assigned',
      params: {
        title: task.title,
        creator: req.user?.name ?? '',
        worker: assignee.name,
        start: formatDateTimeParam(task.plannedStart, assignee.preferredLanguage),
        reason: task.returnReason,
      },
      link: `/tasks/${task._id}`,
      taskId: task._id.toString(),
      workshopId: task.workshopId.toString(),
      dedupKey: `${action}:${task._id}:${input.plannedStart.getTime()}`,
    });
  }
  return serializeTask(task);
}

export async function assignTask(req: Request, taskId: string, input: { assigneeId: string }): Promise<ReturnType<typeof serializeTask>> {
  const { task, actor } = await loadScopedTask(taskId, req);
  // Reassignment is a supervisor management action, allowed while the work has
  // not started yet (draft / scheduled) — never once execution is under way.
  if (!canPerformTaskAction(actor, 'update', snapshotOf(task))) throw new ApiError(403, 'errors.forbidden');
  if (task.status !== 'draft' && task.status !== 'scheduled') throw new ApiError(400, 'errors.invalidTransition');

  const { Membership } = await import('../db/models/Membership');
  const membership = await Membership
    .findOne({ workshopId: task.workshopId, userId: new Types.ObjectId(input.assigneeId), status: 'active' })
    .lean();
  if (!membership) throw new ApiError(400, 'errors.assigneeRequired');

  const previousAssigneeId = task.assigneeId?.toString() ?? null;
  task.assigneeId = new Types.ObjectId(input.assigneeId);
  const assignee = await User.findById(task.assigneeId).select('name preferredLanguage').lean();
  await addChangeLog(task, req, 'update', { field: 'assigneeId', note: assignee?.name ?? '' });
  await setDurations(task);
  await task.save();
  await audit(req, 'task.assign', { workshopId: task.workshopId.toString(), targetType: 'task', targetId: task._id.toString() });

  if (assignee && input.assigneeId !== previousAssigneeId && assignee._id.toString() !== req.auth!.userId) {
    await notifyUser({
      userId: assignee._id.toString(),
      type: 'task_assigned',
      params: {
        title: task.title,
        creator: req.user?.name ?? '',
        worker: assignee.name,
        start: formatDateTimeParam(task.plannedStart, assignee.preferredLanguage),
        reason: task.returnReason,
      },
      link: `/tasks/${task._id}`,
      taskId: task._id.toString(),
      workshopId: task.workshopId.toString(),
      dedupKey: `assign:${task._id}:${input.assigneeId}`,
    });
  }
  return serializeTask(task);
}

export async function startTask(req: Request, taskId: string): Promise<ReturnType<typeof serializeTask>> {
  const { task, actor } = await loadScopedTask(taskId, req);
  if (!canPerformTaskAction(actor, 'start', snapshotOf(task))) throw new ApiError(403, 'errors.forbidden');
  const result = resolveTransition(task.status, 'start', { actualStart: task.actualStart, now: new Date() });
  Object.assign(task, result.patch);
  if (!task.actualStart) task.actualStart = result.patch.actualStart!;
  await addChangeLog(task, req, 'start', { from: task.previousStatus ?? task.status, to: 'in_progress' });
  await setDurations(task);
  await task.save();
  return serializeTask(task);
}

export async function setProgress(req: Request, taskId: string, progress: number): Promise<ReturnType<typeof serializeTask>> {
  const { task, actor } = await loadScopedTask(taskId, req);
  if (!canPerformTaskAction(actor, 'set_progress', snapshotOf(task))) throw new ApiError(403, 'errors.forbidden');
  if (!['scheduled', 'in_progress', 'overdue'].includes(task.status)) throw new ApiError(400, 'errors.invalidTransition');
  task.progress = progress;
  await addChangeLog(task, req, 'set_progress', { field: 'progress', note: String(progress) });
  await task.save();
  return serializeTask(task);
}

export async function reportDone(req: Request, taskId: string, note?: string): Promise<ReturnType<typeof serializeTask>> {
  const { task, actor } = await loadScopedTask(taskId, req);
  if (!canPerformTaskAction(actor, 'report_done', snapshotOf(task))) throw new ApiError(403, 'errors.forbidden');
  const result = resolveTransition(task.status, 'report_done', { now: new Date() });
  Object.assign(task, result.patch);
  await addChangeLog(task, req, 'report_done', {
    from: task.previousStatus ?? task.status,
    to: 'worker_reported_done',
    note: note ?? undefined,
  });
  await setDurations(task);
  await task.save();
  await audit(req, 'task.report_done', { workshopId: task.workshopId.toString(), targetType: 'task', targetId: task._id.toString() });

  await notifyWorkshopSupervisors(task.workshopId.toString(), {
    type: 'task_reported',
    params: { title: task.title, worker: req.user?.name ?? '' },
    link: `/tasks/${task._id}`,
    taskId: task._id.toString(),
    workshopId: task.workshopId.toString(),
    dedupKey: `reported:${task._id}`,
  });
  return serializeTask(task);
}

export async function beginReview(req: Request, taskId: string): Promise<ReturnType<typeof serializeTask>> {
  const { task, actor } = await loadScopedTask(taskId, req);
  if (!canPerformTaskAction(actor, 'begin_review', snapshotOf(task))) throw new ApiError(403, 'errors.forbidden');
  const result = resolveTransition(task.status, 'begin_review', { now: new Date() });
  Object.assign(task, result.patch);
  await addChangeLog(task, req, 'begin_review', { from: 'worker_reported_done', to: 'awaiting_supervisor_review' });
  await task.save();
  return serializeTask(task);
}

export async function approveTask(req: Request, taskId: string, input: { rating: number; comment: string }): Promise<ReturnType<typeof serializeTask>> {
  const { task, actor } = await loadScopedTask(taskId, req);
  if (!canPerformTaskAction(actor, 'approve', snapshotOf(task))) throw new ApiError(403, 'errors.forbidden');
  const result = resolveTransition(task.status, 'approve', { rating: input.rating, comment: input.comment, now: new Date() });
  const workerId = task.assigneeId?.toString();
  Object.assign(task, result.patch);
  task.previousStatus = null;
  await addChangeLog(task, req, 'approve', { to: 'completed_approved', note: input.comment || undefined });
  await setDurations(task);
  await task.save();
  await audit(req, 'task.approve', { workshopId: task.workshopId.toString(), targetType: 'task', targetId: task._id.toString() });

  if (workerId) {
    await notifyUser({
      userId: workerId,
      type: 'task_approved',
      params: { title: task.title, rating: String(input.rating) },
      link: `/tasks/${task._id}`,
      taskId: task._id.toString(),
      workshopId: task.workshopId.toString(),
      dedupKey: `approved:${task._id}`,
    });
  }
  return serializeTask(task);
}

export async function returnTask(req: Request, taskId: string, reason: string): Promise<ReturnType<typeof serializeTask>> {
  const { task, actor } = await loadScopedTask(taskId, req);
  if (!canPerformTaskAction(actor, 'return', snapshotOf(task))) throw new ApiError(403, 'errors.forbidden');
  const result = resolveTransition(task.status, 'return', { reason, now: new Date() });
  Object.assign(task, result.patch);
  await addChangeLog(task, req, 'return', { from: task.previousStatus ?? task.status, to: 'in_progress', note: reason });
  await task.save();
  await audit(req, 'task.return', { workshopId: task.workshopId.toString(), targetType: 'task', targetId: task._id.toString() });

  const workerId = task.assigneeId?.toString();
  if (workerId) {
    await notifyUser({
      userId: workerId,
      type: 'task_returned',
      params: { title: task.title, reason },
      link: `/tasks/${task._id}`,
      taskId: task._id.toString(),
      workshopId: task.workshopId.toString(),
      dedupKey: `returned:${task._id}:${Date.now()}`,
    });
  }
  return serializeTask(task);
}

export async function cancelTask(req: Request, taskId: string, reason?: string): Promise<ReturnType<typeof serializeTask>> {
  const { task, actor } = await loadScopedTask(taskId, req);
  if (!canPerformTaskAction(actor, 'cancel', snapshotOf(task))) throw new ApiError(403, 'errors.forbidden');
  const result = resolveTransition(task.status, 'cancel', { now: new Date() });
  Object.assign(task, result.patch);
  await addChangeLog(task, req, 'cancel', { from: task.status, to: 'cancelled', note: reason ?? undefined });
  await task.save();
  await audit(req, 'task.cancel', { workshopId: task.workshopId.toString(), targetType: 'task', targetId: task._id.toString() });

  const workerId = task.assigneeId?.toString();
  if (workerId && workerId !== req.auth!.userId) {
    await notifyUser({
      userId: workerId,
      type: 'task_cancelled',
      params: { title: task.title, reason: reason ?? '—' },
      link: `/tasks/${task._id}`,
      taskId: task._id.toString(),
      workshopId: task.workshopId.toString(),
      dedupKey: `cancelled:${task._id}`,
    });
  }
  return serializeTask(task);
}

export async function addComment(req: Request, taskId: string, text: string): Promise<ReturnType<typeof serializeTask>> {
  const { task, actor } = await loadScopedTask(taskId, req);
  if (!canPerformTaskAction(actor, 'comment', snapshotOf(task))) throw new ApiError(403, 'errors.forbidden');
  await addChangeLog(task, req, 'comment', { note: text });
  await task.save();

  const authorName = req.user?.name ?? '';
  const targets = new Set<string>();
  if (task.assigneeId) targets.add(task.assigneeId.toString());
  if (task.createdById) targets.add(task.createdById.toString());
  targets.delete(req.auth!.userId);
  for (const target of targets) {
    await notifyUser({
      userId: target,
      type: 'task_comment',
      params: { title: task.title, author: authorName, text: text.slice(0, 140) },
      link: `/tasks/${task._id}`,
      taskId: task._id.toString(),
      workshopId: task.workshopId.toString(),
    });
  }
  return serializeTask(task);
}

// ---------- Queries ----------

export async function listTasks(req: Request, q: {
  page: number; pageSize: number; status?: 'all' | TaskStatus; priority?: 'low' | 'medium' | 'high' | 'urgent';
  workerId?: string; q?: string; from?: Date; to?: Date; sort: 'newest' | 'oldest' | 'dueAsc' | 'dueDesc' | 'priority'; mine?: '1' | '0';
  workshopId?: string;
}): Promise<{ items: Awaited<ReturnType<typeof hydrateTasks>>; total: number; page: number; pageSize: number; pages: number }> {
  const userId = req.auth!.userId;
  const role = req.auth!.role;
  const { Membership } = await import('../db/models/Membership');
  const myWorkshops = await Membership.find({ userId: new Types.ObjectId(userId), status: 'active' }).select('workshopId role').lean();
  const workshopIds = myWorkshops.map((m) => m.workshopId);
  const supervisedIds = myWorkshops.filter((m) => m.role === 'supervisor').map((m) => m.workshopId);
  const deliveryIds = myWorkshops.filter((m) => m.role === 'delivery_worker').map((m) => m.workshopId);

  const filter: Record<string, unknown> = {};
  if (role === 'super_admin') {
    if (q.workshopId) filter.workshopId = new Types.ObjectId(q.workshopId);
  } else if (supervisedIds.length > 0) {
    filter.workshopId = { $in: supervisedIds };
  } else if (deliveryIds.length > 0) {
    // delivery workers see ONLY tasks sent to delivery (their workshops)
    filter.workshopId = { $in: deliveryIds };
    filter['delivery.status'] = { $in: ['pending', 'accepted', 'delivered'] };
  } else if (workshopIds.length > 0) {
    filter.workshopId = { $in: workshopIds };
    filter.assigneeId = new Types.ObjectId(userId); // workers see ONLY their own tasks
  } else {
    return { items: [], total: 0, page: q.page, pageSize: q.pageSize, pages: 0 };
  }

  if (q.mine === '1' && role !== 'super_admin') filter.assigneeId = new Types.ObjectId(userId);
  if (q.status && q.status !== 'all') filter.status = q.status;
  if (q.priority) filter.priority = q.priority;
  if (q.workerId) filter.assigneeId = new Types.ObjectId(q.workerId);
  if (q.from || q.to) {
    filter.plannedEnd = {
      ...(q.from ? { $gte: q.from } : {}),
      ...(q.to ? { $lte: q.to } : {}),
    };
  }
  if (q.q) {
    // Robust substring search across title/description/location. (MongoDB $text
    // needs a dedicated text index and only matches whole words, which made
    // short or partial queries return nothing.)
    const escaped = q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');
    filter.$or = [{ title: rx }, { description: rx }, { location: rx }];
  }

  const sort: Record<string, 1 | -1> =
    q.sort === 'newest' ? { createdAt: -1 } :
    q.sort === 'oldest' ? { createdAt: 1 } :
    q.sort === 'dueAsc' ? { plannedEnd: 1, createdAt: -1 } :
    q.sort === 'dueDesc' ? { plannedEnd: -1, createdAt: -1 } :
    { priority: -1, createdAt: -1 };

  const [tasks, total] = await Promise.all([
    Task.find(filter).sort(sort).skip((q.page - 1) * q.pageSize).limit(q.pageSize),
    Task.countDocuments(filter),
  ]);
  return {
    items: await hydrateTasks(tasks),
    total,
    page: q.page,
    pageSize: q.pageSize,
    pages: Math.ceil(total / q.pageSize),
  };
}

export async function getTask(req: Request, taskId: string): Promise<ReturnType<typeof serializeTask>> {
  const { task } = await loadScopedTask(taskId, req);
  const hydrated = await hydrateTasks([task]);
  if (!hydrated[0]) throw new ApiError(404, 'errors.taskNotFound');
  return hydrated[0];
}

export interface WorkerStatRow {
  userId: string; name: string; assigned: number; completed: number; late: number; onTime: number; avgRating: number | null;
}

/** Local midnight in the given IANA timezone, as a real UTC instant. */
function tzStartOfDay(tz: string): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  // "Wall clock midnight" interpreted as-if-UTC, minus the timezone's current
  // offset from UTC (Algiers has no DST; safe for the platform default tz).
  const wallMidnightAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'));
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const offsetMs = tzNow.getTime() - now.getTime();
  return new Date(wallMidnightAsUtc - offsetMs);
}

export async function taskStats(req: Request, workshopId?: string): Promise<{
  total: number; byStatus: Record<string, number>; overdue: number; completedThisWeek: number; createdThisWeek: number;
  completedToday: number; completedThisMonth: number; completedLast6Months: number; completedThisYear: number;
  workersCount: number; supervisorsCount: number; deliveryWorkersCount: number;
  avgCompletionMs: number | null; avgRating: number | null; pendingReviews: number; perWorker: WorkerStatRow[];
  delivery: { pending: number; accepted: number; delivered: number; myDelivered: number; myEarnings: number };
}> {
  const userId = req.auth!.userId;
  const role = req.auth!.role;
  const { Membership } = await import('../db/models/Membership');
  const myWorkshops = (await Membership.find({ userId: new Types.ObjectId(userId), status: 'active' }).select('workshopId role').lean()) as unknown as { workshopId: Types.ObjectId; role: string }[];
  let ids = myWorkshops.map((m) => m.workshopId);
  if (role === 'super_admin' && workshopId) ids = [new Types.ObjectId(workshopId)];

  // Super admin sees the whole platform: no workshop filter (unless a specific
  // workshop was requested). Staff scope to their own workshops.
  const base: Record<string, unknown> =
    role === 'super_admin' && !workshopId ? {} :
    ids.length ? { workshopId: { $in: ids } } :
    { workshopId: null };
  if (role !== 'super_admin' && myWorkshops.some((m) => m.role === 'worker')) {
    base.assigneeId = new Types.ObjectId(userId);
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  // Timezone-aware boundaries so "today / this month / this year" match the
  // user's wall clock (platform default timezone: Africa/Algiers).
  const tz = 'Africa/Algiers';
  const dayStart = tzStartOfDay(tz);
  const monthStart = new Date(dayStart); monthStart.setDate(1);
  const yearStart = new Date(monthStart); yearStart.setMonth(0);
  const sixMonthsAgo = new Date(dayStart); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); sixMonthsAgo.setDate(1);

  const approvedFilter = { ...base, status: 'completed_approved' as const };
  const [statusCounts, agg, createdWeek, pendingReviewsCount, doneToday, doneMonth, done6Months, doneYear, memberCounts] = await Promise.all([
    Task.aggregate([
      { $match: base },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Task.aggregate([
      { $match: { ...approvedFilter, approvedAt: { $gte: weekAgo } } },
      { $group: { _id: null, completed: { $sum: 1 }, avgDuration: { $avg: '$actualDurationMs' }, avgRating: { $avg: '$supervisorRating' } } },
    ]),
    Task.countDocuments({ ...base, createdAt: { $gte: weekAgo } }),
    Task.countDocuments({ ...base, status: { $in: ['worker_reported_done', 'awaiting_supervisor_review'] } }),
    Task.countDocuments({ ...approvedFilter, approvedAt: { $gte: dayStart } }),
    Task.countDocuments({ ...approvedFilter, approvedAt: { $gte: monthStart } }),
    Task.countDocuments({ ...approvedFilter, approvedAt: { $gte: sixMonthsAgo } }),
    Task.countDocuments({ ...approvedFilter, approvedAt: { $gte: yearStart } }),
    (role === 'super_admin' && !workshopId)
      ? Membership.aggregate([
          { $match: { status: 'active' } },
          { $group: { _id: '$role', count: { $sum: 1 } } },
        ]).then((rows: { _id: string; count: number }[]) => rows)
      : ids.length
        ? Membership.aggregate([
            { $match: { workshopId: { $in: ids }, status: 'active' } },
            { $group: { _id: '$role', count: { $sum: 1 } } },
          ]).then((rows: { _id: string; count: number }[]) => rows)
        : Promise.resolve([] as { _id: string; count: number }[]),
  ]);

  const byStatus: Record<string, number> = {};
  for (const s of ACTIVE_STATUSES) byStatus[s] = 0;
  byStatus['draft'] = 0; byStatus['completed_approved'] = 0; byStatus['cancelled'] = 0;
  let total = 0;
  for (const row of statusCounts) {
    byStatus[row._id as string] = row.count;
    total += row.count;
  }
  // ---- per-worker performance (supervisor/admin dashboards) ----
  const perWorkerRows = await Task.aggregate([
    { $match: { ...base, assigneeId: { $ne: null } } },
    {
      $group: {
        _id: '$assigneeId',
        assigned: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed_approved'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } },
        onTime: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'completed_approved'] }, { $ne: ['$actualDurationMs', null] }, { $ne: ['$plannedDurationMs', null] }, { $lte: ['$actualDurationMs', '$plannedDurationMs'] }] },
              1, 0,
            ],
          },
        },
        avgRating: { $avg: '$supervisorRating' },
      },
    },
    { $sort: { completed: -1 } },
    { $limit: 20 },
  ]);
  const workerIds = perWorkerRows.map((r) => r._id).filter(Boolean);
  const users = workerIds.length
    ? await User.find({ _id: { $in: workerIds } }).select('name').lean()
    : [];
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name]));
  const perWorker: WorkerStatRow[] = perWorkerRows
    .filter((r) => r._id)
    .map((r) => ({
      userId: r._id.toString(),
      name: nameById.get(r._id.toString()) ?? '—',
      assigned: r.assigned ?? 0,
      completed: r.completed ?? 0,
      late: r.late ?? 0,
      onTime: r.onTime ?? 0,
      avgRating: r.avgRating != null ? Math.round(r.avgRating * 10) / 10 : null,
    }));

  // ---- delivery statistics (delivery-worker dashboards + staff overview) ----
  const isDeliveryWorker = role !== 'super_admin' && myWorkshops.some((m) => m.role === 'delivery_worker');
  const deliveryBase: Record<string, unknown> = role === 'super_admin' && !workshopId
    ? { 'delivery.status': { $exists: true, $ne: null } }
    : { workshopId: { $in: ids }, 'delivery.status': { $exists: true, $ne: null } };
  const deliveryRows = await Task.aggregate([
    { $match: deliveryBase },
    {
      $group: {
        _id: '$delivery.status',
        count: { $sum: 1 },
        myDelivered: { $sum: { $cond: [{ $and: [{ $eq: ['$delivery.status', 'delivered'] }, { $eq: ['$delivery.workerId', new Types.ObjectId(userId)] }] }, 1, 0] } },
        myEarnings: { $sum: { $cond: [{ $and: [{ $eq: ['$delivery.status', 'delivered'] }, { $eq: ['$delivery.workerId', new Types.ObjectId(userId)] }] }, '$delivery.fee', 0] } },
      },
    },
  ]);
  const delivery = {
    pending: deliveryRows.find((r) => r._id === 'pending')?.count ?? 0,
    accepted: deliveryRows.find((r) => r._id === 'accepted')?.count ?? 0,
    delivered: deliveryRows.find((r) => r._id === 'delivered')?.count ?? 0,
    myDelivered: isDeliveryWorker ? deliveryRows.reduce((s, r) => s + (r.myDelivered ?? 0), 0) : 0,
    myEarnings: isDeliveryWorker ? deliveryRows.reduce((s, r) => s + (r.myEarnings ?? 0), 0) : 0,
  };

  return {
    total,
    byStatus,
    overdue: byStatus['overdue'] ?? 0,
    completedThisWeek: agg[0]?.completed ?? 0,
    createdThisWeek: createdWeek,
    completedToday: doneToday,
    completedThisMonth: doneMonth,
    completedLast6Months: done6Months,
    completedThisYear: doneYear,
    workersCount: memberCounts.find((r) => r._id === 'worker')?.count ?? 0,
    supervisorsCount: memberCounts.find((r) => r._id === 'supervisor')?.count ?? 0,
    deliveryWorkersCount: memberCounts.find((r) => r._id === 'delivery_worker')?.count ?? 0,
    avgCompletionMs: agg[0]?.avgDuration != null ? Math.round(agg[0].avgDuration) : null,
    avgRating: agg[0]?.avgRating != null ? Math.round(agg[0].avgRating * 10) / 10 : null,
    pendingReviews: pendingReviewsCount,
    perWorker,
    delivery,
  };
}

export { loadScopedTask, hydrateTasks };
