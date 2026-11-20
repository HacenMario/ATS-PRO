import type { Role, TaskAction, TaskStatus } from './types';

/**
 * Task state machine.
 *
 * Legal transitions (from -> to). Transitions marked actor 'system' are only
 * performed by the background scheduler (overdue detection) — never exposed
 * over HTTP.
 */
export interface TransitionRule {
  from: TaskStatus;
  action: TaskAction;
  to: TaskStatus;
  /** who is allowed to trigger it over HTTP */
  actor: 'assigned_worker' | 'supervisor' | 'assigned_worker_or_supervisor';
}

export const TRANSITIONS: TransitionRule[] = [
  { from: 'draft', action: 'schedule', to: 'scheduled', actor: 'supervisor' },
  { from: 'draft', action: 'cancel', to: 'cancelled', actor: 'supervisor' },
  { from: 'scheduled', action: 'start', to: 'in_progress', actor: 'assigned_worker_or_supervisor' },
  { from: 'scheduled', action: 'cancel', to: 'cancelled', actor: 'supervisor' },
  { from: 'in_progress', action: 'report_done', to: 'worker_reported_done', actor: 'assigned_worker' },
  { from: 'in_progress', action: 'cancel', to: 'cancelled', actor: 'supervisor' },
  { from: 'worker_reported_done', action: 'begin_review', to: 'awaiting_supervisor_review', actor: 'supervisor' },
  { from: 'worker_reported_done', action: 'approve', to: 'completed_approved', actor: 'supervisor' },
  { from: 'worker_reported_done', action: 'return', to: 'in_progress', actor: 'supervisor' },
  { from: 'awaiting_supervisor_review', action: 'approve', to: 'completed_approved', actor: 'supervisor' },
  { from: 'awaiting_supervisor_review', action: 'return', to: 'in_progress', actor: 'supervisor' },
  { from: 'overdue', action: 'start', to: 'in_progress', actor: 'assigned_worker_or_supervisor' },
  { from: 'overdue', action: 'report_done', to: 'worker_reported_done', actor: 'assigned_worker' },
  { from: 'overdue', action: 'reschedule', to: 'scheduled', actor: 'supervisor' },
  { from: 'overdue', action: 'cancel', to: 'cancelled', actor: 'supervisor' },
  { from: 'cancelled', action: 'reschedule', to: 'scheduled', actor: 'supervisor' },
];

/** A worker may NEVER directly move a task to the approved/completed state. */
const WORKER_FORBIDDEN_TARGETS: TaskStatus[] = ['completed_approved', 'awaiting_supervisor_review', 'scheduled'];

export interface TaskActor {
  userId: string;
  role: Role;
  /** workshop-level role if the actor is a member of the task's workshop */
  workshopRole: 'worker' | 'delivery_worker' | 'supervisor' | null;
  /** true when actor.userId === task.assigneeId */
  isAssignee: boolean;
}

export interface TaskSnapshot {
  id: string;
  status: TaskStatus;
  assigneeId: string | null;
}

export class TaskTransitionError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'TaskTransitionError';
  }
}

/** Whether the given actor may perform `action` on the given task. */
export function canPerformTaskAction(actor: TaskActor, action: TaskAction, task: TaskSnapshot): boolean {
  const isSupervisor = actor.role === 'super_admin' || actor.workshopRole === 'supervisor';

  switch (action) {
    case 'create':
    case 'update':
    case 'schedule':
    case 'reschedule':
    case 'begin_review':
    case 'approve':
    case 'return':
      return isSupervisor;
    case 'cancel':
      return isSupervisor;
    case 'start':
    case 'set_progress':
      // Any assignee can work on their task — a supervisor who takes a task is
      // a working supervisor (common in small workshops) and counts as assignee.
      return isSupervisor || actor.isAssignee;
    case 'report_done':
      // Only the ASSIGNEE reports completion. The assignee may be a worker or
      // a supervising worker — role does not matter, the assignment does.
      return actor.isAssignee;
    case 'comment':
    case 'attach':
      return isSupervisor || (actor.workshopRole !== null && (actor.isAssignee || actor.workshopRole === 'worker'));
    default:
      return false;
  }
}

export interface TransitionResult {
  to: TaskStatus;
  /** status fields to set on the task document */
  patch: Partial<{
    status: TaskStatus;
    previousStatus: TaskStatus | null;
    actualStart: Date | null;
    reportedAt: Date | null;
    reviewStartedAt: Date | null;
    approvedAt: Date | null;
    returnReason: string;
    supervisorRating: number | null;
    supervisorComment: string;
    plannedStart: Date | null;
    plannedEnd: Date | null;
    progress: number;
  }>;
}

/**
 * Resolve the legal transition for `action` from the current status.
 * Throws TaskTransitionError with a stable i18n error code when illegal.
 */
export function resolveTransition(
  from: TaskStatus,
  action: TaskAction,
  input: {
    plannedStart?: Date | null;
    plannedEnd?: Date | null;
    actualStart?: Date | null;
    progress?: number;
    rating?: number;
    comment?: string;
    reason?: string;
    assigneeId?: string | null;
    now?: Date;
  } = {},
): TransitionResult {
  const now = input.now ?? new Date();
  const rule = TRANSITIONS.find((t) => t.from === from && t.action === action);
  if (!rule) {
    throw new TaskTransitionError('errors.invalidTransition');
  }

  switch (action) {
    case 'schedule':
    case 'reschedule': {
      const start = input.plannedStart;
      const end = input.plannedEnd;
      if (!start || !end) throw new TaskTransitionError('errors.datesRequired');
      if (end.getTime() <= start.getTime()) throw new TaskTransitionError('errors.endBeforeStart');
      if (!input.assigneeId) throw new TaskTransitionError('errors.assigneeRequired');
      return {
        to: 'scheduled',
        patch: {
          status: 'scheduled',
          previousStatus: from,
          plannedStart: start,
          plannedEnd: end,
          returnReason: '',
          progress: from === 'cancelled' ? 0 : (input.progress ?? 0),
        },
      };
    }
    case 'start': {
      const base: TransitionResult = {
        to: 'in_progress',
        patch: { status: 'in_progress', previousStatus: from, returnReason: '' },
      };
      if (from === 'overdue') base.patch.previousStatus = null;
      if (from === 'overdue') delete (base.patch as { previousStatus?: unknown }).previousStatus;
      if (!input.actualStart) base.patch.actualStart = now;
      if (action === 'start') base.patch.progress = Math.max(input.progress ?? 0, from === 'overdue' ? 0 : 5);
      return base;
    }
    case 'set_progress': {
      return { to: from, patch: { progress: input.progress ?? 0 } };
    }
    case 'report_done': {
      return { to: 'worker_reported_done', patch: { status: 'worker_reported_done', reportedAt: now, progress: 100 } };
    }
    case 'begin_review': {
      return { to: 'awaiting_supervisor_review', patch: { status: 'awaiting_supervisor_review', reviewStartedAt: now } };
    }
    case 'approve': {
      return {
        to: 'completed_approved',
        patch: {
          status: 'completed_approved',
          approvedAt: now,
          supervisorRating: input.rating ?? null,
          supervisorComment: input.comment ?? '',
          previousStatus: null,
        },
      };
    }
    case 'return': {
      if (!input.reason || input.reason.trim().length < 3) throw new TaskTransitionError('errors.reasonRequired');
      return {
        to: 'in_progress',
        patch: { status: 'in_progress', returnReason: input.reason.trim(), reportedAt: null, reviewStartedAt: null, progress: 90 },
      };
    }
    case 'cancel': {
      return { to: 'cancelled', patch: { status: 'cancelled' } };
    }
    default:
      throw new TaskTransitionError('errors.invalidTransition');
  }
}

/** System-side overdue transition (background scheduler only). */
export function overduePatch(previousStatus: TaskStatus): TransitionResult['patch'] {
  return { status: 'overdue', previousStatus };
}

export const TERMINAL_STATUSES: TaskStatus[] = ['completed_approved', 'cancelled'];

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Statuses that count as "active work" for dashboards. */
export const ACTIVE_STATUSES: TaskStatus[] = ['scheduled', 'in_progress', 'worker_reported_done', 'awaiting_supervisor_review', 'overdue'];

/** Sanity check used in unit tests: no worker transition may reach approved states. */
export function assertWorkerSafety(): void {
  for (const t of TRANSITIONS) {
    if (t.actor === 'assigned_worker' && WORKER_FORBIDDEN_TARGETS.includes(t.to)) {
      throw new Error(`Unsafe transition ${t.from} -> ${t.to} for worker`);
    }
  }
}
