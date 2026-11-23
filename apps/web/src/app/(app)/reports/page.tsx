'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useSilentRefresh } from '@/lib/use-silent-refresh';
import { Card, LoadingScreen, ErrorState, EmptyState, Donut } from '@/components/ui';
import { Icon } from '@/components/layout';
import { TrendChart, StatusBars, PriorityBars } from '@/components/reports';
import { formatDuration, formatNumber } from '@/lib/format';
import { exportCsv } from '@/lib/export-csv';
import type { TaskStats as TaskStatsData, TaskStatus } from '@ats/shared';

/** Reports & analytics — supervisors and the platform manager only.
 * Everything is computed from the same scoped /api/tasks/stats endpoint the
 * dashboard uses (trend, priority mix and on-time rate were added in v1.3). */
export default function ReportsPage() {
  const { user, isSupervisor, isSuperAdmin, hasWorkshop } = useAuth();
  const { t } = useLocale();
  const [stats, setStats] = useState<TaskStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const allowed = isSupervisor || isSuperAdmin;

  const load = useCallback(async (silent = false) => {
    if (!silent) setError('');
    try {
      setStats(await api<TaskStatsData>('/api/tasks/stats'));
      if (silent) setError('');
    } catch (err) {
      if (!silent) setError(t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useSilentRefresh(load);

  useEffect(() => {
    if (user && allowed) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, allowed]);

  useEffect(() => { document.title = t('pageTitles.reports'); }, [t]);

  if (!user) return <LoadingScreen label={t('common.loading')} />;
  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg py-8">
        <EmptyState icon={<Icon name="reports" size={42} />} title={t('reports.title')} hint={t('reports.restricted')} />
      </div>
    );
  }

  const by = (s: TaskStatus) => stats?.byStatus?.[s] ?? 0;

  const kpis: { label: string; value: string; icon: string; color?: string }[] = [
    { label: t('reports.kpi.total'), value: formatNumber(stats?.total ?? 0), icon: 'tasks' },
    { label: t('reports.kpi.completedMonth'), value: formatNumber(stats?.completedThisMonth ?? 0), icon: 'check', color: 'var(--st-approved)' },
    { label: t('reports.kpi.overdue'), value: formatNumber(stats?.overdue ?? 0), icon: 'clock', color: 'var(--st-overdue)' },
    { label: t('reports.kpi.pendingReviews'), value: formatNumber((by('worker_reported_done') + by('awaiting_supervisor_review'))), icon: 'flag', color: 'var(--st-review)' },
    { label: t('reports.kpi.avgRating'), value: stats?.avgRating != null ? `${stats.avgRating}/5` : '—', icon: 'flag', color: '#f59e0b' },
    { label: t('reports.kpi.avgCompletion'), value: stats?.avgCompletionMs ? formatDuration(stats.avgCompletionMs, t) : '—', icon: 'clock' },
    { label: t('reports.kpi.onTimeRate'), value: stats?.onTimeRate != null ? `${formatNumber(stats.onTimeRate)}%` : '—', icon: 'check', color: 'var(--st-approved)' },
  ];

  const doExport = () => {
    if (!stats) return;
    const rows: (string | number)[][] = [];
    rows.push([t('reports.kpi.total'), stats.total]);
    rows.push([t('reports.kpi.completedMonth'), stats.completedThisMonth]);
    rows.push([t('reports.kpi.overdue'), stats.overdue]);
    rows.push([t('reports.kpi.pendingReviews'), by('worker_reported_done') + by('awaiting_supervisor_review')]);
    rows.push([t('reports.kpi.avgRating'), stats.avgRating ?? '—']);
    rows.push([t('reports.kpi.avgCompletion'), stats.avgCompletionMs ? formatDuration(stats.avgCompletionMs, t) : '—']);
    rows.push([t('reports.kpi.onTimeRate'), stats.onTimeRate != null ? `${stats.onTimeRate}%` : '—']);
    rows.push([]);
    rows.push([t('reports.statusDist')]);
    for (const [status, count] of Object.entries(stats.byStatus)) rows.push([t(`status.${status}`), count]);
    rows.push([]);
    rows.push([t('reports.priorityDist')]);
    for (const [p, count] of Object.entries(stats.byPriority ?? {})) rows.push([t(`priority.${p}`), count]);
    rows.push([]);
    rows.push([t('reports.trend.title')]);
    rows.push([t('common.date'), t('reports.trend.created'), t('reports.trend.completed')]);
    for (const point of stats.trend ?? []) rows.push([point.weekStart.slice(0, 10), point.created, point.completed]);
    rows.push([]);
    rows.push([t('reports.workersTable')]);
    rows.push([
      t('dash.col.worker'), t('dash.col.assigned'), t('dash.col.completed'),
      t('reports.col.onTime'), t('dash.col.late'), t('dash.col.rating'),
    ]);
    for (const w of stats.perWorker ?? []) {
      rows.push([w.name, w.assigned, w.completed, w.onTime, w.late, w.avgRating ?? '—']);
    }
    exportCsv(`ats-report-${new Date().toISOString().slice(0, 10)}.csv`, [t('reports.title'), t('common.total')], rows);
  };

  const workers = stats?.perWorker ?? [];
  const onTimePct = (w: { completed: number; onTime: number }): number | null =>
    w.completed > 0 ? Math.round((w.onTime / w.completed) * 100) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight sm:text-2xl" style={{ color: 'var(--text-1)' }}>{t('reports.title')}</h1>
          <p className="mt-1 text-sm muted">{t('reports.subtitle')}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={doExport} disabled={!stats}>
          <Icon name="download" size={15} />{t('reports.exportCsv')}
        </button>
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load()} retryLabel={t('common.retry')} /> : null}
      {loading ? <LoadingScreen label={t('common.loading')} /> : (
        <>
          {!hasWorkshop && !isSuperAdmin ? (
            <EmptyState icon={<Icon name="workshop" size={42} />} title={t('dash.noWorkshop')} hint={t('reports.emptyHint')} />
          ) : (
            <>
              {/* KPI row */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
                {kpis.map((k) => (
                  <div key={k.label} className="stat-card">
                    <span className="flex items-center gap-2 text-xs font-bold faint">
                      <span className="inline-flex" style={k.color ? { color: k.color } : undefined}><Icon name={k.icon} size={15} /></span>
                      {k.label}
                    </span>
                    <span className="text-2xl font-black" style={{ color: k.color ?? 'var(--text-1)' }}>{k.value}</span>
                  </div>
                ))}
              </div>

              {/* Weekly trend */}
              <Card>
                <h2 className="section-title mb-4">{t('reports.trend.title')}</h2>
                <TrendChart
                  data={stats?.trend ?? []}
                  labels={{ created: t('reports.trend.created'), completed: t('reports.trend.completed'), empty: t('reports.trend.empty') }}
                />
              </Card>

              {/* Distributions */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <h2 className="section-title mb-4">{t('reports.statusDist')}</h2>
                  <StatusBars counts={stats?.byStatus ?? {}} />
                </Card>
                <Card>
                  <h2 className="section-title mb-4">{t('reports.priorityDist')}</h2>
                  <PriorityBars counts={stats?.byPriority ?? {}} />
                </Card>
              </div>

              {/* On-time donut + worker board */}
              <Card>
                <div className="grid items-center gap-5 sm:grid-cols-[auto_1fr]">
                  <Donut
                    value={stats?.onTimeRate ?? 0}
                    label={t('reports.kpi.onTimeRate')}
                    sublabel={stats?.onTimeRate != null ? undefined : t('reports.emptyHint')}
                    color="var(--st-approved)"
                    size={120}
                  />
                  <div className="min-w-0">
                    <h2 className="section-title mb-3">{t('reports.workersTable')}</h2>
                    {workers.length === 0 ? (
                      <p className="py-4 text-sm faint">{t('reports.emptyHint')}</p>
                    ) : (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th scope="col">{t('dash.col.worker')}</th>
                              <th scope="col">{t('dash.col.assigned')}</th>
                              <th scope="col">{t('dash.col.completed')}</th>
                              <th scope="col">{t('reports.col.onTime')}</th>
                              <th scope="col">{t('reports.col.onTimeRate')}</th>
                              <th scope="col">{t('dash.col.late')}</th>
                              <th scope="col">{t('dash.col.rating')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workers.map((w) => {
                              const pct = onTimePct(w);
                              return (
                                <tr key={w.userId}>
                                  <td data-label={t('dash.col.worker')} className="break-words font-bold" style={{ color: 'var(--text-1)' }}>{w.name}</td>
                                  <td data-label={t('dash.col.assigned')}>{formatNumber(w.assigned)}</td>
                                  <td data-label={t('dash.col.completed')}>{formatNumber(w.completed)}</td>
                                  <td data-label={t('reports.col.onTime')}>{formatNumber(w.onTime)}</td>
                                  <td data-label={t('reports.col.onTimeRate')}>
                                    <span className="inline-flex items-center gap-2">
                                      <span className="block h-1.5 w-14 overflow-hidden rounded-full" style={{ background: 'var(--surface-hover)' }} aria-hidden="true">
                                        <span className="chart-fill block h-full rounded-full" style={{ width: `${pct ?? 0}%`, background: pct != null && pct >= 80 ? 'var(--st-approved)' : pct != null && pct >= 50 ? '#d97706' : 'var(--st-overdue)' }} />
                                      </span>
                                      <span className="text-xs font-bold">{pct != null ? `${pct}%` : '—'}</span>
                                    </span>
                                  </td>
                                  <td data-label={t('dash.col.late')} style={{ color: w.late > 0 ? 'var(--st-overdue)' : undefined }}>{formatNumber(w.late)}</td>
                                  <td data-label={t('dash.col.rating')} className="font-bold">{w.avgRating != null ? `${w.avgRating}/5` : '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
