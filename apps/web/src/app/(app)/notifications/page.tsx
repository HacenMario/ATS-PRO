'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useLocale } from '@/providers/locale';
import { useAuth } from '@/providers/auth';
import { useNotifications } from '@/providers/notifications';
import { useSilentRefresh } from '@/lib/use-silent-refresh';
import { useConfirm } from '@/providers/confirm';
import { useToast } from '@/providers/toast';
import { Button, EmptyState, PageSkeleton, ErrorState, Pagination, Tabs, notifAccent } from '@/components/ui';
import { Icon, PageHeader } from '@/components/layout';
import { formatRelative, formatDateTime } from '@/lib/format';
import { translate } from '@ats/i18n';
import type { AppNotification } from '@ats/shared';

const NOTIF_ICON: Record<string, string> = {
  task_assigned: 'tasks',
  task_updated: 'edit',
  task_cancelled: 'cancel',
  task_due_soon: 'clock',
  task_overdue: 'alert-circle',
  task_reported: 'flag',
  task_approved: 'check-circle',
  task_returned: 'return',
  task_rescheduled: 'calendar',
  invitation_used: 'mail',
  membership_approved: 'check-circle',
  membership_removed: 'cancel',
  account_suspended: 'lock',
  account_activated: 'check-circle',
  task_comment: 'message',
  password_reset_request: 'key',
  password_changed: 'lock',
  password_changed_by_admin: 'key',
  worker_created: 'user-plus',
  delivery_ready: 'pin',
  delivery_accepted: 'check',
  delivery_done: 'check-circle',
  generic: 'bell',
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const { locale, t } = useLocale();
  const { unread, reload, markRead, markAllRead, socketConnected } = useNotifications();
  const { push } = useToast();
  const confirmAction = useConfirm();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AppNotification[]; pages: number; unread: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [refreshTick, setRefreshTick] = useState(0);

  const deleteAll = async () => {
    const ok = await confirmAction.confirm({ title: t('notif.clearAll'), message: t('notif.clearAllConfirm'), danger: true });
    if (!ok) return;
    try {
      await api('/api/notifications/all', { method: 'DELETE', body: {} });
      push('success', t('common.success'));
      setPage(1);
      setRefreshTick((tick) => tick + 1);
      void reload();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  useEffect(() => { document.title = t('pageTitles.notifications'); }, [t]);

  const load = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    if (!silent) setError('');
    try {
      const res = await api<{ items: AppNotification[]; pages: number; unread: number }>(
        `/api/notifications?page=${page}&pageSize=20${filter === 'unread' ? '&unread=1' : ''}`,
      );
      setData(res);
    } catch (err) {
      if (!silent) setError(t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page, filter, refreshTick]);
  useSilentRefresh(load);

  useEffect(() => { void load(); }, [load]);

  const open = async (n: AppNotification) => {
    if (!n.readAt) await markRead(n.id);
    if (n.link) router.push(n.link);
    else void reload();
  };

  const groups = useMemo(() => {
    const map = new Map<string, AppNotification[]>();
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    const keyOf = (iso: string) => {
      const d = new Date(iso);
      if (d.toDateString() === today.toDateString()) return 'today';
      if (d.toDateString() === yesterday.toDateString()) return 'yesterday';
      return 'earlier';
    };
    for (const n of data?.items ?? []) {
      const k = keyOf(n.createdAt);
      map.set(k, [...(map.get(k) ?? []), n]);
    }
    return map;
  }, [data]);

  const groupLabel = (key: string) => key === 'today' ? t('notif.today') : key === 'yesterday' ? t('notif.yesterday') : t('notif.earlier');

  if (!user) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={t('notif.pageTitle')}
        subtitle={t('notif.subtitle', { n: unread })}
        actions={
          <>
            <span className={`hidden items-center gap-1.5 text-[0.7rem] font-bold sm:flex ${socketConnected ? 'text-emerald-500' : 'text-[var(--text-3)]'}`}>
              <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
              {socketConnected ? t('dash.online') : t('common.reconnecting')}
            </span>
            {unread > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => void markAllRead().then(() => reload())}>
                <Icon name="check" size={15} />{t('notif.markAllRead')}
              </Button>
            ) : null}
            {data && data.items.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => void deleteAll()} aria-label={t('notif.clearAll')} title={t('notif.clearAll')}>
                <Icon name="trash" size={15} />
              </Button>
            ) : null}
          </>
        }
      />

      <Tabs
        value={filter}
        onChange={(v) => { setFilter(v); setPage(1); }}
        tabs={[
          { value: 'all', label: t('common.all') },
          { value: 'unread', label: t('notif.unread'), badge: unread || undefined },
        ]}
      />

      {error ? <ErrorState message={error} onRetry={() => void load()} retryLabel={t('common.retry')} /> : null}
      {loading ? <PageSkeleton /> : data && data.items.length > 0 ? (
        <>
          <div className="space-y-5">
            {['today', 'yesterday', 'earlier'].map((key) => {
              const items = groups.get(key);
              if (!items?.length) return null;
              return (
                <section key={key}>
                  <h2 className="mb-2 px-1 text-[0.68rem] font-extrabold uppercase tracking-wider faint">{groupLabel(key)}</h2>
                  <ul className="space-y-2">
                    {items.map((n) => {
                      const title = translate(locale, `notif.title.${n.type}`, n.params);
                      const body = translate(locale, `notif.body.${n.type}`, n.params);
                      const accent = notifAccent(n.type);
                      const icon = NOTIF_ICON[n.type] ?? 'bell';
                      return (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => void open(n)}
                            className="card card-hover flex w-full items-start gap-3 p-3.5 text-start"
                            style={n.readAt ? { opacity: 0.78 } : { borderColor: `color-mix(in srgb, ${accent} 40%, transparent)`, borderInlineStartWidth: 3, borderInlineStartColor: accent }}
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}>
                              <Icon name={icon} size={18} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-start justify-between gap-2">
                                <span dir="auto" className="min-w-0 text-[0.88rem] font-extrabold leading-snug [overflow-wrap:break-word]" style={{ color: 'var(--text-1)' }}>{title}</span>
                                {!n.readAt ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} aria-label={t('notif.unread')} /> : null}
                              </span>
                              <span dir="auto" className="mt-0.5 block text-[0.8rem] leading-relaxed muted [overflow-wrap:break-word]">{body}</span>
                              <span className="mt-1 block text-[0.66rem] font-bold faint" title={formatDateTime(n.createdAt, locale)}>{formatRelative(n.createdAt, locale)}</span>
                            </span>
                            <Icon name="chevron-left" size={15} className="mt-2 shrink-0 text-[var(--text-3)] rtl:rotate-180" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
          <Pagination
            page={page}
            pages={data.pages}
            onPage={setPage}
            labels={{ page: t('common.page'), of: t('common.of'), previous: t('common.previous'), next: t('common.next') }}
          />
        </>
      ) : (
        <EmptyState icon={<Icon name="bell" size={34} />} title={t('notif.empty')} hint={t('notif.emptyHint')} />
      )}
    </div>
  );
}
