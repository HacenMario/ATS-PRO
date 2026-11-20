'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useSilentRefresh } from '@/lib/use-silent-refresh';
import { useNotifications } from '@/providers/notifications';
import { Card, LoadingScreen, ErrorState, EmptyState, StatusBadge } from '@/components/ui';
import { Icon } from '@/components/layout';
import { TaskCard } from '@/components/tasks';
import { Donut } from '@/components/ui';
import { formatDateTime, formatDuration, formatNumber } from '@/lib/format';
import type { Task, TaskStats as TaskStatsData, PublicWorkshop, TaskStatus } from '@ats/shared';
import { TASK_STATUSES } from '@ats/shared';

/** Bar color per task status (matches the status badges). */
const STATUS_BAR_COLORS: Record<string, string> = {
  draft: 'var(--st-draft)',
  scheduled: 'var(--st-scheduled)',
  in_progress: 'var(--st-inprogress)',
  worker_reported_done: 'var(--st-reported)',
  awaiting_supervisor_review: 'var(--st-review)',
  completed_approved: 'var(--st-approved)',
  cancelled: 'var(--st-cancelled)',
  overdue: 'var(--st-overdue)',
};

export default function DashboardPage() {
  const { user, isSupervisor, isSuperAdmin, isDeliveryWorker, hasWorkshop, memberships } = useAuth();
  const { locale, t } = useLocale();
  const { socketConnected } = useNotifications();
  const [stats, setStats] = useState<(TaskStatsData & { perWorker?: { userId: string; name: string; assigned: number; completed: number; late: number; onTime: number; avgRating: number | null }[] }) | null>(null);
  const [recent, setRecent] = useState<Task[]>([]);
  const [dueSoon, setDueSoon] = useState<Task[]>([]);
  const [workshops, setWorkshops] = useState<PublicWorkshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setError('');
    try {
      const [statsRes, tasksRes] = await Promise.all([
        api<TaskStatsData>('/api/tasks/stats'),
        api<{ items: Task[] }>(`/api/tasks?page=1&pageSize=6&sort=dueAsc`),
      ]);
      setStats(statsRes);
      setRecent(tasksRes.items);
      const soon = tasksRes.items
        .filter((task) => task.plannedEnd && ['scheduled', 'in_progress', 'overdue'].includes(task.status))
        .slice(0, 4);
      setDueSoon(soon);
      if (isSuperAdmin) {
        const ws = await api<{ items: PublicWorkshop[] }>('/api/workshops');
        setWorkshops(ws.items);
      }
      if (silent) setError('');
    } catch (err) {
      // silent refresh failures are non-fatal — keep the current content
      if (!silent) setError(t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setLoading(false);
    }
  }, [t, isSuperAdmin]);
  useSilentRefresh(load);

  useEffect(() => {
    if (user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => { document.title = t('pageTitles.dashboard'); }, [t]);

  if (!user) return <LoadingScreen label={t('common.loading')} />;

  if (!hasWorkshop && !isSuperAdmin) {
    return (
      <div className="mx-auto max-w-lg py-8">
        <EmptyState
          icon={<Icon name="workshop" size={42} />}
          title={t('dash.noWorkshop')}
          hint={t('dash.noWorkshopHint')}
          action={<Link href="/workshop" className="btn btn-primary btn-sm">{t('workshop.joinTitle')}</Link>}
        />
      </div>
    );
  }

  // Delivery-worker accounts see ONLY delivery-relevant content: the delivery
  // stat cards above and their current deliveries below. Workshop widgets
  // (tasks by status, due soon, workshops, worker stats) stay hidden.
  const deliveryOnly = isDeliveryWorker && !isSupervisor && !isSuperAdmin;
  const by = (s: TaskStatus) => stats?.byStatus?.[s] ?? 0;
  // Delivery-worker accounts get a dedicated, role-fitting dashboard: the
  // delivery pipeline of their workshop plus their own results.
  const deliveryStatCards: { label: string; value: string; icon: string; href: string; color?: string }[] = [
    { label: t('dash.deliveriesPending'), value: String(stats?.delivery?.pending ?? 0), icon: 'pin', href: '/tasks', color: 'var(--st-inprogress)' },
    { label: t('dash.deliveriesAccepted'), value: String(stats?.delivery?.accepted ?? 0), icon: 'return', href: '/tasks', color: 'var(--st-scheduled)' },
    { label: t('dash.deliveriesDone'), value: String(stats?.delivery?.delivered ?? 0), icon: 'check', href: '/tasks', color: 'var(--st-approved)' },
    ...(isDeliveryWorker ? [
      { label: t('dash.myDeliveries'), value: String(stats?.delivery?.myDelivered ?? 0), icon: 'flag', href: '/tasks', color: 'var(--st-approved)' },
      { label: t('dash.myDeliveryEarnings'), value: `${formatNumber(stats?.delivery?.myEarnings ?? 0)} ${t('common.currency')}`, icon: 'tasks', href: '/tasks' },
    ] : []),
  ];
  const statCards: { label: string; value: string; icon: string; href: string; color?: string }[] = isDeliveryWorker && !isSupervisor && !isSuperAdmin
    ? deliveryStatCards
    : [
    ...(isSuperAdmin ? [{ label: t('admin.tab.workshops'), value: String(workshops.length), icon: 'workshop', href: '/admin' }] : []),
    { label: t('dash.totalTasks'), value: String(stats?.total ?? 0), icon: 'tasks', href: '/tasks' },
    // One card per task status + people counts
    { label: t('status.scheduled'), value: String(by('scheduled')), icon: 'clock', href: '/tasks?status=scheduled', color: 'var(--st-scheduled)' },
    { label: t('status.in_progress'), value: String(by('in_progress')), icon: 'play', href: '/tasks?status=in_progress', color: 'var(--st-inprogress)' },
    { label: t('status.worker_reported_done'), value: String(by('worker_reported_done')), icon: 'flag', href: '/tasks?status=worker_reported_done', color: 'var(--st-reported)' },
    { label: t('status.awaiting_supervisor_review'), value: String(by('awaiting_supervisor_review')), icon: 'flag', href: '/tasks?status=awaiting_supervisor_review', color: 'var(--st-review)' },
    { label: t('status.completed_approved'), value: String(by('completed_approved')), icon: 'check', href: '/tasks?status=completed_approved', color: 'var(--st-approved)' },
    { label: t('status.cancelled'), value: String(by('cancelled')), icon: 'cancel', href: '/tasks?status=cancelled', color: 'var(--st-cancelled)' },
    { label: t('dash.overdueTasks'), value: String(stats?.overdue ?? 0), icon: 'clock', href: '/tasks?status=overdue', color: 'var(--st-overdue)' },
    { label: t('dash.workersCount'), value: String(stats?.workersCount ?? 0), icon: 'workers', href: '/workers' },
    { label: t('dash.supervisorsCount'), value: String(stats?.supervisorsCount ?? 0), icon: 'shield', href: '/workers' },
    ...((isSupervisor || isSuperAdmin)
      ? [
          { label: t('dash.pendingReviews'), value: String((stats?.byStatus?.worker_reported_done ?? 0) + (stats?.byStatus?.awaiting_supervisor_review ?? 0)), icon: 'flag', href: '/tasks' },
          { label: t('dash.deliveriesDone'), value: String(stats?.delivery?.delivered ?? 0), icon: 'pin', href: '/tasks', color: 'var(--st-approved)' },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl" style={{ color: 'var(--text-1)' }}>
            {t('dash.welcome', { name: user.name })}
          </h1>
          <p className="mt-1 text-sm muted">
            {isSuperAdmin ? t('dash.adminTitle') : isSupervisor ? t('dash.supervisorTitle') : isDeliveryWorker ? t('dash.deliveryTitle') : t('dash.workerTitle')}
            {' · '}
            <span className={socketConnected ? 'text-emerald-500' : ''}>{socketConnected ? t('dash.online') : t('dash.offline')}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {isSupervisor || isSuperAdmin ? (
            <Link href="/tasks/new" className="btn btn-primary btn-sm"><Icon name="plus" size={15} />{t('task.action.newTask')}</Link>
          ) : null}
          <Link href="/tasks" className="btn btn-ghost btn-sm">{t('dash.allTasks')}</Link>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load()} retryLabel={t('common.retry')} /> : null}
      {loading ? <LoadingScreen label={t('common.loading')} /> : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {statCards.map((s) => (
              <Link key={s.label} href={s.href} className="card flex flex-col gap-1.5 p-4 transition hover:-translate-y-0.5">
                <span className="flex items-center gap-2 text-xs font-bold faint">
                  <span style={s.color ? { color: s.color } : undefined} className="inline-flex"><Icon name={s.icon} size={15} /></span>
                  {s.label}
                </span>
                <span className="text-2xl font-black" style={{ color: s.color ?? 'var(--text-1)' }}>{s.value}</span>
              </Link>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Status distribution — workshop widget, not for delivery workers */}
            {!deliveryOnly ? (
            <Card className="lg:col-span-1">
              <h2 className="section-title mb-3">{t('dash.tasksByStatus')}</h2>
              <ul className="space-y-2.5">
                {TASK_STATUSES.filter((s) => s !== 'draft' || (stats?.byStatus?.draft ?? 0) > 0).map((status) => {
                  const count = stats?.byStatus?.[status] ?? 0;
                  const max = Math.max(1, ...TASK_STATUSES.map((s) => stats?.byStatus?.[s] ?? 0));
                  // Stacked layout (label + count above, full-width bar below):
                  // long status names can never overlap the bar at any width.
                  return (
                    <li key={status} className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <StatusBadge status={status} label={t(`status.${status}`)} />
                        <span className="text-xs font-bold faint">{count}</span>
                      </div>
                      <span className="block h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-hover)' }} aria-hidden="true">
                        <span className="block h-full rounded-full" style={{ width: `${(count / max) * 100}%`, background: STATUS_BAR_COLORS[status] }} />
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-sm sm:grid-cols-4" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-xs faint">{t('dash.completedThisWeek')}</p>
                  <p className="text-lg font-black" style={{ color: 'var(--text-1)' }}>{stats?.completedThisWeek ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs faint">{t('dash.avgCompletion')}</p>
                  <p className="text-lg font-black" style={{ color: 'var(--text-1)' }}>{stats?.avgCompletionMs ? formatDuration(stats.avgCompletionMs, t) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs faint">{t('dash.avgRating')}</p>
                  <p className="text-lg font-black" style={{ color: 'var(--text-1)' }}>{stats?.avgRating != null ? `${stats.avgRating}/5` : '—'}</p>
                </div>
                <div>
                  <p className="text-xs faint">{t('dash.createdThisWeek')}</p>
                  <p className="text-lg font-black" style={{ color: 'var(--text-1)' }}>{stats?.createdThisWeek ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs faint">{t('dash.completedToday')}</p>
                  <p className="text-lg font-black" style={{ color: 'var(--st-approved)' }}>{stats?.completedToday ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs faint">{t('dash.completedThisMonth')}</p>
                  <p className="text-lg font-black" style={{ color: 'var(--st-approved)' }}>{stats?.completedThisMonth ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs faint">{t('dash.completedLast6Months')}</p>
                  <p className="text-lg font-black" style={{ color: 'var(--st-approved)' }}>{stats?.completedLast6Months ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs faint">{t('dash.completedThisYear')}</p>
                  <p className="text-lg font-black" style={{ color: 'var(--st-approved)' }}>{stats?.completedThisYear ?? 0}</p>
                </div>
              </div>
            </Card>
            ) : null}

            {/* Workers & tasks statistics (supervisor / admin) */}
            {(isSupervisor || isSuperAdmin) && stats ? (
              <Card className="min-w-0 lg:col-span-3">
                <h2 className="section-title mb-4">{t('dash.workersStats')}</h2>
                {/* One donut per task status share + the three headline rates */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  <Donut value={stats.total > 0 ? (by('scheduled') / stats.total) * 100 : 0} label={t('status.scheduled')} color="var(--st-scheduled)" size={100} />
                  <Donut value={stats.total > 0 ? (by('in_progress') / stats.total) * 100 : 0} label={t('status.in_progress')} color="var(--st-inprogress)" size={100} />
                  <Donut value={stats.total > 0 ? ((by('worker_reported_done') + by('awaiting_supervisor_review')) / stats.total) * 100 : 0} label={t('dash.reviewRate')} color="var(--st-review)" size={100} />
                  <Donut value={stats.total > 0 ? (by('completed_approved') / stats.total) * 100 : 0} label={t('dash.completionRate')} color="var(--st-approved)" size={100} />
                  <Donut value={stats.total > 0 ? (by('cancelled') / stats.total) * 100 : 0} label={t('status.cancelled')} color="var(--st-cancelled)" size={100} />
                  <Donut value={stats.total > 0 ? (stats.overdue / stats.total) * 100 : 0} label={t('dash.overdueTasks')} color="var(--st-overdue)" size={100} />
                </div>
                {(stats.perWorker?.length ?? 0) > 0 ? (
                  <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                    <h3 className="mb-3 text-sm font-extrabold" style={{ color: 'var(--text-1)' }}>{t('dash.workersTable')}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px] text-sm">
                        <thead>
                          <tr className="text-xs faint">
                            <th className="p-2 text-start font-bold">{t('dash.col.worker')}</th>
                            <th className="p-2 text-start font-bold">{t('dash.col.assigned')}</th>
                            <th className="p-2 text-start font-bold">{t('dash.col.completed')}</th>
                            <th className="p-2 text-start font-bold">{t('dash.col.late')}</th>
                            <th className="p-2 text-start font-bold">{t('dash.col.rating')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.perWorker!.map((w) => (
                            <tr key={w.userId} className="border-t" style={{ borderColor: 'var(--border)' }}>
                              <td className="break-words p-2 font-bold" style={{ color: 'var(--text-1)' }}>{w.name}</td>
                              <td className="p-2">{w.assigned}</td>
                              <td className="p-2">{w.completed}</td>
                              <td className="p-2" style={{ color: w.late > 0 ? 'var(--st-overdue)' : undefined }}>{w.late}</td>
                              <td className="p-2 font-bold">{w.avgRating != null ? `${w.avgRating}/5` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </Card>
            ) : null}

            {/* Due soon — workshop widget, not for delivery workers */}
            {!deliveryOnly ? (
            <Card>
              <h2 className="section-title mb-3">{t('dash.dueSoon')}</h2>
              {dueSoon.length === 0 ? (
                <p className="py-6 text-center text-sm faint">{t('dash.dueSoonEmpty')}</p>
              ) : (
                <ul className="space-y-2.5">
                  {dueSoon.map((task) => (
                    <li key={task.id}>
                      <Link href={`/tasks/${task.id}`} className="kbd-focus flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition hover:opacity-90" style={{ background: 'var(--surface-hover)' }}>
                        <span className="min-w-0 flex-1 break-words text-sm font-bold" style={{ color: 'var(--text-1)' }}>{task.title}</span>
                        <span className="text-xs faint">{formatDateTime(task.plannedEnd, locale)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            ) : null}

            {/* My workshops — not for delivery workers */}
            {!deliveryOnly ? (
            <Card>
              <h2 className="section-title mb-3">{isSuperAdmin ? t('admin.tab.workshops') : t('workshop.myWorkshops')}</h2>
              {isSuperAdmin ? (
                <ul className="space-y-2.5">
                  {workshops.slice(0, 6).map((w) => (
                    <li key={w.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-hover)' }}>
                      <span className="min-w-0 flex-1 break-words text-sm font-bold" style={{ color: 'var(--text-1)' }}>{w.name}</span>
                      <span className="text-xs faint">{t('workshop.membersCount', { n: w.memberCount ?? 0 })}</span>
                    </li>
                  ))}
                  {workshops.length === 0 ? <p className="py-6 text-center text-sm faint">{t('common.noResults')}</p> : null}
                </ul>
              ) : (
                <ul className="space-y-2.5">
                  {memberships.filter((m) => m.status === 'active').map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-hover)' }}>
                      <span className="min-w-0 flex-1 break-words text-sm font-bold" style={{ color: 'var(--text-1)' }}>{m.workshopName}</span>
                      <span className="chip text-[0.68rem]">{t(m.role === 'supervisor' ? 'common.supervisor' : m.role === 'delivery_worker' ? 'common.deliveryWorker' : 'common.worker')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            ) : null}
          </div>

          {/* Current deliveries / recent tasks */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">{deliveryOnly ? t('dash.currentDeliveries') : t('dash.recentTasks')}</h2>
              <Link href="/tasks" className="text-sm font-bold text-brand-500 hover:underline kbd-focus">{t('common.view')}</Link>
            </div>
            {recent.length === 0 ? (
              <EmptyState title={deliveryOnly ? t('dash.noDeliveries') : t('dash.noTasks')} hint={deliveryOnly ? undefined : isSupervisor ? t('task.empty.supervisorHint') : t('task.empty.workerHint')} />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {recent.map((task) => <TaskCard key={task.id} task={task} />)}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
