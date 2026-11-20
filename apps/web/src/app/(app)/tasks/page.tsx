'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useSilentRefresh } from '@/lib/use-silent-refresh';
import { LoadingScreen, ErrorState, EmptyState } from '@/components/ui';
import { Icon } from '@/components/layout';
import { TaskFilters, TaskList, INITIAL_FILTERS, filtersToQuery, type TaskFilterState } from '@/components/tasks';
import type { Task } from '@ats/shared';
import { TASK_STATUSES } from '@ats/shared';
import type { WorkerOption } from '@/components/tasks';

export default function TasksPage() {
  const { user, isSupervisor, isSuperAdmin } = useAuth();
  const { t } = useLocale();
  const [filters, setFilters] = useState<TaskFilterState>(INITIAL_FILTERS);

  // Deep-link support: status cards on the dashboard link to /tasks?status=…
  // (read once from the URL on mount to avoid suspense requirements).
  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get('status');
    if (from && (TASK_STATUSES as readonly string[]).includes(from)) {
      setFilters({ ...INITIAL_FILTERS, status: from as TaskFilterState['status'] });
    }
  }, []);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Task[]; pages: number; total: number } | null>(null);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      const result = await api<{ items: Task[]; pages: number; total: number }>(`/api/tasks?${filtersToQuery(filters, page)}`);
      setData(result);
    } catch (err) {
      // silent refresh failures are non-fatal — keep the current content
      if (!silent) setError(t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filters, page]);
  useSilentRefresh(load);

  // Debounced reload on filters change
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [filters, page, load]);

  useEffect(() => { setPage(1); }, [filters]);
  useEffect(() => { document.title = t('pageTitles.tasks'); }, [t]);

  const emptyHint = useMemo(
    () => (isSupervisor || isSuperAdmin ? t('task.empty.supervisorHint') : t('task.empty.workerHint')),
    [isSupervisor, isSuperAdmin, t],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>{t('task.pageTitle')}</h1>
        {isSupervisor || isSuperAdmin ? (
          <Link href="/tasks/new" className="btn btn-primary btn-sm"><Icon name="plus" size={15} />{t('task.action.newTask')}</Link>
        ) : null}
      </div>

      <TaskFilters
        filters={filters}
        onChange={setFilters}
        workers={workers}
        showWorkerFilter={isSupervisor || isSuperAdmin}
        showMine={isSupervisor || isSuperAdmin}
      />

      {error ? <ErrorState message={error} onRetry={() => void load()} retryLabel={t('common.retry')} /> : null}
      {loading ? <LoadingScreen label={t('common.loading')} /> : (
        data && data.items.length > 0 ? (
          <TaskList data={data} page={page} onPage={setPage} />
        ) : (
          <EmptyState title={t('task.empty.title')} hint={emptyHint} />
        )
      )}
    </div>
  );
}
