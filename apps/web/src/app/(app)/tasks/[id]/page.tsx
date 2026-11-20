'use client';

import { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useSilentRefresh } from '@/lib/use-silent-refresh';
import { Card, LoadingScreen, ErrorState, StatusBadge, PriorityBadge, ProgressBar, Rating } from '@/components/ui';
import { Icon } from '@/components/layout';
import { TaskActions, TaskTimeline, TaskAttachments, DeliveryInfo, statusLabel, priorityLabel } from '@/components/tasks';
import { formatDateTime, formatDuration } from '@/lib/format';
import type { Task } from '@ats/shared';

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, isDeliveryWorker, isSupervisor, isSuperAdmin } = useAuth();
  const { locale, t } = useLocale();
  // Delivery-worker accounts see only the task itself + the delivery panel.
  const deliveryOnly = isDeliveryWorker && !isSupervisor && !isSuperAdmin;
  const [task, setTask] = useState<Task | null>(null);
  const [, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError('');
    try {
      const data = await api<{ task: Task }>(`/api/tasks/${id}`);
      setTask(data.task);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? 'errors.serverError';
      if ((err as { status?: number })?.status === 404 || code === 'errors.taskNotFound' || code === 'errors.forbidden') setNotFound(true);
      // silent refresh failures are non-fatal — keep the current content
      if (!silent) setError(t(code));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useSilentRefresh(load);

  useEffect(() => {
    if (user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, id]);

  useEffect(() => { document.title = t('pageTitles.taskDetails'); }, [t]);

  if (!user) return <LoadingScreen label={t('common.loading')} />;
  if (notFound) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <ErrorState message={t('errors.taskNotFound')} />
        <Link href="/tasks" className="btn btn-ghost btn-sm mt-4 w-fit">{t('common.back')}</Link>
      </div>
    );
  }
  if (!task) return <LoadingScreen label={t('common.loading')} />;

  const rows: { label: string; value: string; icon?: string }[] = [
    { label: t('task.assignee'), value: task.assigneeName ?? t('task.noAssignee'), icon: 'workers' },
    { label: t('task.createdBy'), value: task.createdByName ?? '—', icon: 'profile' },
    { label: t('task.plannedStart'), value: formatDateTime(task.plannedStart, locale), icon: 'clock' },
    { label: t('task.plannedEnd'), value: formatDateTime(task.plannedEnd, locale), icon: 'clock' },
    { label: t('task.actualStart'), value: formatDateTime(task.actualStart, locale), icon: 'clock' },
    { label: t('task.reportedAt'), value: formatDateTime(task.reportedAt, locale), icon: 'clock' },
    { label: t('task.reviewStartedAt'), value: formatDateTime(task.reviewStartedAt, locale), icon: 'clock' },
    { label: t('task.approvedAt'), value: formatDateTime(task.approvedAt, locale), icon: 'clock' },
    { label: t('task.plannedDuration'), value: formatDuration(task.plannedDurationMs, t), icon: 'clock' },
    { label: t('task.actualDuration'), value: formatDuration(task.actualDurationMs, t), icon: 'clock' },
    { label: t('task.location'), value: task.location || '—', icon: 'pin' },
    { label: t('task.workshop'), value: task.workshopName ?? '—', icon: 'workshop' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm">
        <Link href="/tasks" className="text-brand-500 font-bold hover:underline kbd-focus">{t('task.pageTitle')}</Link>
        <span className="faint" aria-hidden>/</span>
        <span className="break-words font-bold" style={{ color: 'var(--text-2)' }}>{task.title}</span>
      </nav>

      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} label={statusLabel(locale, task.status)} />
          <PriorityBadge priority={task.priority} label={priorityLabel(locale, task.priority)} />
          <span className="text-xs faint">{t('task.createdAt')} {formatDateTime(task.createdAt, locale)}</span>
        </div>
        <h1 className="mt-3 text-xl font-black leading-snug sm:text-2xl" style={{ color: 'var(--text-1)' }}>{task.title}</h1>
        {task.description ? <p className="mt-2 whitespace-pre-wrap text-[0.95rem] leading-relaxed muted">{task.description}</p> : null}
        {task.safetyNotes ? (
          <div className="mt-3 rounded-xl p-3.5" style={{ background: 'color-mix(in srgb, var(--st-overdue) 8%, transparent)' }}>
            <p className="flex items-center gap-2 text-sm font-extrabold" style={{ color: 'var(--st-overdue)' }}>
              <Icon name="shield" size={16} />{t('task.safetyNotes')}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed muted">{task.safetyNotes}</p>
          </div>
        ) : null}
        {task.returnReason ? (
          <div className="mt-3 rounded-xl p-3.5" style={{ background: 'color-mix(in srgb, var(--st-review) 10%, transparent)' }}>
            <p className="flex items-center gap-2 text-sm font-extrabold" style={{ color: 'var(--st-review)' }}>
              <Icon name="return" size={16} />{t('task.action.return')}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed muted">{task.returnReason}</p>
          </div>
        ) : null}
        <div className="mt-4"><ProgressBar value={task.progress} label={t('task.progress')} /></div>

        <div className="mt-4">
          <TaskActions task={task} onChanged={() => void load()} />
        </div>
        {task.delivery ? (
          <div className="mt-4">
            <DeliveryInfo task={task} />
          </div>
        ) : null}
      </div>

      {/* Workshop cards (details, attachments, timeline) stay hidden from
          delivery-worker accounts — they only need the delivery itself. */}
      {!deliveryOnly ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="section-title mb-3">{t('common.details')}</h2>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {rows.map((row) => (
                  <div key={row.label} className="min-w-0">
                    <dt className="flex items-center gap-1.5 text-xs font-bold faint"><Icon name={row.icon ?? 'clock'} size={12} />{row.label}</dt>
                    <dd className="break-words text-sm font-bold" style={{ color: 'var(--text-1)' }}>{row.value}</dd>
                  </div>
                ))}
              </dl>
              {task.supervisorRating != null ? (
                <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                  <p className="mb-1 text-xs font-bold faint">{t('task.rating')}</p>
                  <Rating value={task.supervisorRating} readOnly />
                  {task.supervisorComment ? <p className="mt-1.5 text-sm leading-relaxed muted">{task.supervisorComment}</p> : null}
                </div>
              ) : null}
            </Card>

            <Card>
              <h2 className="section-title mb-3">{t('task.attachments')}</h2>
              <TaskAttachments task={task} onChanged={() => void load()} />
            </Card>
          </div>

          <Card>
            <h2 className="section-title mb-4">{t('task.timelineTitle')}</h2>
            <TaskTimeline task={task} />
          </Card>
        </>
      ) : null}
    </div>
  );
}
