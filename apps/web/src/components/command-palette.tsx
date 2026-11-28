'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useAppearance } from '@/providers/appearance';
import type { Task } from '@ats/shared';
import { STATUS_STYLE, StatusBadge } from '@/components/ui';
import { Icon } from '@/components/layout';
import { formatDateTime } from '@/lib/format';
import { LOCALE_LABELS } from '@ats/i18n';
import type { Locale } from '@ats/i18n';

type Result = {
  id: string;
  group: 'action' | 'page' | 'task';
  label: string;
  hint?: string;
  icon?: string;
  href?: string;
  run?: () => void;
  task?: Task;
};

/**
 * Global command palette (Ctrl/Cmd + K). Searches navigation, quick actions
 * and the task list; fully keyboard driven and styled like a native app.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale, setLocale } = useLocale();
  const { user, isSupervisor, isSuperAdmin } = useAuth();
  const { theme, setTheme } = useAppearance();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const canManage = isSupervisor || isSuperAdmin;

  const go = useCallback((href: string) => {
    onClose();
    router.push(href);
  }, [onClose, router]);

  const actions = useMemo<Result[]>(() => {
    const list: Result[] = [
      { id: 'a-new', group: 'action', label: t('task.action.newTask'), icon: 'plus', href: '/tasks/new' },
      { id: 'a-reports', group: 'action', label: t('nav.reports'), icon: 'reports', href: '/reports' },
      { id: 'a-calendar', group: 'action', label: t('nav.calendar'), icon: 'calendar', href: '/calendar' },
      { id: 'a-notif', group: 'action', label: t('nav.notifications'), icon: 'bell', href: '/notifications' },
      {
        id: 'a-theme',
        group: 'action',
        label: theme === 'dark' ? t('common.light') : t('common.dark'),
        icon: theme === 'dark' ? 'sun' : 'moon',
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'a-lang',
        group: 'action',
        label: `${t('common.language')}: ${LOCALE_LABELS[locale]}`,
        icon: 'globe',
        run: () => {
          const next = (['ar', 'fr', 'en'] as const).find((l) => l !== locale) as Locale;
          setLocale(next);
        },
      },
    ];
    if (canManage) list.unshift({ id: 'a-workers', group: 'action', label: t('nav.workers'), icon: 'workers', href: '/workers' });
    return list.filter((a) => a.id !== 'a-new' || canManage);
  }, [t, theme, setTheme, locale, setLocale, canManage]);

  const pages = useMemo<Result[]>(() => {
    const list: { href: string; label: string; icon: string; show: boolean }[] = [
      { href: '/dashboard', label: t('nav.dashboard'), icon: 'dashboard', show: true },
      { href: '/tasks', label: t('nav.tasks'), icon: 'tasks', show: true },
      { href: '/calendar', label: t('nav.calendar'), icon: 'calendar', show: true },
      { href: '/reports', label: t('nav.reports'), icon: 'reports', show: canManage },
      { href: '/workers', label: t('nav.workers'), icon: 'workers', show: canManage },
      { href: '/workshop', label: t('nav.workshop'), icon: 'workshop', show: canManage },
      { href: '/admin', label: t('nav.admin'), icon: 'admin', show: isSuperAdmin },
      { href: '/notifications', label: t('nav.notifications'), icon: 'bell', show: true },
      { href: '/profile', label: t('nav.profile'), icon: 'profile', show: true },
    ];
    return list.filter((p) => p.show).map((p) => ({ id: `p-${p.href}`, group: 'page', label: p.label, icon: p.icon, href: p.href }));
  }, [t, canManage, isSuperAdmin]);

  // Debounced task search
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) { setTasks((prev) => (prev.length ? [] : prev)); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await api<{ items: Task[] }>(`/api/tasks?q=${encodeURIComponent(q)}&pageSize=6&sort=dueAsc`, { noRetry: true });
        if (!cancelled) setTasks(res.items);
      } catch {
        if (!cancelled) setTasks([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, open]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (label: string) => !q || label.toLowerCase().includes(q);
    const taskResults: Result[] = tasks.map((task) => ({
      id: `t-${task.id}`,
      group: 'task',
      label: task.title,
      hint: [task.assigneeName, task.plannedEnd ? formatDateTime(task.plannedEnd, locale) : null].filter(Boolean).join(' · '),
      icon: 'tasks',
      href: `/tasks/${task.id}`,
      task,
    }));
    return [
      ...actions.filter((a) => match(a.label)),
      ...pages.filter((p) => match(p.label)),
      ...(q.length >= 2 ? taskResults : []),
    ];
  }, [actions, pages, tasks, query, locale]);

  // Live refs keep the keyboard handler stable without re-binding on every render.
  const resultsRef = useRef<Result[]>([]);
  resultsRef.current = results;
  const activeRef = useRef(0);
  activeRef.current = active;

  useEffect(() => {
    if (!open) return;
    setQuery((q) => (q === '' ? q : ''));
    setTasks((prev) => (prev.length ? [] : prev));
    setSearching((prev) => (prev ? false : prev));
    setActive((i) => (i === 0 ? i : 0));
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      const list = resultsRef.current;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(list.length - 1, i + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
      if (e.key === 'Enter') {
        const item = list[activeRef.current];
        if (item) { e.preventDefault(); if (item.run) item.run(); else if (item.href) go(item.href); }
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, go]);

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open || !user) return null;

  const grouped = (group: Result['group']) => results.filter((r) => r.group === group);
  const groupLabel = (group: Result['group']) => group === 'action' ? t('palette.actions') : group === 'page' ? t('palette.pages') : t('palette.tasks');

  let cursor = -1;

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center bg-black/45 px-3 pt-[8dvh] backdrop-blur-[5px] sm:px-5" role="dialog" aria-modal="true" aria-label={t('palette.title')}>
      <div className="glass-strong animate-modal-in flex max-h-[82dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.6rem]">
        <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ borderColor: 'var(--border)' }}>
          <Icon name="search" size={19} className="shrink-0 text-[var(--text-3)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('palette.placeholder')}
            aria-label={t('palette.placeholder')}
            className="min-w-0 flex-1 bg-transparent text-[0.98rem] font-semibold outline-none placeholder:text-[var(--text-3)]"
            style={{ color: 'var(--text-1)' }}
            autoComplete="off"
            spellCheck={false}
          />
          {searching ? <span className="text-[0.68rem] font-bold faint">{t('common.loading')}</span> : null}
          <button type="button" onClick={onClose} className="kbd hidden sm:inline-flex" aria-label={t('common.close')}>Esc</button>
        </div>

        <div ref={listRef} className="scroll-y min-h-[12rem] flex-1 overscroll-contain p-2">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'var(--surface-hover)' }}>
                <Icon name="search" size={22} />
              </span>
              <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{query ? t('palette.noResults') : t('palette.hint')}</p>
            </div>
          ) : (
            (['action', 'page', 'task'] as const).map((group) => {
              const items = grouped(group);
              if (items.length === 0) return null;
              return (
                <div key={group} className="mb-1">
                  <p className="px-2.5 pb-1 pt-1.5 text-[0.64rem] font-extrabold uppercase tracking-wider faint">{groupLabel(group)}</p>
                  {items.map((item) => {
                    cursor += 1;
                    const index = cursor;
                    const isActive = index === active;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-index={index}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => { if (item.run) item.run(); else if (item.href) go(item.href); }}
                        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-start transition"
                        style={{
                          background: isActive ? 'color-mix(in srgb, var(--color-brand-500) 12%, transparent)' : 'transparent',
                          boxShadow: isActive ? 'inset 0 0 0 1px color-mix(in srgb, var(--color-brand-500) 24%, transparent)' : 'none',
                        }}
                      >
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: item.task ? `color-mix(in srgb, ${STATUS_STYLE[item.task.status]} 13%, transparent)` : 'var(--surface-hover)', color: item.task ? STATUS_STYLE[item.task.status] : 'var(--text-2)' }}
                        >
                          <Icon name={item.icon ?? 'tasks'} size={17} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.88rem] font-bold" style={{ color: 'var(--text-1)' }}>{item.label}</span>
                          {item.hint ? <span className="block truncate text-[0.72rem] faint">{item.hint}</span> : null}
                        </span>
                        {item.task ? <StatusBadge status={item.task.status} label={t(`status.${item.task.status}`)} /> : <Icon name="chevron-left" size={15} className="shrink-0 text-[var(--text-3)] rtl:rotate-180" />}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-2 text-[0.66rem] font-bold faint" style={{ borderColor: 'var(--border)' }}>
          <span className="flex items-center gap-1.5"><span className="kbd">↑</span><span className="kbd">↓</span> {t('palette.navigate')}</span>
          <span className="flex items-center gap-1.5"><span className="kbd">↵</span> {t('palette.open')}</span>
          <span className="flex items-center gap-1.5"><span className="kbd">Esc</span> {t('common.close')}</span>
        </div>
      </div>
    </div>
  );
}
