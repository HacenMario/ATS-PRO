'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useToast } from '@/providers/toast';
import { Button, Card, Field, Input, Textarea, Select, ErrorState, EmptyState, LoadingScreen } from '@/components/ui';
import { Icon } from '@/components/layout';

interface WorkshopData {
  workshop: {
    id: string; name: string; description: string; address: string; contactPhone: string;
    contactEmail: string; timezone: string; status: 'active' | 'suspended'; memberCount?: number;
  };
  myRole: 'worker' | 'delivery_worker' | 'supervisor' | null;
}

const TIMEZONES = ['Africa/Algiers', 'Africa/Tunis', 'Africa/Casablanca', 'Africa/Cairo', 'Europe/Paris', 'Europe/London', 'Asia/Riyadh', 'Asia/Dubai', 'UTC'];

export default function WorkshopPage() {
  const { user, isSupervisor, isSuperAdmin, memberships, refreshMe } = useAuth();
  const { t } = useLocale();
  const { push } = useToast();
  const [data, setData] = useState<WorkshopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', address: '', contactPhone: '', contactEmail: '', timezone: 'Africa/Algiers' });
  const [busy, setBusy] = useState(false);
  const [adminWorkshops, setAdminWorkshops] = useState<{ id: string; name: string }[]>([]);
  const [adminSelected, setAdminSelected] = useState('');

  useEffect(() => { document.title = t('pageTitles.workshop'); }, [t]);

  const currentMembership = memberships.find((m) => m.status === 'active');
  const canEdit = isSupervisor || isSuperAdmin;

  const load = useCallback(async () => {
    if (!currentMembership && !isSuperAdmin) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      if (isSuperAdmin && !currentMembership) {
        const all = await api<{ items: { id: string; name: string }[] }>('/api/workshops');
        setAdminWorkshops(all.items);
        const chosen = adminSelected || all.items[0]?.id || '';
        if (!chosen) { setData(null); setLoading(false); return; }
        const res = await api<WorkshopData>(`/api/workshops/${chosen}`);
        setData(res);
        setForm({
          name: res.workshop.name,
          description: res.workshop.description ?? '',
          address: res.workshop.address ?? '',
          contactPhone: res.workshop.contactPhone ?? '',
          contactEmail: res.workshop.contactEmail ?? '',
          timezone: res.workshop.timezone ?? 'Africa/Algiers',
        });
        setLoading(false);
        return;
      }
      const res = await api<WorkshopData>(`/api/workshops/${currentMembership?.workshopId}`);
      setData(res);
      setForm({
        name: res.workshop.name,
        description: res.workshop.description ?? '',
        address: res.workshop.address ?? '',
        contactPhone: res.workshop.contactPhone ?? '',
        contactEmail: res.workshop.contactEmail ?? '',
        timezone: res.workshop.timezone ?? 'Africa/Algiers',
      });
    } catch (err) {
      setError(t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMembership?.workshopId, isSuperAdmin]);

  useEffect(() => {
    if (user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, adminSelected]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const res = await api<{ status: string }>('/api/invitations/redeem', { method: 'POST', body: { code: joinCode.trim().toUpperCase() } });
      push('success', t(res.status === 'active' ? 'workshop.joinSuccess' : 'workshop.joinPending'));
      setJoinCode('');
      await refreshMe();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setJoining(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/workshops/${data?.workshop.id}`, { method: 'PATCH', body: form });
      push('success', t('workshop.saved'));
      void load();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <LoadingScreen label={t('common.loading')} />;
  if (loading) return <LoadingScreen label={t('common.loading')} />;

  // No workshop yet → join form
  if (!currentMembership && !isSuperAdmin) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <EmptyState icon={<Icon name="workshop" size={40} />} title={t('workshop.notJoined')} hint={t('workshop.notJoinedHint')} />
        <Card>
          <h2 className="section-title mb-3">{t('workshop.joinTitle')}</h2>
          <form onSubmit={join} className="flex flex-col gap-3">
            <Field label={t('workshop.joinCode')} required>
              <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} dir="ltr" placeholder="ATSO-XXXXXXXX" required />
            </Field>
            <Button type="submit" loading={joining}>{t('workshop.joinButton')}</Button>
          </form>
        </Card>
      </div>
    );
  }

  if (error) return <div className="mx-auto max-w-lg py-10"><ErrorState message={error} onRetry={() => void load()} retryLabel={t('common.retry')} /></div>;
  if (isSuperAdmin && adminWorkshops.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <EmptyState icon={<Icon name="workshop" size={40} />} title={t('admin.tab.workshops')} hint={t('admin.workshops.create')} />
      </div>
    );
  }
  if (!data) return <LoadingScreen label={t('common.loading')} />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>{t('workshop.pageTitle')}</h1>

      {isSuperAdmin && adminWorkshops.length > 0 ? (
        <div className="card p-4">
          <label className="mb-1.5 block text-sm font-bold" htmlFor="ws-admin-select">{t('admin.tab.workshops')}</label>
          <select
            id="ws-admin-select"
            value={adminSelected || adminWorkshops[0]?.id || ''}
            onChange={(e) => setAdminSelected(e.target.value)}
            className="input-base"
          >
            {adminWorkshops.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {data.workshop.status === 'suspended' ? (
        <div className="rounded-xl p-4 text-sm font-bold" style={{ background: 'color-mix(in srgb, var(--st-overdue) 10%, transparent)', color: 'var(--st-overdue)' }}>
          {t('workshop.suspendedNote')}
        </div>
      ) : null}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">{t('workshop.info')}</h2>
          <div className="flex items-center gap-2">
            <span className="chip">{t('workshop.membersCount', { n: data.workshop.memberCount ?? 0 })}</span>
            <span className={`chip ${data.workshop.status === 'active' ? '' : 'opacity-70'}`}>{t(data.workshop.status === 'active' ? 'common.active' : 'common.suspended')}</span>
          </div>
        </div>
        {!canEdit ? <p className="mb-3 text-xs faint">{t('workshop.readOnlyHint')}</p> : null}

        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label={t('workshop.name')} required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canEdit} required maxLength={120} />
          </Field>
          <Field label={t('workshop.address')}>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={!canEdit} maxLength={300} />
          </Field>
          <Field label={t('workshop.description')}>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={!canEdit} rows={3} maxLength={2000} className="sm:col-span-2" />
          </Field>
          <Field label={t('workshop.contactPhone')}>
            <Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} disabled={!canEdit} dir="ltr" maxLength={40} />
          </Field>
          <Field label={t('workshop.contactEmail')}>
            <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} disabled={!canEdit} dir="ltr" />
          </Field>
          <Field label={t('workshop.timezone')}>
            <Select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} disabled={!canEdit}>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </Select>
          </Field>
          <Field label={t('common.role')}>
            <Input value={data.myRole === 'supervisor' ? t('common.supervisor') : data.myRole === 'delivery_worker' ? t('common.deliveryWorker') : isSuperAdmin && data.myRole !== 'worker' ? t('common.superAdmin') : t('common.worker')} disabled readOnly />
          </Field>
          {canEdit ? (
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" loading={busy}>{t('common.save')}</Button>
            </div>
          ) : null}
        </form>
      </Card>

      {/* Secondary memberships (pending etc.) */}
      {memberships.some((m) => m.status === 'pending') ? (
        <Card>
          <h2 className="section-title mb-2">{t('members.pendingTitle')}</h2>
          <ul className="space-y-2">
            {memberships.filter((m) => m.status === 'pending').map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--surface-hover)' }}>
                <span className="font-bold">{m.workshopName}</span>
                <span className="chip">{t('common.pending')}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
