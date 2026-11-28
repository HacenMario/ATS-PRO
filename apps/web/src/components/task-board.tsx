'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useToast } from '@/providers/toast';
import { Sheet, StatusBadge, PriorityBadge, ProgressBar, Avatar } from '@/components/ui';
import { Icon } from '@/components/layout';
import { formatDateTime } from '@/lib/format';
import type { Task, TaskStatus } from '@ats/shared';
import { isOverdue } from '@/components/task-card';

type BoardAction = 'start' | 'report' | 'begin-review';

const COLUMNS: { status: TaskStatus; labelKey: string; hintKey: string }[] = [
  { status: 'overdue', labelKey: 'status.overdue', hintKey: 'board.hint.overdue' },
  { status: 'draft', labelKey: 'status.draft', hintKey: 'board.hint.draft' },
  { status: 'scheduled', labelKey: 'status.scheduled', hintKey: 'board.hint.scheduled' },
  { status: 'in_progress', labelKey: 'status.in_progress', hintKey: 'board.hint.inProgress' },
  { status: 'worker_reported_done', labelKey: 'status.worker_reported_done', hintKey: 'board.hint.reported' },
  { status: 'awaiting_supervisor_review', labelKey: 'status.awaiting_supervisor_review', hintKey: 'board.hint.review' },
  { status: 'completed_approved', labelKey: 'status.completed_approved', hintKey: 'board.hint.done' },
];

export function boardTransition(from: TaskStatus, to: TaskStatus): BoardAction | 'open' | null {
  if (from === to) return null;
  if (to === 'in_progress' && (from === 'scheduled' || from === 'overdue')) return 'start';
  if (to === 'worker_reported_done' && (from === 'in_progress' || from === 'overdue')) return 'report';
  if (to === 'awaiting_supervisor_review' && from === 'worker_reported_done') return 'begin-review';
  if (to === 'completed_approved' && (from === 'worker_reported_done' || from === 'awaiting_supervisor_review')) return 'open';
  if (to === 'scheduled' && (from === 'draft' || from === 'cancelled' || from === 'overdue')) return 'open';
  if (to === 'in_progress' && (from === 'worker_reported_done' || from === 'awaiting_supervisor_review')) return 'open';
  return null;
}

/**
 * Kanban board. Drag cards between columns on desktop; on touch, open the
 * card menu and pick an action. Every move is validated against the task
 * state machine — illegal drops are rejected with a friendly toast.
 */
export function TaskBoard({ tasks, onAction, onRefresh }: {
  tasks: Task[];
  onAction: (task: Task, action: BoardAction) => Promise<void>;
  onRefresh: () => void;
}) {
  const { t, locale } = useLocale();
  const { user, isSupervisor, isSuperAdmin } = useAuth();
  const { push } = useToast();
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuTask, setMenuTask] = useState<Task | null>(null);

  const canManage = isSupervisor || isSuperAdmin;
  const columns = useMemo(
    () => COLUMNS.map((col) => ({ ...col, tasks: tasks.filter((task) => task.status === col.status) })),
    [tasks],
  );

  const drop = async (task: Task, target: TaskStatus) => {
    setOverStatus(null);
    setDragId(null);
    if (task.status === target) return;
    const transition = boardTransition(task.status, target);
    if (!transition) {
      push('info', t('board.invalidMove'));
      return;
    }
    if (transition === 'open') {
      // Moves that need extra input (rating, dates, reason) open the task.
      router.push(`/tasks/${task.id}`);
      return;
    }
    setBusyId(task.id);
    try {
      await onAction(task, transition);
      onRefresh();
    } catch {
      /* the parent already toasts the API error */
    } finally {
      setBusyId(null);
    }
  };

  const menuActions = useMemo(() => {
    if (!menuTask) return [];
    const task = menuTask;
    const isAssignee = user?.id === task.assigneeId;
    const list: { key: string; label: string; icon: string; action?: BoardAction; danger?: boolean }[] = [];
    if ((canManage || isAssignee) && (task.status === 'scheduled' || task.status === 'overdue')) {
      list.push({ key: 'start', label: t('task.action.start'), icon: 'play', action: 'start' });
    }
    if (isAssignee && (task.status === 'in_progress' || task.status === 'overdue')) {
      list.push({ key: 'report', label: t('task.action.reportDone'), icon: 'check', action: 'report' });
    }
    if (canManage && task.status === 'worker_reported_done') {
      list.push({ key: 'review', label: t('task.action.beginReview'), icon: 'flag', action: 'begin-review' });
    }
    list.push({ key: 'open', label: t('board.openTask'), icon: 'external' });
    if (canManage && task.status !== 'completed_approved' && task.status !== 'cancelled') {
      list.push({ key: 'cancel', label: t('task.action.cancel'), icon: 'cancel', danger: true });
    }
    return list;
  }, [menuTask, canManage, user?.id, t]);

  return (
    <>
      <div className="scroll-x -mx-3 flex snap-x snap-mandatory gap-3 px-3 pb-3 sm:-mx-5 sm:px-5">
        {columns.map((column) => {
          const color = column.status === 'worker_reported_done' ? 'var(--st-reported)'
            : column.status === 'in_progress' ? 'var(--st-inprogress)'
              : column.status === 'awaiting_supervisor_review' ? 'var(--st-review)'
                : column.status === 'completed_approved' ? 'var(--st-approved)'
                  : column.status === 'overdue' ? 'var(--st-overdue)'
                    : column.status === 'scheduled' ? 'var(--st-scheduled)' : 'var(--st-draft)';
          const activeDrop = overStatus === column.status;
          return (
            <section
              key={column.status}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverStatus(column.status); } }}
              onDragLeave={() => setOverStatus((s) => (s === column.status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                const task = tasks.find((x) => x.id === id);
                if (task) void drop(task, column.status);
              }}
              className="flex w-[82vw] max-w-[21rem] shrink-0 snap-start flex-col rounded-2xl border p-2.5 sm:w-72"
              style={{
                borderColor: activeDrop ? 'color-mix(in srgb, var(--color-brand-500) 55%, transparent)' : 'var(--border)',
                background: activeDrop ? 'color-mix(in srgb, var(--color-brand-500) 7%, transparent)' : 'color-mix(in srgb, var(--surface) 70%, transparent)',
                minHeight: '16rem',
              }}
              aria-label={t(column.labelKey)}
            >
              <header className="mb-2 flex items-center gap-2 px-1.5 py-1">
                <span className="status-dot" style={{ background: color }} aria-hidden="true" />
                <h3 className="min-w-0 flex-1 truncate text-[0.78rem] font-extrabold" style={{ color: 'var(--text-1)' }}>{t(column.labelKey)}</h3>
                <span className="chip !px-1.5 !py-0 text-[0.62rem] font-black tabular-nums" style={{ color: 'var(--text-2)' }}>{column.tasks.length}</span>
              </header>

              <div className="flex min-h-[9rem] flex-1 flex-col gap-2">
                {column.tasks.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => router.push(column.status === 'draft' ? '/tasks/new' : '/tasks')}
                    className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-2 py-5 text-center transition hover:border-brand-500/40"
                    style={{ borderColor: 'var(--border-strong)', color: 'var(--text-3)' }}
                  >
                    <Icon name="plus" size={16} />
                    <span className="text-[0.68rem] font-bold leading-tight">{t(column.hintKey)}</span>
                  </button>
                ) : (
                  column.tasks.map((task) => (
                    <BoardCard
                      key={task.id}
                      task={task}
                      busy={busyId === task.id}
                      dragging={dragId === task.id}
                      onDragStart={() => setDragId(task.id)}
                      onDragEnd={() => { setDragId(null); setOverStatus(null); }}
                      onMenu={() => setMenuTask(task)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Sheet open={Boolean(menuTask)} onClose={() => setMenuTask(null)} title={menuTask?.title ?? ''}>
        {menuTask ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={menuTask.status} label={t(`status.${menuTask.status}`)} />
              <PriorityBadge priority={menuTask.priority} label={t(`priority.${menuTask.priority}`)} />
            </div>
            {menuTask.description ? <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed muted">{menuTask.description}</p> : null}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl p-2.5" style={{ background: 'var(--surface-hover)' }}>
                <p className="font-bold faint">{t('task.assignee')}</p>
                <p className="mt-0.5 font-bold" style={{ color: 'var(--text-1)' }}>{menuTask.assigneeName ?? t('task.noAssignee')}</p>
              </div>
              <div className="rounded-xl p-2.5" style={{ background: 'var(--surface-hover)' }}>
                <p className="font-bold faint">{t('task.plannedEnd')}</p>
                <p className="mt-0.5 font-bold" style={{ color: 'var(--text-1)' }}>{formatDateTime(menuTask.plannedEnd, locale)}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {menuActions.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  className="nav-link w-full !justify-start"
                  onClick={async () => {
                    if (a.action) {
                      setBusyId(menuTask.id);
                      try { await onAction(menuTask, a.action); onRefresh(); } finally { setBusyId(null); }
                      setMenuTask(null);
                    } else if (a.key === 'open') {
                      setMenuTask(null);
                      router.push(`/tasks/${menuTask.id}`);
                    } else {
                      setMenuTask(null);
                      router.push(`/tasks/${menuTask.id}`);
                    }
                  }}
                  style={a.danger ? { color: 'var(--st-overdue)' } : undefined}
                >
                  <Icon name={a.icon} size={17} />
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

function BoardCard({ task, busy, dragging, onDragStart, onDragEnd, onMenu }: {
  task: Task;
  busy: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMenu: () => void;
}) {
  const { t, locale } = useLocale();
  const overdue = isOverdue(task);
  return (
    <div
      draggable={!busy}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`card group relative flex cursor-grab flex-col gap-2 p-3 active:cursor-grabbing ${dragging ? 'opacity-50' : ''}`}
      style={{ boxShadow: dragging ? 'var(--shadow-2)' : undefined }}
    >
      <div className="flex items-start justify-between gap-2">
        <PriorityBadge priority={task.priority} label={t(`priority.${task.priority}`)} />
        <button
          type="button"
          onClick={onMenu}
          className="icon-btn !h-7 !w-7 shrink-0"
          aria-label={t('board.actions')}
          title={t('board.actions')}
        >
          <Icon name="more" size={15} />
        </button>
      </div>
      <Link href={`/tasks/${task.id}`} className="min-w-0">
        <h4 dir="auto" className="text-[0.86rem] font-extrabold leading-snug [overflow-wrap:break-word]" style={{ color: 'var(--text-1)' }}>
          {task.title}
        </h4>
      </Link>
      {task.progress > 0 ? <ProgressBar value={task.progress} height={5} /> : null}
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[0.7rem] font-bold faint">
          <Avatar src={null} name={task.assigneeName ?? '?'} size={20} />
          <span className="truncate">{task.assigneeName ?? t('task.noAssignee')}</span>
        </span>
        {task.plannedEnd ? (
          <span className={`shrink-0 text-[0.64rem] font-extrabold ${overdue ? '' : ''}`} style={{ color: overdue ? 'var(--st-overdue)' : 'var(--text-3)' }}>
            {formatDateTime(task.plannedEnd, locale)}
          </span>
        ) : null}
      </div>
      {busy ? <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/10"><span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" /></span> : null}
    </div>
  );
}
