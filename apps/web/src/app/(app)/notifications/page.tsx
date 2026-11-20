'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useLocale } from '@/providers/locale';
import { useAuth } from '@/providers/auth';
import { useNotifications } from '@/providers/notifications';
import { useSilentRefresh } from '@/lib/use-silent-refresh';
import { useConfirm } from '@/providers/confirm';
import { useToast } from '@/providers/toast';
import { Button, EmptyState, LoadingScreen, ErrorState, Pagination, notifAccent } from '@/components/ui';
import { Icon } from '@/components/layout';
import { formatRelative, formatDateTime } from '@/lib/format';
import { translate } from '@ats/i18n';
import type { AppNotification } from '@ats/shared';

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
  const [onlyUnread, setOnlyUnread] = useState(false);
  // bump to force a list reload after destructive actions
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
        `/api/notifications?page=${page}&pageSize=20${onlyUnread ? '&unread=1' : ''}`,
      );
      setData(res);
    } catch (err) {
      // silent refresh failures are non-fatal — keep the current content
      if (!silent) setError(t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page, onlyUnread, refreshTick]);
  useSilentRefresh(load);

  useEffect(() => { void load(); }, [load]);

  const open = async (n: AppNotification) => {
    if (!n.readAt) await markRead(n.id);
    if (n.link) router.push(n.link);
    else void reload();
  };

  if (!user) return <LoadingScreen label={t('common.loading')} />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>{t('notif.pageTitle')}</h1>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 text-xs font-bold ${socketConnected ? 'text-emerald-500' : 'faint'}`}>
            <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
            {socketConnected ? t('dash.online') : t('common.reconnecting')}
          </span>
          {unread > 0 ? (
            <Button size="sm" variant="ghost" className="!px-2" onClick={() => void markAllRead().then(() => reload())} aria-label={t('notif.markAllRead')} title={t('notif.markAllRead')}>
              <Icon name="check" size={16} />
            </Button>
          ) : null}
          {data && data.items.length > 0 ? (
            <Button size="sm" variant="ghost" className="!px-2" onClick={() => void deleteAll()} aria-label={t('notif.clearAll')} title={t('notif.clearAll')}>
              <Icon name="trash" size={16} />
            </Button>
          ) : null}
        </div>
      </div>

      <label className="flex w-fit items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
        <input type="checkbox" checked={onlyUnread} onChange={(e) => { setOnlyUnread(e.target.checked); setPage(1); }} className="h-4 w-4 accent-[var(--color-brand-500)]" />
        {t('notif.unreadCount', { n: unread })}
      </label>

      {error ? <ErrorState message={error} onRetry={() => void load()} retryLabel={t('common.retry')} /> : null}
      {loading ? <LoadingScreen label={t('common.loading')} /> : (
        data && data.items.length > 0 ? (
          <>
            <ul className="space-y-2">
              {data.items.map((n) => {
                const title = translate(locale, `notif.title.${n.type}`, n.params);
                const body = translate(locale, `notif.body.${n.type}`, n.params);
                const accent = notifAccent(n.type);
                // Every notification gets a frame in its own accent color, so
                // types are distinguishable at a glance (unread = filled frame).
                const frameStyle: React.CSSProperties = n.readAt
                  ? { opacity: 0.75, borderColor: 'var(--border)' }
                  : {
                      borderColor: `color-mix(in srgb, ${accent} 55%, transparent)`,
                      borderInlineStartWidth: 3,
                      borderInlineStartColor: accent,
                      background: `color-mix(in srgb, ${accent} 8%, transparent)`,
                    };
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => void open(n)}
                      className="card kbd-focus flex w-full flex-col gap-1 p-4 text-start transition hover:-translate-y-0.5"
                      style={frameStyle}
                    >
                      <span className="flex items-center gap-2">
                        {!n.readAt ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} aria-hidden="true" /> : null}
                        <span dir="auto" className="text-[0.95rem] font-extrabold [overflow-wrap:anywhere]" style={{ color: 'var(--text-1)' }}>{title}</span>
                      </span>
                      <span dir="auto" className="text-sm leading-snug muted [overflow-wrap:anywhere]">{body}</span>
                      <span className="text-[0.7rem] faint" title={formatDateTime(n.createdAt, locale)}>{formatRelative(n.createdAt, locale)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <Pagination
              page={page}
              pages={data.pages}
              onPage={setPage}
              labels={{ page: t('common.page'), of: t('common.of'), previous: t('common.previous'), next: t('common.next') }}
            />
          </>
        ) : (
          <EmptyState icon={<Icon name="bell" size={40} />} title={t('notif.empty')} hint={t('dash.offline')} />
        )
      )}
    </div>
  );
}
