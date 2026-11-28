'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useSilentRefresh } from '@/lib/use-silent-refresh';
import { useToast } from '@/providers/toast';
import { PageSkeleton, ErrorState, EmptyState, Segmented, Sheet, Button } from '@/components/ui';
import { Icon, PageHeader } from '@/components/layout';
import { TaskFilters, INITIAL_FILTERS, filtersToQuery, type TaskFilterState, statusLabel, priorityLabel } from '@/components/tasks';
import { TaskCard, TaskRow } from '@/components/task-card';
import { TaskBoard } from '@/components/task-board';
import type { Task } from '@ats/shared';
import { TASK_STATUSES } from '@ats/shared';
import type { WorkerOption } from '@/components/tasks';

type ViewMode = 'grid' | 'list' | 'board';
const VIEW_KEY = 'ats.tasks.view';

export default function TasksPage() {
  const { user, isSupervisor, isSuperAdmin } = useAuth();
  const { t, locale } = useLocale();
  const { push } = useToast();
  const [filters, setFilters] = useState<TaskFilterState>(INITIAL_FILTERS);
  const [view, setView] = useState<ViewMode>('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Task[]; pages: number; total: number } | null>(null);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Restore the preferred view + deep-linked status.
  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === 'list' || saved === 'board' || saved === 'grid') setView(saved);
    const from = new URLSearchParams(window.location.search).get('status');
    if (from && (TASK_STATUSES as readonly string[]).includes(from)) {
      setFilters({ ...INITIAL_FILTERS, status: from as TaskFilterState['status'] });
    }
  }, []);

  // Worker filter options: members of my supervised workshops.
  useEffect(() => {
    if (!(isSupervisor || isSuperAdmin)) return;
    (async () => {
      try {
        const workshops = await api<{ items: { id: string }[] }>('/api/workshops');
        const ids = workshops.items.map((w) => w.id);
        const seen = new Set<string>();
        const list: WorkerOption[] = [];
        for (const id of ids.slice(0, 20)) {
          const members = await api<{ items: { userId: string; name: string; email: string; role: string; status: string }[] }>(`/api/workshops/${id}/members`);
          for (const m of members.items) {
            if (m.status === 'active' && !seen.has(m.userId)) {
              seen.add(m.userId);
              list.push({ id: m.userId, name: m.name });
            }
          }
        }
        setWorkers(list);
      } catch { /* best effort */ }
    })();
  }, [isSupervisor, isSuperAdmin]);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    if (!silent) setError('');
    try {
      const pageSize = view === 'board' ? 100 : 12;
      const result = await api<{ items: Task[]; pages: number; total: number }>(`/api/tasks?${filtersToQuery(filters, page, pageSize)}`);
      setData(result);
    } catch (err) {
      if (!silent) setError(t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filters, page, view]);
  useSilentRefresh(load);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [filters, page, view, load]);

  useEffect(() => { setPage(1); }, [filters, view]);
  useEffect(() => { document.title = t('pageTitles.tasks'); }, [t]);
  useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);

  const changeView = (v: ViewMode) => { setView(v); setPage(1); };

  const boardAction = useCallback(async (task: Task, action: 'start' | 'report' | 'begin-review') => {
    try {
      await api(`/api/tasks/${task.id}/${action}`, { method: 'POST', body: {} });
      push('success', t('common.success'));
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
      throw err;
    }
  }, [push, t]);

  const emptyHint = useMemo(
    () => (isSupervisor || isSuperAdmin ? t('task.empty.supervisorHint') : t('task.empty.workerHint')),
    [isSupervisor, isSuperAdmin, t],
  );

  const activeFilters = useMemo(() => {
    const list: { key: keyof TaskFilterState; label: string; value: string }[] = [];
    if (filters.status !== 'all') list.push({ key: 'status', label: statusLabel(locale, filters.status), value: filters.status });
    if (filters.priority !== 'all') list.push({ key: 'priority', label: priorityLabel(locale, filters.priority), value: filters.priority });
    if (filters.workerId) list.push({ key: 'workerId', label: workers.find((w) => w.id === filters.workerId)?.name ?? t('task.filters.worker'), value: filters.workerId });
    if (filters.from) list.push({ key: 'from', label: `${t('task.filters.dateFrom')}: ${filters.from}`, value: filters.from });
    if (filters.to) list.push({ key: 'to', label: `${t('task.filters.dateTo')}: ${filters.to}`, value: filters.to });
    if (filters.mine) list.push({ key: 'mine', label: t('task.filters.mine'), value: '1' });
    return list;
  }, [filters, locale, workers, t]);

  const clearFilter = (key: keyof TaskFilterState) => {
    const next = { ...filters };
    if (key === 'status' || key === 'priority') next[key] = 'all';
    else if (key === 'mine') next.mine = false;
    else if (key === 'sort') next.sort = INITIAL_FILTERS.sort;
    else next[key] = '';
    setFilters(next);
  };

  const filterPanel = (
    <TaskFilters
      filters={filters}
      onChange={setFilters}
      workers={workers}
      showWorkerFilter={isSupervisor || isSuperAdmin}
      showMine={isSupervisor || isSuperAdmin}
    />
  );

  const viewToggle = (
    <Segmented<ViewMode>
      value={view}
      onChange={changeView}
      ariaLabel={t('tasks.view')}
      size="sm"
      options={[
        { value: 'grid', label: t('tasks.viewGrid'), icon: <Icon name="grid" size={14} /> },
        { value: 'list', label: t('tasks.viewList'), icon: <Icon name="list" size={14} /> },
        { value: 'board', label: t('tasks.viewBoard'), icon: <Icon name="board" size={14} /> },
      ]}
    />
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('task.pageTitle')}
        subtitle={data ? t('tasks.subtitle', { n: formatTotal(data.total) }) : undefined}
        actions={
          <>
            {isSupervisor || isSuperAdmin ? (
              <Link href="/tasks/new" className="btn btn-primary btn-sm"><Icon name="plus" size={15} />{t('task.action.newTask')}</Link>
            ) : null}
          </>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1 sm:max-w-xs">
          <div className="relative">
            <Icon name="search" size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder={t('task.searchPlaceholder')}
              aria-label={t('common.search')}
              className="input-base !ps-10"
              type="search"
            />
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm lg:hidden" onClick={() => setFiltersOpen(true)}>
          <Icon name="sliders" size={15} />
          {t('common.filter')}
          {activeFilters.length > 0 ? <span className="chip !bg-brand-500 !text-white !border-transparent !px-1.5 !py-0 text-[0.62rem]">{activeFilters.length}</span> : null}
        </button>
        <div className="ms-auto flex items-center gap-2">
          {viewToggle}
        </div>
      </div>

      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeFilters.map((f) => (
            <button key={f.key} type="button" onClick={() => clearFilter(f.key)} className="chip tint !py-1" style={{ '--tint-color': 'var(--color-brand-500)' } as React.CSSProperties}>
              {f.label}
              <Icon name="close" size={11} />
            </button>
          ))}
          <button type="button" onClick={() => setFilters({ ...INITIAL_FILTERS })} className="text-[0.7rem] font-extrabold text-brand-500 hover:underline kbd-focus">
            {t('common.resetFilters')}
          </button>
        </div>
      ) : null}

      {/* Desktop filters */}
      <div className="hidden lg:block">{filterPanel}</div>
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t('task.filters.title')} wide>
        {filterPanel}
        <div className="mt-3 flex gap-2">
          <Button variant="ghost" block onClick={() => setFilters(INITIAL_FILTERS)}>{t('common.resetFilters')}</Button>
          <Button block onClick={() => setFiltersOpen(false)}>{t('tasks.showResults')}</Button>
        </div>
      </Sheet>

      {error ? <ErrorState message={error} onRetry={() => void load()} retryLabel={t('common.retry')} /> : null}

      {loading ? <PageSkeleton /> : data && data.items.length > 0 ? (
        <>
          {view === 'board' ? (
            <TaskBoard tasks={data.items} onAction={boardAction} onRefresh={() => void load(true)} />
          ) : view === 'list' ? (
            <div className="flex flex-col gap-2">
              {data.items.map((task) => <TaskRow key={task.id} task={task} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.items.map((task) => <TaskCard key={task.id} task={task} />)}
            </div>
          )}

          {view !== 'board' && data.pages > 1 ? (
            <nav className="flex items-center justify-center gap-2 pt-2" aria-label="Pagination">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <Icon name="chevron-left" size={15} className="rtl:rotate-180" />
                <span className="hidden sm:inline">{t('common.previous')}</span>
              </Button>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-extrabold" style={{ color: 'var(--text-2)' }}>
                {t('common.page')} {page} {t('common.of')} {data.pages}
              </span>
              <Button variant="ghost" size="sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
                <span className="hidden sm:inline">{t('common.next')}</span>
                <Icon name="chevron-right" size={15} className="rtl:rotate-180" />
              </Button>
            </nav>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={<Icon name="tasks" size={36} />}
          title={t('task.empty.title')}
          hint={emptyHint}
          action={isSupervisor || isSuperAdmin ? <Link href="/tasks/new" className="btn btn-primary btn-sm"><Icon name="plus" size={15} />{t('task.action.newTask')}</Link> : <Button variant="ghost" size="sm" onClick={() => setFilters(INITIAL_FILTERS)}>{t('common.resetFilters')}</Button>}
        />
      )}
    </div>
  );
}

function formatTotal(n: number): string {
  return new Intl.NumberFormat().format(n);
}
