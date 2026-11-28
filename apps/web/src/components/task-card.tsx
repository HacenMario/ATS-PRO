'use client';

import Link from 'next/link';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { StatusBadge, PriorityBadge, ProgressBar, Avatar, STATUS_STYLE } from '@/components/ui';
import { Icon } from '@/components/layout';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { Task } from '@ats/shared';

/** Accent color of a delivery status chip. */
export function deliveryStatusColor(status: 'pending' | 'accepted' | 'delivered'): string {
  return status === 'pending' ? 'var(--st-inprogress)' : status === 'accepted' ? 'var(--st-scheduled)' : 'var(--st-approved)';
}

export function isOverdue(task: Task): boolean {
  if (!task.plannedEnd) return false;
  if (task.status === 'completed_approved' || task.status === 'cancelled') return false;
  return new Date(task.plannedEnd).getTime() < Date.now();
}

export function isDueToday(task: Task): boolean {
  if (!task.plannedEnd) return false;
  const d = new Date(task.plannedEnd);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** Modern task card used on the dashboard, task list and search results. */
export function TaskCard({ task, dense = false }: { task: Task; dense?: boolean }) {
  const { locale, t } = useLocale();
  const { isSupervisor, isDeliveryWorker } = useAuth();
  const overdue = isOverdue(task);
  const dueToday = isDueToday(task);
  const needsAttention = (task.status === 'scheduled' && !isSupervisor && !isDeliveryWorker)
    || (task.status === 'worker_reported_done' && isSupervisor);

  return (
    <Link
      href={`/tasks/${task.id}`}
      className={`card card-hover group flex flex-col gap-3 p-4${needsAttention ? ' card-bounce' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={task.status} label={t(`status.${task.status}`)} />
        <PriorityBadge priority={task.priority} label={t(`priority.${task.priority}`)} />
        {task.delivery ? (
          <span className="chip tint" style={{ '--tint-color': deliveryStatusColor(task.delivery.status) } as React.CSSProperties}>
            {t(`task.deliveryStatus_${task.delivery.status}`)}
          </span>
        ) : null}
        {overdue ? (
          <span className="chip tint ms-auto" style={{ '--tint-color': 'var(--st-overdue)' } as React.CSSProperties}>
            <Icon name="alert-circle" size={12} />{t('task.overdueBadge')}
          </span>
        ) : dueToday ? (
          <span className="chip tint ms-auto" style={{ '--tint-color': 'var(--st-inprogress)' } as React.CSSProperties}>
            <Icon name="clock" size={12} />{t('task.dueToday')}
          </span>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <h3 dir="auto" className="text-[1.02rem] font-extrabold leading-snug [overflow-wrap:break-word] transition group-hover:text-brand-600" style={{ color: 'var(--text-1)' }}>
          {task.title}
        </h3>
        {task.description && !dense ? (
          <p dir="auto" className="whitespace-pre-wrap text-[0.84rem] leading-relaxed muted [overflow-wrap:break-word]">{task.description}</p>
        ) : null}
      </div>

      {task.progress > 0 || task.status === 'in_progress' ? <ProgressBar value={task.progress} label={t('task.progress')} /> : null}

      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        <span dir="auto" className="flex min-w-0 items-center gap-1.5">
          <Icon name="workers" size={13} className="shrink-0" />
          <span className="min-w-0 truncate">{task.assigneeName ?? t('task.noAssignee')}</span>
        </span>
        {task.plannedEnd ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Icon name="clock" size={13} className="shrink-0" />
            <span className="min-w-0 truncate">{formatDateTime(task.plannedEnd, locale)}</span>
          </span>
        ) : null}
        {task.location ? (
          <span dir="auto" className="flex min-w-0 items-center gap-1.5">
            <Icon name="pin" size={13} className="shrink-0" />
            <span className="min-w-0 truncate">{task.location}</span>
          </span>
        ) : null}
        {task.workshopName ? (
          <span dir="auto" className="flex min-w-0 items-center gap-1.5">
            <Icon name="workshop" size={13} className="shrink-0" />
            <span className="min-w-0 truncate">{task.workshopName}</span>
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t pt-2.5" style={{ borderColor: 'var(--border)' }}>
        <span className="flex min-w-0 items-center gap-1.5 text-[0.72rem] font-bold faint">
          <Avatar src={null} name={task.createdByName ?? '?'} size={20} />
          <span className="truncate">{task.createdByName}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[0.7rem] font-bold faint">
          {task.changeLog.some((c) => c.action === 'comment') ? (
            <span className="inline-flex items-center gap-0.5"><Icon name="message" size={12} />{task.changeLog.filter((c) => c.action === 'comment').length}</span>
          ) : null}
          {task.attachments.length > 0 ? (
            <span className="inline-flex items-center gap-0.5"><Icon name="paperclip" size={12} />{task.attachments.length}</span>
          ) : null}
          <Icon name="chevron-left" size={14} className="text-[var(--text-3)] rtl:rotate-180" />
        </span>
      </div>
    </Link>
  );
}

/** Compact row for the list view — still full text, no clipping. */
export function TaskRow({ task }: { task: Task }) {
  const { locale, t } = useLocale();
  const overdue = isOverdue(task);
  const color = STATUS_STYLE[task.status];
  return (
    <Link href={`/tasks/${task.id}`} className="card card-hover flex items-start gap-3 p-3.5 sm:items-center">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
        <Icon name="tasks" size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={task.status} label={t(`status.${task.status}`)} />
          {overdue ? <span className="chip tint" style={{ '--tint-color': 'var(--st-overdue)' } as React.CSSProperties}>{t('task.overdueBadge')}</span> : null}
        </div>
        <h3 dir="auto" className="mt-1 text-[0.92rem] font-extrabold leading-snug [overflow-wrap:break-word]" style={{ color: 'var(--text-1)' }}>{task.title}</h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.72rem] font-semibold faint">
          <span className="inline-flex items-center gap-1"><Icon name="workers" size={12} />{task.assigneeName ?? t('task.noAssignee')}</span>
          {task.plannedEnd ? <span className="inline-flex items-center gap-1"><Icon name="clock" size={12} />{formatDateTime(task.plannedEnd, locale)}</span> : null}
          {task.location ? <span className="inline-flex items-center gap-1"><Icon name="pin" size={12} />{task.location}</span> : null}
        </p>
      </div>
      <Icon name="chevron-left" size={17} className="mt-2 hidden shrink-0 text-[var(--text-3)] sm:block rtl:rotate-180" />
    </Link>
  );
}

/** Due-date pill used on the calendar. */
export function DuePill({ task }: { task: Task }) {
  const { locale, t } = useLocale();
  const overdue = isOverdue(task);
  if (!task.plannedEnd) return null;
  return (
    <span className={`chip !px-2 !py-0.5 text-[0.66rem] ${overdue ? 'tint' : ''}`} style={overdue ? ({ '--tint-color': 'var(--st-overdue)' } as React.CSSProperties) : undefined}>
      <Icon name="clock" size={11} />
      {overdue ? t('task.overdueBadge') : formatRelative(task.plannedEnd, locale)}
    </span>
  );
}
