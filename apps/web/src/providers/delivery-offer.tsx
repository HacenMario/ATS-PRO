'use client';

/**
 * Live delivery-offer popup for delivery-worker accounts.
 *
 * When a supervisor / platform manager presses "طلب عامل التوصيل":
 *  - without a chosen worker  → EVERY delivery worker of the workshop gets the
 *    popup immediately on any open page (socket `delivery_offer`) and right
 *    after login (pending offers are fetched on mount);
 *  - with a chosen worker     → only that account receives it.
 * Each popup carries the workshop (as requester), the task title, the customer
 * details and the delivery fee, with "قبول التوصيل" and "تخطي الآن" actions and
 * a dedicated three-chime alert sound. "تخطي الآن" is per session only — the
 * offer stays pending in the task list.
 */

import { useCallback, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from './auth';
import { useLocale } from './locale';
import { useNotifications } from './notifications';
import { useToast } from './toast';
import { playDeliveryOfferSound } from '@/lib/sound';
import { formatNumber } from '@/lib/format';
import { Modal, Button } from '@/components/ui';
import { Icon } from '@/components/layout';
import type { Task } from '@ats/shared';

const SKIP_KEY = 'ats.deliveryOfferSkipped';

/** Per-USER session skip list — switching accounts must never inherit the
 * previous account's "تخطي الآن" choices. */
function readSkipped(userId: string): string[] {
  try { return JSON.parse(sessionStorage.getItem(`${SKIP_KEY}:${userId}`) ?? '[]') as string[]; } catch { return []; }
}

export function DeliveryOfferProvider({ children }: { children: ReactNode }) {
  const { user, isDeliveryWorker, isSupervisor, isSuperAdmin } = useAuth();
  const { t } = useLocale();
  const { socket } = useNotifications();
  const { push } = useToast();
  const router = useRouter();
  const [offers, setOffers] = useState<Task[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const deliveryOnly = Boolean(user && isDeliveryWorker && !isSupervisor && !isSuperAdmin);
  const userId = user?.id ?? null;

  // Reset the skip list whenever the signed-in account changes.
  useEffect(() => {
    setSkipped(userId ? readSkipped(userId) : []);
  }, [userId]);

  const skip = (taskId: string) => {
    if (!userId) return;
    setSkipped((prev) => {
      const next = prev.includes(taskId) ? prev : [...prev, taskId];
      try { sessionStorage.setItem(`${SKIP_KEY}:${userId}`, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  };

  const loadOffers = useCallback(async () => {
    if (!deliveryOnly) return;
    try {
      const res = await api<{ items: Task[] }>('/api/tasks?page=1&pageSize=25&sort=newest');
      setOffers(res.items.filter((task) => task.delivery?.status === 'pending'));
    } catch { /* offline — the next live event or reload retries */ }
  }, [deliveryOnly]);

  // Pending offers right at login / on returning to the app.
  useEffect(() => {
    if (!deliveryOnly) { setOffers([]); return; }
    void loadOffers();
  }, [deliveryOnly, loadOffers]);

  // Live offer on ANY open page: dedicated alert sound + refresh the list.
  useEffect(() => {
    if (!socket || !deliveryOnly) return;
    const onOffer = () => {
      playDeliveryOfferSound();
      void loadOffers();
    };
    socket.on('delivery_offer', onOffer);
    return () => { socket.off('delivery_offer', onOffer); };
  }, [socket, deliveryOnly, loadOffers]);

  const accept = async (taskId: string) => {
    setBusy(true);
    try {
      await api(`/api/tasks/${taskId}/delivery/accept`, { method: 'POST' });
      push('success', t('offer.acceptedToast'));
      setOffers((prev) => prev.filter((o) => o.id !== taskId));
      router.push(`/tasks/${taskId}`);
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
      void loadOffers();
    } finally {
      setBusy(false);
    }
  };

  const current = offers.find((o) => !skipped.includes(o.id));

  return (
    <>
      {children}
      {current ? (
        <Modal open onClose={() => skip(current.id)} title={t('offer.title')}>
          <p className="mb-3 text-sm muted">{t('offer.intro')}</p>
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--surface-hover)' }}>
            <Icon name="workshop" size={14} />
            <span className="text-xs font-bold faint">{t('offer.requester')}</span>
            <span dir="auto" className="text-sm font-extrabold [overflow-wrap:anywhere]" style={{ color: 'var(--text-1)' }}>{current.workshopName ?? ''}</span>
          </div>
          <h3 dir="auto" className="mb-3 text-base font-extrabold leading-snug [overflow-wrap:anywhere]" style={{ color: 'var(--text-1)' }}>{current.title}</h3>
          <dl className="mb-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs font-bold faint">{t('task.deliveryCustomer')}</dt>
              <dd dir="auto" className="mt-0.5 font-bold [overflow-wrap:anywhere]" style={{ color: 'var(--text-1)' }}>{current.delivery?.customerName}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-bold faint">{t('task.deliveryPhone')}</dt>
              <dd dir="ltr" className="mt-0.5 font-bold [overflow-wrap:anywhere]" style={{ color: 'var(--text-1)' }}>
                <a className="hover:underline" href={`tel:${current.delivery?.customerPhone ?? ''}`}>{current.delivery?.customerPhone}</a>
              </dd>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-xs font-bold faint">{t('task.deliveryAddress')}</dt>
              <dd dir="auto" className="mt-0.5 font-bold [overflow-wrap:anywhere]" style={{ color: 'var(--text-1)' }}>{current.delivery?.address}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-bold faint">{t('task.deliveryFee')}</dt>
              <dd className="mt-0.5 font-black" style={{ color: 'var(--st-approved)' }}>{formatNumber(current.delivery?.fee ?? 0)} {t('common.currency')}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => skip(current.id)}>{t('offer.skip')}</Button>
            <Button loading={busy} onClick={() => void accept(current.id)}>
              <Icon name="check" size={15} />{t('task.acceptDelivery')}
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
