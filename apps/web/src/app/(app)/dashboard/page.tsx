'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useSilentRefresh } from '@/lib/use-silent-refresh';
import { useNotifications } from '@/providers/notifications';
import { Card, LoadingScreen, ErrorState, EmptyState, StatusBadge, RingGauge, Avatar } from '@/components/ui';
import { Icon } from '@/components/layout';
import { TaskCard } from '@/components/task-card';
import { AreaChart, HBar } from '@/components/charts';
import { formatDateTime, formatDuration, formatNumber } from '@/lib/format';
import type { Task, TaskStats as TaskStatsData, PublicWorkshop, TaskStatus } from '@ats/shared';
import { TASK_STATUSES } from '@ats/shared';

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

const STATUS_ICON: Record<string, string> = {
  draft: 'file',
  scheduled: 'clock',
  in_progress: 'play',
  worker_reported_done: 'flag',
  awaiting_supervisor_review: 'eye',
  completed_approved: 'check-circle',
  cancelled: 'cancel',
  overdue: 'alert-circle',
};

export default function DashboardPage() {
  const { user, isSupervisor, isSuperAdmin, isDeliveryWorker, hasWorkshop, memberships } = useAuth();
  const { locale, t } = useLocale();
  const { socketConnected } = useNotifications();
  const [stats, setStats] = useState<TaskStatsData | null>(null);
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
        .slice(0, 5);
      setDueSoon(soon);
      if (isSuperAdmin) {
        const ws = await api<{ items: PublicWorkshop[] }>('/api/workshops');
        setWorkshops(ws.items);
      }
      if (silent) setError('');
    } catch (err) {
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
      <div className="mx-auto max-w-lg py-10">
        <EmptyState
          icon={<Icon name="workshop" size={38} />}
          title={t('dash.noWorkshop')}
          hint={t('dash.noWorkshopHint')}
          action={<Link href="/workshop" className="btn btn-primary">{t('workshop.joinTitle')}</Link>}
        />
      </div>
    );
  }

  const deliveryOnly = isDeliveryWorker && !isSupervisor && !isSuperAdmin;
  const by = (s: TaskStatus) => stats?.byStatus?.[s] ?? 0;
  const total = stats?.total ?? 0;
  const completed = by('completed_approved');
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const productivity = Math.max(0, Math.min(100, Math.round(
    completionRate * 0.55 + (stats?.onTimeRate ?? 0) * 0.3 + (stats?.avgRating ? (stats.avgRating / 5) * 100 : 0) * 0.15,
  )));

  const insights = useMemo(() => {
    const list: { tone: 'danger' | 'warning' | 'info' | 'success'; icon: string; text: string; href?: string; action?: string }[] = [];
    if ((stats?.overdue ?? 0) > 0) list.push({ tone: 'danger', icon: 'alert-circle', text: t('dash.insight.overdue', { n: stats!.overdue }), href: '/tasks?status=overdue', action: t('dash.insight.review') });
    if ((stats?.pendingReviews ?? 0) > 0) list.push({ tone: 'warning', icon: 'flag', text: t('dash.insight.reviews', { n: stats!.pendingReviews }), href: '/tasks?status=worker_reported_done', action: t('dash.insight.approve') });
    if (dueSoon.length > 0) list.push({ tone: 'info', icon: 'clock', text: t('dash.insight.dueSoon', { n: dueSoon.length }), href: '/calendar', action: t('nav.calendar') });
    if (stats?.onTimeRate != null && stats.onTimeRate >= 80) list.push({ tone: 'success', icon: 'trending', text: t('dash.insight.onTime', { n: formatNumber(stats.onTimeRate) }) });
    if (stats?.avgRating != null) list.push({ tone: 'success', icon: 'star', text: t('dash.insight.rating', { n: stats.avgRating.toFixed(1) }) });
    if (list.length === 0) list.push({ tone: 'info', icon: 'sparkle', text: t('dash.insight.allClear') });
    return list.slice(0, 4);
  }, [stats, dueSoon.length, t]);

  const toneColor: Record<string, string> = {
    danger: 'var(--st-overdue)',
    warning: 'var(--st-inprogress)',
    info: 'var(--st-scheduled)',
    success: 'var(--st-approved)',
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('dash.greeting.morning') : hour < 18 ? t('dash.greeting.afternoon') : t('dash.greeting.evening');
  const todayLabel = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DZ' : locale === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  const deliveryStatCards = [
    { label: t('dash.deliveriesPending'), value: String(stats?.delivery?.pending ?? 0), icon: 'pin', href: '/tasks', color: 'var(--st-inprogress)' },
    { label: t('dash.deliveriesAccepted'), value: String(stats?.delivery?.accepted ?? 0), icon: 'return', href: '/tasks', color: 'var(--st-scheduled)' },
    { label: t('dash.deliveriesDone'), value: String(stats?.delivery?.delivered ?? 0), icon: 'check-circle', href: '/tasks', color: 'var(--st-approved)' },
    { label: t('dash.myDeliveries'), value: String(stats?.delivery?.myDelivered ?? 0), icon: 'flag', href: '/tasks', color: 'var(--st-reported)' },
  ];

  const kpis = deliveryOnly ? deliveryStatCards : [
    { label: t('dash.totalTasks'), value: String(total), icon: 'tasks', href: '/tasks', color: 'var(--color-brand-500)' },
    { label: t('status.in_progress'), value: String(by('in_progress') + by('overdue')), icon: 'play', href: '/tasks?status=in_progress', color: 'var(--st-inprogress)' },
    { label: t('dash.pendingReviews'), value: String(stats?.pendingReviews ?? 0), icon: 'flag', href: '/tasks?status=worker_reported_done', color: 'var(--st-review)' },
    { label: t('dash.overdueTasks'), value: String(stats?.overdue ?? 0), icon: 'alert-circle', href: '/tasks?status=overdue', color: 'var(--st-overdue)' },
  ];

  return (
    <div className="space-y-5">
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden rounded-[1.9rem] p-5 text-white sm:p-7" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #3730a3 38%, #4f46e5 68%, #0e7490 100%)', boxShadow: '0 30px 60px -30px rgba(49,46,129,.65)' }}>
        <div className="pointer-events-none absolute -end-16 -top-20 h-64 w-64 rounded-full" style={{ background: 'radial-gradient(circle, rgba(34,211,238,.45), transparent 65%)' }} aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-24 start-10 h-56 w-56 rounded-full" style={{ background: 'radial-gradient(circle, rgba(251,191,36,.28), transparent 65%)' }} aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)', backgroundSize: '28px 28px' }} aria-hidden="true" />

        <div className="relative grid items-center gap-6 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/12 px-3 py-1 text-[0.68rem] font-extrabold backdrop-blur">
                <span className={`h-1.5 w-1.5 rounded-full ${socketConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {socketConnected ? t('dash.online') : t('dash.offline')}
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.68rem] font-bold backdrop-blur">{todayLabel}</span>
            </div>
            <h1 className="text-2xl font-black leading-tight tracking-tight sm:text-3xl">
              {greeting}{', '}
              <span className="gradient-text" style={{ backgroundImage: 'linear-gradient(100deg,#fff,#a5f3fc)' }}>{user.name}</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">
              {isSuperAdmin ? t('dash.adminTitle') : isSupervisor ? t('dash.supervisorTitle') : isDeliveryWorker ? t('dash.deliveryTitle') : t('dash.workerTitle')}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {isSupervisor || isSuperAdmin ? (
                <>
                  <Link href="/tasks/new" className="btn btn-light btn-sm">
                    <Icon name="plus" size={15} />{t('task.action.newTask')}
                  </Link>
                  <Link href="/reports" className="btn btn-on-glass btn-sm">
                    <Icon name="chart" size={15} />{t('dash.viewReports')}
                  </Link>
                </>
              ) : (
                <Link href="/tasks" className="btn btn-on-glass btn-sm">
                  <Icon name="tasks" size={15} />{t('dash.allTasks')}
                </Link>
              )}
              <Link href="/calendar" className="btn btn-on-glass btn-sm">
                <Icon name="calendar" size={15} />{t('nav.calendar')}
              </Link>
            </div>
          </div>

          <div className="flex items-center justify-center gap-5 lg:justify-end">
            <RingGauge value={productivity} size={138} stroke={11} label={t('dash.productivity')} caption={t('dash.score')} color="#22d3ee" />
            <div className="hidden space-y-3 sm:block">
              {[
                { label: t('dash.completedToday'), value: String(stats?.completedToday ?? 0), color: '#34d399' },
                { label: t('dash.completedThisWeek'), value: String(stats?.completedThisWeek ?? 0), color: '#a5f3fc' },
                { label: t('dash.avgRating'), value: stats?.avgRating != null ? `${stats.avgRating.toFixed(1)}/5` : '—', color: '#fbbf24' },
              ].map((item) => (
                <div key={item.label} className="min-w-[8.5rem]">
                  <p className="text-[0.64rem] font-bold uppercase tracking-wider text-white/55">{item.label}</p>
                  <p className="text-xl font-black tabular-nums" style={{ color: item.color }}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-3 gap-2 border-t border-white/15 pt-4">
          {[
            { label: t('dash.totalTasks'), value: String(total) },
            { label: t('dash.workersCount'), value: String(stats?.workersCount ?? 0) },
            { label: t('dash.onTimeRate'), value: stats?.onTimeRate != null ? `${formatNumber(stats.onTimeRate)}%` : '—' },
          ].map((item) => (
            <div key={item.label} className="min-w-0">
              <p className="truncate text-[0.62rem] font-bold uppercase tracking-wide text-white/55">{item.label}</p>
              <p className="mt-0.5 text-lg font-black tabular-nums text-white">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      {error ? <ErrorState message={error} onRetry={() => void load()} retryLabel={t('common.retry')} /> : null}
      {loading ? <PageSkeletonFallback /> : (
        <>
          {/* ---------- KPI cards ---------- */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {kpis.map((s) => (
              <Link key={s.label} href={s.href} className="card card-hover group p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${s.color} 13%, transparent)`, color: s.color }}>
                    <Icon name={s.icon} size={18} />
                  </span>
                  <Icon name="arrow-up-right" size={15} className="text-[var(--text-3)] transition group-hover:text-brand-500" />
                </div>
                <p className="mt-3 text-[0.7rem] font-bold leading-tight muted">{s.label}</p>
                <p className="mt-0.5 text-2xl font-black tabular-nums leading-none" style={{ color: 'var(--text-1)' }}>{s.value}</p>
              </Link>
            ))}
          </div>

          {/* ---------- Insights + chart ---------- */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="section-title flex items-center gap-1.5"><Icon name="sparkle" size={17} className="text-brand-500" />{t('dash.insights')}</h2>
                <span className="chip !px-2 !py-0.5 text-[0.62rem]">{t('dash.smart')}</span>
              </div>
              <ul className="space-y-2">
                {insights.map((ins, i) => {
                  const color = toneColor[ins.tone];
                  return (
                    <li key={i} className="flex items-start gap-2.5 rounded-xl p-2.5" style={{ background: `color-mix(in srgb, ${color} 8%, transparent)`, border: '1px solid color-mix(in srgb, ' + color + ' 20%, transparent)' }}>
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
                        <Icon name={ins.icon} size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.8rem] font-bold leading-snug" style={{ color: 'var(--text-1)' }}>{ins.text}</p>
                        {ins.href ? (
                          <Link href={ins.href} className="mt-0.5 inline-flex items-center gap-1 text-[0.7rem] font-extrabold hover:underline" style={{ color }}>
                            {ins.action}<Icon name="chevron-right" size={11} className="rtl:rotate-180" />
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {isSupervisor || isSuperAdmin ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link href="/workers" className="btn btn-ghost btn-sm"><Icon name="workers" size={15} />{t('nav.workers')}</Link>
                  <Link href="/workshop" className="btn btn-ghost btn-sm"><Icon name="workshop" size={15} />{t('nav.workshop')}</Link>
                </div>
              ) : null}
            </Card>

            <Card className="lg:col-span-2">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="section-title">{t('dash.weeklyActivity')}</h2>
                  <p className="text-xs faint">{t('dash.weeklyActivityHint')}</p>
                </div>
                <div className="flex items-center gap-3 text-[0.68rem] font-bold">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-brand-500)' }} />{t('reports.trend.completed')}</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-accent-500)' }} />{t('reports.trend.created')}</span>
                </div>
              </div>
              <AreaChart values={(stats?.trend ?? []).map((p) => p.completed)} labels={(stats?.trend ?? []).map((p) => p.weekStart.slice(5, 10))} height={190} color="var(--color-brand-500)" />
              <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                <div><p className="text-[0.66rem] font-bold faint">{t('dash.createdThisWeek')}</p><p className="text-lg font-black" style={{ color: 'var(--text-1)' }}>{stats?.createdThisWeek ?? 0}</p></div>
                <div><p className="text-[0.66rem] font-bold faint">{t('dash.completedThisWeek')}</p><p className="text-lg font-black" style={{ color: 'var(--st-approved)' }}>{stats?.completedThisWeek ?? 0}</p></div>
                <div><p className="text-[0.66rem] font-bold faint">{t('dash.completionRate')}</p><p className="text-lg font-black" style={{ color: 'var(--color-brand-500)' }}>{completionRate}%</p></div>
              </div>
            </Card>
          </div>

          {/* ---------- Status + workload ---------- */}
          {!deliveryOnly ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="section-title">{t('dash.tasksByStatus')}</h2>
                  <Link href="/tasks" className="text-xs font-bold text-brand-500 hover:underline">{t('common.view')}</Link>
                </div>
                <ul className="space-y-2.5">
                  {TASK_STATUSES.filter((s) => s !== 'draft' || by('draft') > 0).map((status) => {
                    const count = by(status);
                    const max = Math.max(1, ...TASK_STATUSES.map((s) => by(s)));
                    return (
                      <li key={status} className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                          <StatusBadge status={status} label={t(`status.${status}`)} />
                          <span className="text-xs font-extrabold tabular-nums faint">{count}</span>
                        </div>
                        <span className="block h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-hover)' }} aria-hidden="true">
                          <span className="chart-fill block h-full rounded-full" style={{ width: `${(count / max) * 100}%`, background: STATUS_BAR_COLORS[status] }} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>

              {(isSupervisor || isSuperAdmin) && stats ? (
                <Card>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="section-title">{t('dash.workload')}</h2>
                    <span className="text-[0.68rem] font-bold faint">{t('dash.workloadHint')}</span>
                  </div>
                  {stats.perWorker.length === 0 ? (
                    <p className="py-8 text-center text-sm faint">{t('reports.emptyHint')}</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.perWorker.slice(0, 6).map((w) => (
                        <div key={w.userId} className="flex items-center gap-3">
                          <Avatar src={null} name={w.name} size={32} />
                          <div className="min-w-0 flex-1">
                            <HBar label={w.name} value={w.assigned} max={Math.max(1, ...stats.perWorker.map((x) => x.assigned))} color="var(--color-brand-500)" />
                            <p className="mt-0.5 text-[0.64rem] font-bold faint">{t('dash.col.completed')}: {w.completed} · {t('dash.col.late')}: {w.late}{w.avgRating != null ? ` · ${t('dash.col.rating')}: ${w.avgRating.toFixed(1)}` : ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ) : (
                <Card>
                  <h2 className="section-title mb-3">{t('dash.myProgress')}</h2>
                  <div className="space-y-4">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs font-bold"><span className="muted">{t('dash.completionRate')}</span><span style={{ color: 'var(--color-brand-500)' }}>{completionRate}%</span></div>
                      <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-hover)' }}>
                        <div className="h-full rounded-full" style={{ width: `${completionRate}%`, background: 'linear-gradient(90deg, var(--color-brand-500), var(--color-accent-500))' }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-2xl p-3" style={{ background: 'var(--surface-hover)' }}>
                        <p className="text-[0.66rem] font-bold faint">{t('dash.avgCompletion')}</p>
                        <p className="mt-1 text-base font-black" style={{ color: 'var(--text-1)' }}>{stats?.avgCompletionMs ? formatDuration(stats.avgCompletionMs, t) : '—'}</p>
                      </div>
                      <div className="rounded-2xl p-3" style={{ background: 'var(--surface-hover)' }}>
                        <p className="text-[0.66rem] font-bold faint">{t('dash.avgRating')}</p>
                        <p className="mt-1 text-base font-black" style={{ color: 'var(--text-1)' }}>{stats?.avgRating != null ? `${stats.avgRating.toFixed(1)}/5` : '—'}</p>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          ) : null}

          {/* ---------- Due soon + workshops ---------- */}
          {!deliveryOnly ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="section-title">{t('dash.dueSoon')}</h2>
                  <Link href="/calendar" className="text-xs font-bold text-brand-500 hover:underline">{t('nav.calendar')}</Link>
                </div>
                {dueSoon.length === 0 ? (
                  <p className="py-6 text-center text-sm faint">{t('dash.dueSoonEmpty')}</p>
                ) : (
                  <ul className="space-y-2">
                    {dueSoon.map((task) => (
                      <li key={task.id}>
                        <Link href={`/tasks/${task.id}`} className="flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-[var(--surface-hover)]">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${STATUS_BAR_COLORS[task.status]} 13%, transparent)`, color: STATUS_BAR_COLORS[task.status] }}>
                            <Icon name={STATUS_ICON[task.status] ?? 'tasks'} size={16} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.84rem] font-bold" style={{ color: 'var(--text-1)' }}>{task.title}</span>
                            <span className="block truncate text-[0.68rem] faint">{task.assigneeName} · {formatDateTime(task.plannedEnd, locale)}</span>
                          </span>
                          <Icon name="chevron-left" size={15} className="shrink-0 text-[var(--text-3)] rtl:rotate-180" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="section-title">{isSuperAdmin ? t('admin.tab.workshops') : t('workshop.myWorkshops')}</h2>
                  <Link href="/workshop" className="text-xs font-bold text-brand-500 hover:underline">{t('common.view')}</Link>
                </div>
                {isSuperAdmin ? (
                  <ul className="space-y-2">
                    {workshops.slice(0, 5).map((w) => (
                      <li key={w.id} className="flex items-center justify-between gap-2 rounded-xl p-2.5" style={{ background: 'var(--surface-hover)' }}>
                        <span className="min-w-0 truncate text-sm font-bold" style={{ color: 'var(--text-1)' }}>{w.name}</span>
                        <span className="shrink-0 text-[0.68rem] font-bold faint">{t('workshop.membersCount', { n: w.memberCount ?? 0 })}</span>
                      </li>
                    ))}
                    {workshops.length === 0 ? <p className="py-6 text-center text-sm faint">{t('common.noResults')}</p> : null}
                  </ul>
                ) : (
                  <ul className="space-y-2">
                    {memberships.filter((m) => m.status === 'active').map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-2.5" style={{ background: 'var(--surface-hover)' }}>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold" style={{ color: 'var(--text-1)' }}>{m.workshopName}</span>
                        <span className="chip !px-2 !py-0.5 text-[0.64rem]">{t(m.role === 'supervisor' ? 'common.supervisor' : m.role === 'delivery_worker' ? 'common.deliveryWorker' : 'common.worker')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          ) : null}

          {/* ---------- Recent tasks ---------- */}
          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="section-title">{deliveryOnly ? t('dash.currentDeliveries') : t('dash.recentTasks')}</h2>
              <Link href="/tasks" className="text-sm font-bold text-brand-500 hover:underline">{t('common.view')}</Link>
            </div>
            {recent.length === 0 ? (
              <EmptyState icon={<Icon name="tasks" size={34} />} title={deliveryOnly ? t('dash.noDeliveries') : t('dash.noTasks')} hint={deliveryOnly ? undefined : isSupervisor ? t('task.empty.supervisorHint') : t('task.empty.workerHint')} action={canCreate(isSupervisor, isSuperAdmin) ? <Link href="/tasks/new" className="btn btn-primary btn-sm"><Icon name="plus" size={15} />{t('task.action.newTask')}</Link> : undefined} />
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

function canCreate(isSupervisor: boolean, isSuperAdmin: boolean) {
  return isSupervisor || isSuperAdmin;
}

function PageSkeletonFallback() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="skeleton h-64 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl lg:col-span-2" />
      </div>
    </div>
  );
}
