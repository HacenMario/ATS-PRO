'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useSilentRefresh } from '@/lib/use-silent-refresh';
import { PageSkeleton, ErrorState, Sheet, StatusBadge, PriorityBadge, Avatar, Segmented } from '@/components/ui';
import { Icon, PageHeader } from '@/components/layout';
import { formatDateTime, formatNumber } from '@/lib/format';
import { isOverdue } from '@/components/task-card';
import type { Task } from '@ats/shared';

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

type Filter = 'all' | 'active' | 'done';

export default function CalendarPage() {
  const { user, isSupervisor, isSuperAdmin } = useAuth();
  const { locale, t } = useLocale();
  const router = useRouter();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(dateKey(today));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => { document.title = t('pageTitles.calendar'); }, [t]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError('');
    try {
      const res = await api<{ items: Task[] }>('/api/tasks?page=1&pageSize=100&sort=dueAsc');
      setTasks(res.items);
      if (silent) setError('');
    } catch (err) {
      if (!silent) setError(t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useSilentRefresh(load);

  useEffect(() => { if (user) void load(); }, [user?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekStart = locale === 'ar' ? 6 : 1;
  const weekdayLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DZ' : locale === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2024, 0, 1 + ((weekStart - 1 + i) % 7));
      return fmt.format(d);
    });
  }, [locale, weekStart]);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DZ' : locale === 'fr' ? 'fr-FR' : 'en-GB', { month: 'long', year: 'numeric' }).format(cursor),
    [cursor, locale],
  );

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() - weekStart + 7) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor, weekStart]);

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.plannedEnd) continue;
      if (filter === 'active' && (task.status === 'completed_approved' || task.status === 'cancelled')) continue;
      if (filter === 'done' && task.status !== 'completed_approved') continue;
      const key = dateKey(new Date(task.plannedEnd));
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    return map;
  }, [tasks, filter]);

  const selectedTasks = byDay.get(selected) ?? [];
  const monthTasks = tasks.filter((task) => task.plannedEnd && sameMonth(new Date(task.plannedEnd), cursor));
  const monthOverdue = monthTasks.filter((task) => isOverdue(task)).length;
  const monthDone = monthTasks.filter((task) => task.status === 'completed_approved').length;

  const openDay = (key: string) => {
    setSelected(key);
    if (window.matchMedia('(max-width: 1023px)').matches) setSheetOpen(true);
  };

  const goMonth = (delta: number) => {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  };

  const dayPanel = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[0.68rem] font-extrabold uppercase tracking-wide faint">{t('calendar.selectedDay')}</p>
          <p className="text-base font-black" style={{ color: 'var(--text-1)' }}>
            {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DZ' : locale === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseKey(selected))}
          </p>
        </div>
        <span className="chip !px-2 !py-0.5 text-[0.66rem]">{formatNumber(selectedTasks.length)}</span>
      </div>
      {selectedTasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-6 text-center" style={{ borderColor: 'var(--border-strong)' }}>
          <Icon name="calendar" size={26} className="mx-auto text-[var(--text-3)]" />
          <p className="mt-2 text-sm font-bold muted">{t('calendar.emptyDay')}</p>
          {(isSupervisor || isSuperAdmin) ? (
            <Link href="/tasks/new" className="btn btn-soft btn-sm mt-3"><Icon name="plus" size={14} />{t('task.action.newTask')}</Link>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-2">
          {selectedTasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => { setSheetOpen(false); router.push(`/tasks/${task.id}`); }}
                className="card card-hover flex w-full flex-col gap-2 p-3 text-start"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={task.status} label={t(`status.${task.status}`)} />
                  <PriorityBadge priority={task.priority} label={t(`priority.${task.priority}`)} />
                  {isOverdue(task) ? <span className="chip tint ms-auto" style={{ '--tint-color': 'var(--st-overdue)' } as React.CSSProperties}>{t('task.overdueBadge')}</span> : null}
                </div>
                <p dir="auto" className="text-[0.9rem] font-extrabold leading-snug" style={{ color: 'var(--text-1)' }}>{task.title}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] font-bold faint">
                  <span className="inline-flex items-center gap-1"><Icon name="clock" size={12} />{formatDateTime(task.plannedEnd, locale)}</span>
                  <span className="inline-flex items-center gap-1"><Avatar src={null} name={task.assigneeName ?? '?'} size={18} />{task.assigneeName ?? t('task.noAssignee')}</span>
                  {task.location ? <span className="inline-flex items-center gap-1"><Icon name="pin" size={12} />{task.location}</span> : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('nav.calendar')}
        subtitle={t('calendar.subtitle')}
        actions={
          <>
            {(isSupervisor || isSuperAdmin) ? <Link href="/tasks/new" className="btn btn-primary btn-sm"><Icon name="plus" size={15} />{t('task.action.newTask')}</Link> : null}
          </>
        }
      />

      {error ? <ErrorState message={error} onRetry={() => void load()} retryLabel={t('common.retry')} /> : null}
      {loading ? <PageSkeleton /> : (
        <div className="grid gap-4 lg:grid-cols-[1fr_21rem]">
          <div className="card p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => goMonth(-1)} className="icon-btn !h-9 !w-9" aria-label={t('calendar.prevMonth')}>
                  <Icon name="chevron-left" size={17} className="rtl:rotate-180" />
                </button>
                <button type="button" onClick={() => goMonth(1)} className="icon-btn !h-9 !w-9" aria-label={t('calendar.nextMonth')}>
                  <Icon name="chevron-right" size={17} className="rtl:rotate-180" />
                </button>
                <h2 className="ms-1 text-[0.98rem] font-black" style={{ color: 'var(--text-1)' }}>{monthLabel}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(dateKey(today)); }} className="btn btn-ghost btn-sm !px-2.5">{t('calendar.today')}</button>
                <Segmented<Filter>
                  value={filter}
                  onChange={setFilter}
                  ariaLabel={t('calendar.filter')}
                  size="sm"
                  options={[
                    { value: 'all', label: t('common.all') },
                    { value: 'active', label: t('calendar.active') },
                    { value: 'done', label: t('calendar.done') },
                  ]}
                />
              </div>
            </div>

            <div className="mb-3 grid grid-cols-3 gap-2 lg:hidden">
              <div className="rounded-xl p-2.5 text-center" style={{ background: 'var(--surface-hover)' }}>
                <p className="text-lg font-black leading-none" style={{ color: 'var(--text-1)' }}>{monthTasks.length}</p>
                <p className="mt-1 text-[0.62rem] font-bold faint">{t('calendar.monthTasks')}</p>
              </div>
              <div className="rounded-xl p-2.5 text-center" style={{ background: 'var(--surface-hover)' }}>
                <p className="text-lg font-black leading-none" style={{ color: 'var(--st-overdue)' }}>{monthOverdue}</p>
                <p className="mt-1 text-[0.62rem] font-bold faint">{t('calendar.monthOverdue')}</p>
              </div>
              <div className="rounded-xl p-2.5 text-center" style={{ background: 'var(--surface-hover)' }}>
                <p className="text-lg font-black leading-none" style={{ color: 'var(--st-approved)' }}>{monthDone}</p>
                <p className="mt-1 text-[0.62rem] font-bold faint">{t('calendar.monthDone')}</p>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {weekdayLabels.map((label, i) => (
                <div key={i} className="pb-1.5 text-center text-[0.62rem] font-extrabold uppercase tracking-wide faint">{label}</div>
              ))}
              {days.map((day) => {
                const key = dateKey(day);
                const inMonth = sameMonth(day, cursor);
                const list = byDay.get(key) ?? [];
                const isToday = key === dateKey(today);
                const isSelected = key === selected;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => openDay(key)}
                    className="flex min-h-[3.4rem] flex-col items-center rounded-xl border p-1 transition sm:min-h-[4.6rem]"
                    style={{
                      borderColor: isSelected ? 'color-mix(in srgb, var(--color-brand-500) 55%, transparent)' : 'transparent',
                      background: isSelected ? 'color-mix(in srgb, var(--color-brand-500) 10%, transparent)' : isToday ? 'color-mix(in srgb, var(--color-brand-500) 5%, transparent)' : 'transparent',
                      opacity: inMonth ? 1 : 0.36,
                    }}
                    aria-label={new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DZ' : locale === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long' }).format(day)}
                    aria-pressed={isSelected}
                  >
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[0.76rem] font-extrabold tabular-nums"
                      style={isToday
                        ? { background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))', color: '#fff' }
                        : { color: inMonth ? 'var(--text-1)' : 'var(--text-3)' }}
                    >
                      {day.getDate()}
                    </span>
                    {list.length > 0 ? (
                      <>
                        <span className="mt-1 flex items-center gap-0.5">
                          {list.slice(0, 3).map((task, i) => (
                            <span
                              key={task.id + i}
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: `var(--st-${task.status === 'in_progress' ? 'inprogress' : task.status === 'worker_reported_done' ? 'reported' : task.status === 'awaiting_supervisor_review' ? 'review' : task.status === 'completed_approved' ? 'approved' : task.status === 'overdue' ? 'overdue' : task.status === 'scheduled' ? 'scheduled' : task.status === 'cancelled' ? 'cancelled' : 'draft'})` }}
                              aria-hidden="true"
                            />
                          ))}
                        </span>
                        <span className="mt-0.5 hidden text-[0.58rem] font-black sm:block" style={{ color: 'var(--text-3)' }}>{list.length}</span>
                      </>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t pt-3 text-[0.66rem] font-bold faint" style={{ borderColor: 'var(--border)' }}>
              {(['scheduled', 'in_progress', 'completed_approved', 'overdue'] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1">
                  <span className="status-dot" style={{ background: `var(--st-${s === 'in_progress' ? 'inprogress' : s === 'completed_approved' ? 'approved' : s === 'scheduled' ? 'scheduled' : 'overdue'})` }} />
                  {t(`status.${s}`)}
                </span>
              ))}
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="card sticky top-24 p-4">{dayPanel}</div>
          </aside>
        </div>
      )}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t('calendar.dayTitle')}>
        {dayPanel}
      </Sheet>
    </div>
  );
}
