'use client';

import { useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useSilentRefresh } from '@/lib/use-silent-refresh';
import { Card, LoadingScreen, ErrorState, StatusBadge, PriorityBadge, ProgressBar, Rating, Tabs, Avatar } from '@/components/ui';
import { Icon } from '@/components/layout';
import { TaskActions, TaskTimeline, TaskAttachments, TaskComments, DeliveryInfo, statusLabel, priorityLabel } from '@/components/tasks';
import { formatDateTime, formatDuration } from '@/lib/format';
import type { Task, TaskStatus } from '@ats/shared';

const STEPS: { key: TaskStatus | 'overdue'; labelKey: string; icon: string }[] = [
  { key: 'scheduled', labelKey: 'status.scheduled', icon: 'clock' },
  { key: 'in_progress', labelKey: 'status.in_progress', icon: 'play' },
  { key: 'worker_reported_done', labelKey: 'status.worker_reported_done', icon: 'flag' },
  { key: 'awaiting_supervisor_review', labelKey: 'status.awaiting_supervisor_review', icon: 'eye' },
  { key: 'completed_approved', labelKey: 'status.completed_approved', icon: 'check-circle' },
];

const STEP_INDEX: Record<TaskStatus, number> = {
  draft: -1,
  scheduled: 0,
  in_progress: 1,
  overdue: 1,
  worker_reported_done: 2,
  awaiting_supervisor_review: 3,
  completed_approved: 4,
  cancelled: -1,
};

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, isDeliveryWorker, isSupervisor, isSuperAdmin } = useAuth();
  const { locale, t } = useLocale();
  const deliveryOnly = isDeliveryWorker && !isSupervisor && !isSuperAdmin;
  const [task, setTask] = useState<Task | null>(null);
  const [, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<'overview' | 'activity' | 'files' | 'comments'>('overview');

  const load = useCallback(async (silent = false) => {
    if (!silent) setError('');
    try {
      const data = await api<{ task: Task }>(`/api/tasks/${id}`);
      setTask(data.task);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? 'errors.serverError';
      if ((err as { status?: number })?.status === 404 || code === 'errors.taskNotFound' || code === 'errors.forbidden') setNotFound(true);
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
        <Link href="/tasks" className="btn btn-ghost btn-sm mt-4 w-fit"><Icon name="arrow-left" size={15} className="rtl:rotate-180" />{t('common.back')}</Link>
      </div>
    );
  }
  if (!task) return <LoadingScreen label={t('common.loading')} />;

  const rows: { label: string; value: string; icon?: string }[] = [
    { label: t('task.assignee'), value: task.assigneeName ?? t('task.noAssignee'), icon: 'workers' },
    { label: t('task.createdBy'), value: task.createdByName ?? '—', icon: 'profile' },
    { label: t('task.plannedStart'), value: formatDateTime(task.plannedStart, locale), icon: 'clock' },
    { label: t('task.plannedEnd'), value: formatDateTime(task.plannedEnd, locale), icon: 'clock' },
    { label: t('task.actualStart'), value: formatDateTime(task.actualStart, locale), icon: 'play' },
    { label: t('task.reportedAt'), value: formatDateTime(task.reportedAt, locale), icon: 'flag' },
    { label: t('task.reviewStartedAt'), value: formatDateTime(task.reviewStartedAt, locale), icon: 'eye' },
    { label: t('task.approvedAt'), value: formatDateTime(task.approvedAt, locale), icon: 'check-circle' },
    { label: t('task.plannedDuration'), value: formatDuration(task.plannedDurationMs, t), icon: 'timer' },
    { label: t('task.actualDuration'), value: formatDuration(task.actualDurationMs, t), icon: 'timer' },
    { label: t('task.location'), value: task.location || '—', icon: 'pin' },
    { label: t('task.workshop'), value: task.workshopName ?? '—', icon: 'workshop' },
  ];

  const stepIndex = STEP_INDEX[task.status];
  const commentCount = task.changeLog.filter((c) => c.action === 'comment').length;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[0.78rem] font-bold">
        <Link href="/tasks" className="inline-flex items-center gap-1 text-brand-500 hover:underline kbd-focus">
          <Icon name="arrow-left" size={13} className="rtl:rotate-180" />
          {t('task.pageTitle')}
        </Link>
        <span className="faint" aria-hidden>/</span>
        <span className="min-w-0 truncate" style={{ color: 'var(--text-2)' }}>{task.title}</span>
      </nav>

      {/* Header card */}
      <section className="card animate-fade-up overflow-hidden p-0">
        <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, var(--color-brand-500), var(--color-accent-500), var(--color-brand-500))' }} aria-hidden="true" />
        <div className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} label={statusLabel(locale, task.status)} />
            <PriorityBadge priority={task.priority} label={priorityLabel(locale, task.priority)} />
            <span className="ms-auto inline-flex items-center gap-1 text-[0.68rem] font-bold faint">
              <Icon name="calendar" size={12} />{t('task.createdAt')} {formatDateTime(task.createdAt, locale)}
            </span>
          </div>
          <h1 className="mt-3 text-xl font-black leading-snug tracking-tight sm:text-2xl" style={{ color: 'var(--text-1)' }}>{task.title}</h1>
          {task.description ? <p dir="auto" className="mt-2 whitespace-pre-wrap text-[0.94rem] leading-relaxed muted">{task.description}</p> : null}

          {task.safetyNotes ? (
            <div className="mt-4 flex gap-2.5 rounded-xl p-3.5" style={{ background: 'color-mix(in srgb, var(--st-overdue) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--st-overdue) 22%, transparent)' }}>
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--st-overdue) 14%, transparent)', color: 'var(--st-overdue)' }}><Icon name="shield" size={15} /></span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold" style={{ color: 'var(--st-overdue)' }}>{t('task.safetyNotes')}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed muted">{task.safetyNotes}</p>
              </div>
            </div>
          ) : null}

          {task.returnReason ? (
            <div className="mt-3 flex gap-2.5 rounded-xl p-3.5" style={{ background: 'color-mix(in srgb, var(--st-review) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--st-review) 22%, transparent)' }}>
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--st-review) 14%, transparent)', color: 'var(--st-review)' }}><Icon name="return" size={15} /></span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold" style={{ color: 'var(--st-review)' }}>{t('task.action.return')}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed muted">{task.returnReason}</p>
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
              <span className="muted">{t('task.progress')}</span>
              <span style={{ color: 'var(--color-brand-500)' }}>{task.progress}%</span>
            </div>
            <ProgressBar value={task.progress} label={t('task.progress')} height={9} />
          </div>

          {/* Status stepper */}
          {stepIndex >= 0 ? (
            <ol className="mt-5 flex items-center overflow-x-auto pb-1" aria-label={t('task.workflow')}>
              {STEPS.map((step, i) => {
                const done = i < stepIndex || task.status === 'completed_approved';
                const current = i === stepIndex;
                const overdue = current && task.status === 'overdue';
                return (
                  <li key={step.key} className="flex min-w-0 flex-1 items-center last:flex-none">
                    <div className="flex min-w-0 flex-col items-center gap-1">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition"
                        style={{
                          borderColor: done || current ? (overdue ? 'var(--st-overdue)' : 'var(--color-brand-500)') : 'var(--border-strong)',
                          background: done ? (overdue ? 'var(--st-overdue)' : 'var(--color-brand-500)') : current ? 'color-mix(in srgb, var(--color-brand-500) 12%, transparent)' : 'transparent',
                          color: done || current ? (overdue ? '#fff' : 'var(--color-brand-600)') : 'var(--text-3)',
                        }}
                      >
                        <Icon name={step.icon} size={14} />
                      </span>
                      <span className="hidden max-w-full truncate text-center text-[0.6rem] font-bold sm:block" style={{ color: current ? 'var(--text-1)' : 'var(--text-3)' }}>
                        {t(step.labelKey)}
                      </span>
                    </div>
                    {i < STEPS.length - 1 ? (
                      <span className="mx-1 mb-4 h-0.5 flex-1 rounded-full sm:mx-2" style={{ background: i < stepIndex ? 'var(--color-brand-500)' : 'var(--border)' }} aria-hidden="true" />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}

          <div className="mt-5 rounded-2xl p-3" style={{ background: 'var(--surface-hover)' }}>
            <TaskActions task={task} onChanged={() => void load()} />
          </div>
          {task.delivery ? (
            <div className="mt-4"><DeliveryInfo task={task} /></div>
          ) : null}
        </div>
      </section>

      {/* Tabs */}
      <div className="sticky top-[3.75rem] z-30 -mx-3 px-3 py-2 sm:mx-0 sm:px-0" style={{ background: 'var(--header-bg)', backdropFilter: 'blur(18px)' }}>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'overview', label: t('task.tab.overview'), icon: <Icon name="grid" size={15} /> },
            { value: 'activity', label: t('task.tab.activity'), icon: <Icon name="clock" size={15} /> },
            { value: 'files', label: t('task.tab.files'), icon: <Icon name="paperclip" size={15} />, badge: task.attachments.length || undefined },
            { value: 'comments', label: t('task.tab.comments'), icon: <Icon name="message" size={15} />, badge: commentCount || undefined },
          ]}
        />
      </div>

      {tab === 'overview' ? (
        <div className="animate-fade-up grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="section-title mb-3 flex items-center gap-1.5"><Icon name="info" size={16} className="text-brand-500" />{t('common.details')}</h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {rows.map((row) => (
                <div key={row.label} className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-[0.68rem] font-extrabold uppercase tracking-wide faint"><Icon name={row.icon ?? 'clock'} size={12} />{row.label}</dt>
                  <dd className="mt-0.5 break-words text-[0.88rem] font-bold leading-snug" style={{ color: 'var(--text-1)' }}>{row.value}</dd>
                </div>
              ))}
            </dl>
            {task.supervisorRating != null ? (
              <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-extrabold faint">{t('task.rating')}</p>
                  <Rating value={task.supervisorRating} readOnly />
                </div>
                {task.supervisorComment ? <p className="mt-2 rounded-xl p-3 text-sm leading-relaxed muted" style={{ background: 'var(--surface-hover)' }}>{task.supervisorComment}</p> : null}
              </div>
            ) : null}
          </Card>

          <div className="space-y-4">
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--color-brand-500) 12%, transparent)', color: 'var(--color-brand-500)' }}><Icon name="info" size={16} /></span>
                <h2 className="section-title">{t('task.summary')}</h2>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl p-3" style={{ background: 'var(--surface-hover)' }}>
                  <p className="text-[0.64rem] font-bold faint">{t('task.assignee')}</p>
                  <div className="mt-1 flex items-center gap-1.5"><Avatar src={null} name={task.assigneeName ?? '?'} size={22} /><span className="truncate text-[0.8rem] font-bold" style={{ color: 'var(--text-1)' }}>{task.assigneeName ?? t('task.noAssignee')}</span></div>
                </div>
                <div className="rounded-xl p-3" style={{ background: 'var(--surface-hover)' }}>
                  <p className="text-[0.64rem] font-bold faint">{t('task.plannedEnd')}</p>
                  <p className="mt-1 text-[0.8rem] font-bold" style={{ color: 'var(--text-1)' }}>{formatDateTime(task.plannedEnd, locale)}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: 'var(--surface-hover)' }}>
                  <p className="text-[0.64rem] font-bold faint">{t('task.attachments')}</p>
                  <p className="mt-1 text-[0.8rem] font-bold" style={{ color: 'var(--text-1)' }}>{task.attachments.length}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: 'var(--surface-hover)' }}>
                  <p className="text-[0.64rem] font-bold faint">{t('task.tab.comments')}</p>
                  <p className="mt-1 text-[0.8rem] font-bold" style={{ color: 'var(--text-1)' }}>{commentCount}</p>
                </div>
              </div>
            </Card>

            {!deliveryOnly ? (
              <Card>
                <h2 className="section-title mb-3 flex items-center gap-1.5"><Icon name="paperclip" size={16} className="text-brand-500" />{t('task.attachments')}</h2>
                <TaskAttachments task={task} onChanged={() => void load()} />
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'activity' && !deliveryOnly ? (
        <Card className="animate-fade-up">
          <h2 className="section-title mb-4 flex items-center gap-1.5"><Icon name="clock" size={16} className="text-brand-500" />{t('task.timelineTitle')}</h2>
          <TaskTimeline task={task} />
        </Card>
      ) : null}

      {tab === 'files' && !deliveryOnly ? (
        <Card className="animate-fade-up">
          <h2 className="section-title mb-4 flex items-center gap-1.5"><Icon name="paperclip" size={16} className="text-brand-500" />{t('task.attachments')}</h2>
          <TaskAttachments task={task} onChanged={() => void load()} />
        </Card>
      ) : null}

      {tab === 'comments' && !deliveryOnly ? (
        <Card className="animate-fade-up">
          <h2 className="section-title mb-4 flex items-center gap-1.5"><Icon name="message" size={16} className="text-brand-500" />{t('task.commentsTitle')}</h2>
          <TaskComments task={task} onChanged={() => void load()} />
        </Card>
      ) : null}

      {deliveryOnly ? (
        <Card className="animate-fade-up">
          <h2 className="section-title mb-3">{t('task.deliveryTitle')}</h2>
          <TaskComments task={task} onChanged={() => void load()} />
        </Card>
      ) : null}
    </div>
  );
}
