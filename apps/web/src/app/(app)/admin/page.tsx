'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useSilentRefresh } from '@/lib/use-silent-refresh';
import { useConfirm } from '@/providers/confirm';
import { useToast } from '@/providers/toast';
import { Button, Card, Field, Input, Select, Textarea, Modal, Segmented, ErrorState, EmptyState, LoadingScreen, Pagination } from '@/components/ui';
import { Icon } from '@/components/layout';
import { formatDateTime, formatDate } from '@/lib/format';
import { AccountFormFields, EMPTY_ACCOUNT_FORM, type AccountFormValues } from '@/components/account-form';
import { LOCALE_LABELS, LOCALES } from '@ats/i18n';
import type { Locale, PlatformSettings } from '@ats/shared';
import { translate } from '@ats/i18n';

interface AdminUser {
  id: string; name: string; email: string; role: 'worker' | 'supervisor' | 'super_admin'; status: string;
  createdAt: string; lastLoginAt: string | null;
  workshops: { workshopId: string; workshopName: string; role: string }[];
}

interface AdminWorkshop {
  id: string; name: string; description: string; address: string; contactPhone: string; contactEmail: string;
  status: 'active' | 'suspended'; memberCount: number; activeTaskCount: number; overdueTaskCount: number; createdAt: string;
}

interface AdminInvite {
  id: string; code: string; role: string; autoJoin: boolean; maxUses: number; uses: number;
  revoked: boolean; expired: boolean; expiresAt: string; createdAt: string;
  workshopName: string; createdByName: string;
}

interface ActivityRow {
  id: string; action: string; actorName: string; actorEmail: string; targetType: string; targetId: string | null;
  meta: Record<string, string | number | boolean | null>; createdAt: string; ip: string;
}

export default function AdminPage() {
  const { user, isSuperAdmin, loading, refreshMeta } = useAuth();
  const { locale, t } = useLocale();
  const { push } = useToast();
  const confirmAction = useConfirm();
  const router = useRouter();

  const [tab, setTab] = useState<'workshops' | 'users' | 'invites' | 'activity' | 'settings'>('workshops');
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');

  // users
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [userPages, setUserPages] = useState(1);
  // workshops
  const [workshops, setWorkshops] = useState<AdminWorkshop[]>([]);
  const [createWsOpen, setCreateWsOpen] = useState(false);
  const [newWs, setNewWs] = useState({ name: '', description: '', address: '', timezone: 'Africa/Algiers' });
  // activity
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityPage, setActivityPage] = useState(1);
  const [activityPages, setActivityPages] = useState(1);
  // settings
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  // direct password modal (replaces reset-link)
  const [pwModal, setPwModal] = useState<{ user: AdminUser; password: string } | null>(null);
  // create account modal — 'worker' | 'supervisor' presets the platform role
  const [createAccRole, setCreateAccRole] = useState<null | 'worker' | 'delivery_worker' | 'supervisor'>(null);
  const [newAccount, setNewAccount] = useState<AccountFormValues>({ ...EMPTY_ACCOUNT_FORM });
  const [newAccountWorkshopId, setNewAccountWorkshopId] = useState('');
  // edit account modal
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '' });
  // invite codes management
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [inviteEdit, setInviteEdit] = useState<{ invite: AdminInvite; maxUses: number; expiresInDays: number; autoJoin: boolean } | null>(null);

  useEffect(() => { document.title = t('pageTitles.admin'); }, [t]);

  useEffect(() => {
    if (!loading && !isSuperAdmin) router.replace('/dashboard');
  }, [loading, isSuperAdmin, router]);

  const loadTab = useCallback(async (silent = false) => {
    // The settings tab renders an editable form — a silent refresh would clobber
    // in-progress edits, so it is never auto-refreshed.
    if (silent && tab === 'settings') return;
    if (!silent) setError('');
    if (!silent) setLoadingData(true);
    try {
      if (tab === 'workshops') {
        const res = await api<{ items: AdminWorkshop[] }>('/api/workshops');
        setWorkshops(res.items);
      } else if (tab === 'users') {
        const res = await api<{ items: AdminUser[]; pages: number }>(`/api/admin/users?page=${userPage}&pageSize=20&q=${encodeURIComponent(userQuery)}`);
        setUsers(res.items);
        setUserPages(res.pages);
      } else if (tab === 'activity') {
        const res = await api<{ items: ActivityRow[]; pages: number }>(`/api/admin/activity?page=${activityPage}&pageSize=25`);
        setActivity(res.items);
        setActivityPages(res.pages);
      } else if (tab === 'settings') {
        const res = await api<{ settings: PlatformSettings }>('/api/admin/settings');
        setSettings(res.settings);
      } else if (tab === 'invites') {
        const res = await api<{ items: AdminInvite[] }>('/api/admin/invitations');
        setInvites(res.items);
      }
    } catch (err) {
      // silent refresh failures are non-fatal — keep the current content
      if (!silent) setError(t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setLoadingData(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, userPage, activityPage]);
  useSilentRefresh(loadTab);

  useEffect(() => { if (isSuperAdmin) void loadTab(); }, [isSuperAdmin, loadTab]);
  useEffect(() => { setUserPage(1); }, [userQuery]);

  if (loading || !user) return <LoadingScreen label={t('common.loading')} />;
  if (!isSuperAdmin) return <div className="py-10"><ErrorState message={t('errors.forbidden')} /></div>;

  const setResponseStatus = async (w: AdminWorkshop, status: 'active' | 'suspended') => {
    const ok = await confirmAction.confirm({ title: t('confirm.title'), message: t('admin.workshops.confirmSuspend'), danger: status === 'suspended' });
    if (!ok) return;
    try {
      await api(`/api/admin/workshops/${w.id}`, { method: 'PATCH', body: { status } });
      push('success', t('common.success'));
      void loadTab();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  const createWorkshop = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/workshops', { method: 'POST', body: { ...newWs, contactPhone: '', contactEmail: '', status: 'active' } });
      push('success', t('common.success'));
      setCreateWsOpen(false);
      setNewWs({ name: '', description: '', address: '', timezone: 'Africa/Algiers' });
      void loadTab();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  const setUserStatus = async (u: AdminUser, status: 'active' | 'suspended') => {
    const ok = await confirmAction.confirm({ title: t('confirm.title'), message: t('admin.users.confirmSuspend', { name: u.name }), danger: status === 'suspended' });
    if (!ok) return;
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { status } });
      push('success', t('admin.users.statusChanged'));
      void loadTab();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  const setUserRole = async (u: AdminUser, role: string) => {
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { role } });
      push('success', t('admin.users.roleChanged'));
      void loadTab();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  const setWorkerPassword = async () => {
    if (!pwModal) return;
    try {
      await api(`/api/admin/users/${pwModal.user.id}/set-password`, { method: 'POST', body: { password: pwModal.password } });
      push('success', t('common.success'));
      setPwModal(null);
      void loadTab();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createAccRole || newAccount.password !== newAccount.confirm) return;
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: {
          name: newAccount.name.trim(),
          email: newAccount.email.trim(),
          password: newAccount.password,
          workshopId: newAccountWorkshopId,
          role: createAccRole,
          gender: newAccount.gender || undefined,
          birthDate: newAccount.birthDate || undefined,
          bloodType: newAccount.bloodType || undefined,
          recoveryPhrase: newAccount.recoveryPhrase.trim(),
          avatar: newAccount.avatar ?? undefined,
        },
      });
      push('success', t('admin.users.created'));
      setCreateAccRole(null);
      setNewAccount({ ...EMPTY_ACCOUNT_FORM });
      setNewAccountWorkshopId('');
      void loadTab();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  const saveEditedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    try {
      await api(`/api/admin/users/${editUser.id}`, {
        method: 'PATCH',
        body: { name: editForm.name.trim(), email: editForm.email.trim() },
      });
      push('success', t('admin.users.updated'));
      setEditUser(null);
      void loadTab();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  const deleteUser = async (u: AdminUser) => {
    const ok = await confirmAction.confirm({ title: t('admin.users.deleteTitle'), message: t('admin.users.deleteConfirm', { name: u.name }), danger: true });
    if (!ok) return;
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'DELETE', body: {} });
      push('success', t('admin.users.deleted'));
      void loadTab();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  const updateInvite = async (id: string, body: Record<string, unknown>, successMsg: string) => {
    try {
      await api(`/api/admin/invitations/${id}`, { method: 'PATCH', body });
      push('success', successMsg);
      setInviteEdit(null);
      void loadTab();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  const deleteInvite = async (inv: AdminInvite) => {
    const ok = await confirmAction.confirm({ title: t('confirm.title'), message: t('admin.invites.confirmDelete'), danger: true });
    if (!ok) return;
    try {
      await api(`/api/admin/invitations/${inv.id}`, { method: 'DELETE', body: {} });
      push('success', t('admin.invites.deleted'));
      void loadTab();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  const clearActivity = async () => {
    const ok = await confirmAction.confirm({ title: t('confirm.title'), message: t('admin.activity.clearConfirm'), danger: true });
    if (!ok) return;
    try {
      await api('/api/admin/activity', { method: 'DELETE', body: {} });
      push('success', t('admin.activity.cleared'));
      void loadTab();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSettingsBusy(true);
    try {
      const res = await api<{ settings: PlatformSettings }>('/api/admin/settings', { method: 'PUT', body: settings });
      setSettings(res.settings);
      push('success', t('admin.settings.saved'));
      void refreshMeta();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setSettingsBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>{t('admin.pageTitle')}</h1>

      <Segmented
        value={tab}
        onChange={setTab}
        ariaLabel={t('admin.pageTitle')}
        options={[
          { value: 'workshops', label: t('admin.tab.workshops') },
          { value: 'users', label: t('admin.tab.users') },
          { value: 'invites', label: t('admin.invites.title') },
          { value: 'activity', label: t('admin.tab.activity') },
          { value: 'settings', label: t('admin.tab.settings') },
        ]}
      />

      {error ? <ErrorState message={error} onRetry={() => void loadTab()} retryLabel={t('common.retry')} /> : null}

      {loadingData ? <LoadingScreen label={t('common.loading')} /> : (
        <>
          {/* ---------------- Workshops ---------------- */}
          {tab === 'workshops' ? (
            <Card>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="section-title">{t('admin.workshops.count', { n: workshops.length })}</h2>
                <Button size="sm" onClick={() => setCreateWsOpen(true)}><Icon name="plus" size={15} />{t('admin.workshops.create')}</Button>
              </div>
              {workshops.length === 0 ? (
                <EmptyState title={t('common.noResults')} />
              ) : (
                <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {workshops.map((w) => (
                    <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-extrabold" style={{ color: 'var(--text-1)' }}>{w.name}</p>
                        <p className="break-words text-xs faint">
                          {t('workshop.membersCount', { n: w.memberCount })} · {w.activeTaskCount} {t('dash.activeTasks')} · {w.overdueTaskCount} {t('dash.overdueTasks')}
                          {' · '}{t('common.createdAt')} {formatDate(w.createdAt, locale)}
                        </p>
                      </div>
                      <span className={`chip ${w.status === 'active' ? '' : 'opacity-80'}`} style={w.status === 'suspended' ? { color: 'var(--st-overdue)', borderColor: 'var(--st-overdue)' } : undefined}>
                        {t(w.status === 'active' ? 'common.active' : 'common.suspended')}
                      </span>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => router.push('/tasks')}>{t('admin.workshops.open')}</Button>
                        {w.status === 'active' ? (
                          <Button size="sm" variant="danger" onClick={() => void setResponseStatus(w, 'suspended')}>{t('admin.workshops.suspendAction')}</Button>
                        ) : (
                          <Button size="sm" onClick={() => void setResponseStatus(w, 'active')}>{t('admin.workshops.activateAction')}</Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {/* ---------------- Users ---------------- */}
          {tab === 'users' ? (
            <Card>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center faint" aria-hidden="true"><Icon name="search" size={16} /></span>
                  <Input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder={t('admin.users.search')} className="!ps-9" aria-label={t('common.search')} />
                </div>
                <Button size="sm" onClick={() => { setNewAccount({ ...EMPTY_ACCOUNT_FORM }); setNewAccountWorkshopId(workshops[0]?.id ?? ''); setCreateAccRole('worker'); }}>
                  <Icon name="plus" size={15} />{t('admin.users.createWorker')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setNewAccount({ ...EMPTY_ACCOUNT_FORM }); setNewAccountWorkshopId(workshops[0]?.id ?? ''); setCreateAccRole('delivery_worker'); }}>
                  <Icon name="pin" size={15} />{t('admin.users.createDeliveryWorker')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setNewAccount({ ...EMPTY_ACCOUNT_FORM }); setNewAccountWorkshopId(workshops[0]?.id ?? ''); setCreateAccRole('supervisor'); }}>
                  <Icon name="shield" size={15} />{t('admin.users.createSupervisor')}
                </Button>
              </div>
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {users.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-extrabold" style={{ color: 'var(--text-1)' }}>{u.name}</p>
                      <p className="break-all text-xs faint">{u.email} · {t('members.lastLogin')}: {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : t('common.never')}</p>
                      {u.workshops.length > 0 ? (
                        <p className="mt-0.5 break-words text-[0.7rem] faint">
                          {u.workshops.map((w) => `${w.workshopName} (${t(w.role === 'supervisor' ? 'common.supervisor' : w.role === 'delivery_worker' ? 'common.deliveryWorker' : 'common.worker')})`).join(' · ')}
                        </p>
                      ) : null}
                    </div>
                    {u.role === 'super_admin' ? (
                      <span className="chip text-[0.7rem] font-extrabold" style={{ color: 'var(--color-brand-500)', borderColor: 'var(--color-brand-500)' }}>
                        {t('common.superAdmin')}
                      </span>
                    ) : (
                      <Select
                        value={u.role}
                        onChange={(e) => void setUserRole(u, e.target.value)}
                        disabled={u.id === user.id}
                        className="!w-auto !py-1.5 text-xs"
                        aria-label={t('common.role')}
                      >
                        <option value="worker">{t('common.worker')}</option>
                        <option value="supervisor">{t('common.supervisor')}</option>
                      </Select>
                    )}
                    <span className={`chip ${u.status === 'active' ? '' : 'opacity-80'}`} style={u.status === 'suspended' ? { color: 'var(--st-overdue)', borderColor: 'var(--st-overdue)' } : undefined}>
                      {t(u.status === 'active' ? 'common.active' : 'common.suspended')}
                    </span>
                    {u.role !== 'super_admin' ? (
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => { setEditUser(u); setEditForm({ name: u.name, email: u.email }); }}><Icon name="settings" size={14} />{t('common.edit')}</Button>
                        {u.status === 'active' ? (
                          <Button size="sm" variant="danger" onClick={() => void setUserStatus(u, 'suspended')}>{t('admin.users.suspend')}</Button>
                        ) : (
                          <Button size="sm" onClick={() => void setUserStatus(u, 'active')}>{t('admin.users.activate')}</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setPwModal({ user: u, password: '' })}><Icon name="shield" size={14} />{t('admin.users.setPassword')}</Button>
                        <Button size="sm" variant="danger" onClick={() => void deleteUser(u)}><Icon name="cancel" size={14} />{t('common.delete')}</Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              <Pagination page={userPage} pages={userPages} onPage={setUserPage}
                labels={{ page: t('common.page'), of: t('common.of'), previous: t('common.previous'), next: t('common.next') }} />
            </Card>
          ) : null}

          {/* ---------------- Invite codes ---------------- */}
          {tab === 'invites' ? (
            <Card>
              <h2 className="section-title mb-3">{t('admin.invites.title')}</h2>
              {invites.length === 0 ? (
                <EmptyState title={t('admin.invites.empty')} />
              ) : (
                <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {invites.map((inv) => (
                    <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                      <code className="rounded-lg px-2 py-1 text-sm font-black tracking-wider" dir="ltr" style={{ background: 'var(--surface-hover)', color: 'var(--color-brand-600)' }}>{inv.code}</code>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-bold" style={{ color: 'var(--text-1)' }}>{inv.workshopName || t('admin.invites.allWorkshops')}</p>
                        <p className="text-xs faint">
                          {t('members.inviteExpires')}: {formatDateTime(inv.expiresAt)} · {t('members.usesLeft', { n: Math.max(0, inv.maxUses - inv.uses) })} · {inv.createdByName}
                        </p>
                      </div>
                      <span className="chip text-[0.7rem]" style={inv.revoked || inv.expired ? { color: 'var(--st-overdue)', borderColor: 'var(--st-overdue)' } : undefined}>
                        {inv.revoked ? t('admin.invites.disabled') : inv.expired ? t('errors.codeExpired') : t('common.active')}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setInviteEdit({ invite: inv, maxUses: inv.maxUses, expiresInDays: 7, autoJoin: inv.autoJoin })}><Icon name="settings" size={14} />{t('admin.invites.edit')}</Button>
                        {!inv.revoked ? (
                          <Button size="sm" variant="ghost" onClick={() => void updateInvite(inv.id, { revoked: true }, t('admin.invites.statusUpdated'))}>{t('admin.invites.disable')}</Button>
                        ) : (
                          <Button size="sm" onClick={() => void updateInvite(inv.id, { revoked: false }, t('admin.invites.statusUpdated'))}>{t('admin.invites.enable')}</Button>
                        )}
                        <Button size="sm" variant="danger" onClick={() => void deleteInvite(inv)}>{t('admin.invites.delete')}</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {/* ---------------- Activity ---------------- */}
          {tab === 'activity' ? (
            <Card>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs faint">{t('admin.activity.autoClean')}</p>
                <Button size="sm" variant="danger" onClick={() => void clearActivity()}><Icon name="cancel" size={14} />{t('admin.activity.clear')}</Button>
              </div>
              {activity.length === 0 ? (
                <EmptyState title={t('admin.activity.empty')} />
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[640px] text-start text-sm">
                      <thead>
                        <tr className="text-xs faint">
                          <th className="p-2 text-start font-bold">{t('admin.activity.when')}</th>
                          <th className="p-2 text-start font-bold">{t('admin.activity.title')}</th>
                          <th className="p-2 text-start font-bold">{t('admin.activity.actor')}</th>
                          <th className="p-2 text-start font-bold">{t('admin.activity.target')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activity.map((a) => (
                          <tr key={a.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                            <td className="whitespace-nowrap p-2 text-xs faint">{formatDateTime(a.createdAt)}</td>
                            <td className="p-2 font-bold" style={{ color: 'var(--text-1)' }}>
                              {translate(locale, `admin.activity.action.${a.action}`) !== `admin.activity.action.${a.action}`
                                ? translate(locale, `admin.activity.action.${a.action}`)
                                : a.action}
                            </td>
                            <td className="p-2">{a.actorName || a.actorEmail || '—'}</td>
                            <td className="p-2 text-xs faint">{a.targetType} {a.targetId ? `#${a.targetId.slice(-6)}` : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile cards */}
                  <ul className="space-y-2 md:hidden">
                    {activity.map((a) => (
                      <li key={a.id} className="rounded-xl p-3" style={{ background: 'var(--surface-hover)' }}>
                        <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                          {translate(locale, `admin.activity.action.${a.action}`) !== `admin.activity.action.${a.action}`
                            ? translate(locale, `admin.activity.action.${a.action}`)
                            : a.action}
                        </p>
                        <p className="text-xs faint">{a.actorName || a.actorEmail} · {formatDateTime(a.createdAt)}</p>
                      </li>
                    ))}
                  </ul>
                  <Pagination page={activityPage} pages={activityPages} onPage={setActivityPage}
                    labels={{ page: t('common.page'), of: t('common.of'), previous: t('common.previous'), next: t('common.next') }} />
                </>
              )}
            </Card>
          ) : null}

          {/* ---------------- Settings ---------------- */}
          {tab === 'settings' && settings ? (
            <Card>
              <p className="mb-4 text-sm muted">{t('admin.settings.hint')}</p>
              <div className="space-y-5">
                <Field label={t('admin.settings.registrationMode')}>
                  <Select value={settings.registrationMode} onChange={(e) => setSettings({ ...settings, registrationMode: e.target.value as PlatformSettings['registrationMode'] })}>
                    <option value="open">{t('admin.settings.mode.open')}</option>
                    <option value="invite">{t('admin.settings.mode.invite')}</option>
                    <option value="closed">{t('admin.settings.mode.closed')}</option>
                  </Select>
                </Field>

                <div>
                  <p className="mb-2 text-sm font-bold">{t('admin.settings.enabledLanguages')}</p>
                  <div className="flex flex-wrap gap-3">
                    {LOCALES.map((l) => (
                      <label key={l} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold" style={{ borderColor: settings.enabledLanguages[l] ? 'var(--color-brand-500)' : 'var(--border-strong)' }}>
                        <input
                          type="checkbox"
                          checked={settings.enabledLanguages[l]}
                          onChange={(e) => setSettings({ ...settings, enabledLanguages: { ...settings.enabledLanguages, [l]: e.target.checked } })}
                          className="h-4 w-4 accent-[var(--color-brand-500)]"
                        />
                        {LOCALE_LABELS[l]}
                      </label>
                    ))}
                  </div>
                </div>

                <Field label={t('admin.settings.defaultLanguage')}>
                  <Select value={settings.defaultLanguage} onChange={(e) => setSettings({ ...settings, defaultLanguage: e.target.value as Locale })}>
                    {LOCALES.filter((l) => settings.enabledLanguages[l]).map((l) => (
                      <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
                    ))}
                  </Select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('admin.settings.contactEmail')}>
                    <Input type="email" dir="ltr" value={settings.contact.email} onChange={(e) => setSettings({ ...settings, contact: { ...settings.contact, email: e.target.value } })} />
                  </Field>
                  <Field label={t('admin.settings.contactPhone')}>
                    <Input dir="ltr" value={settings.contact.phone} onChange={(e) => setSettings({ ...settings, contact: { ...settings.contact, phone: e.target.value } })} />
                  </Field>
                  <Field label={t('admin.settings.contactNote')} >
                    <Textarea value={settings.contact.note} onChange={(e) => setSettings({ ...settings, contact: { ...settings.contact, note: e.target.value } })} rows={2} maxLength={500} />
                  </Field>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => void saveSettings()} loading={settingsBusy}>{t('common.save')}</Button>
                </div>
              </div>
            </Card>
          ) : null}
        </>
      )}

      {/* Create workshop modal */}
      <Modal open={createWsOpen} onClose={() => setCreateWsOpen(false)} title={t('admin.workshops.createTitle')}>
        <form onSubmit={createWorkshop} className="space-y-3.5">
          <Field label={t('workshop.name')} required>
            <Input value={newWs.name} onChange={(e) => setNewWs({ ...newWs, name: e.target.value })} required maxLength={120} />
          </Field>
          <Field label={t('workshop.description')}>
            <Textarea value={newWs.description} onChange={(e) => setNewWs({ ...newWs, description: e.target.value })} rows={2} />
          </Field>
          <Field label={t('workshop.address')}>
            <Input value={newWs.address} onChange={(e) => setNewWs({ ...newWs, address: e.target.value })} />
          </Field>
          <Field label={t('workshop.timezone')}>
            <Select value={newWs.timezone} onChange={(e) => setNewWs({ ...newWs, timezone: e.target.value })}>
              {['Africa/Algiers', 'Africa/Tunis', 'Europe/Paris', 'UTC'].map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreateWsOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={!newWs.name}>{t('common.create')}</Button>
          </div>
        </form>
      </Modal>

      {/* Direct password modal */}
      <Modal open={Boolean(pwModal)} onClose={() => setPwModal(null)} title={t('admin.users.setPasswordTitle')}>
        {pwModal ? (
          <form onSubmit={(e) => { e.preventDefault(); void setWorkerPassword(); }} className="space-y-3.5">
            <p className="text-sm muted">{pwModal.user.name} ({pwModal.user.email})</p>
            <Field label={t('auth.newPassword')} required hint={t('auth.passwordHint')}>
              <Input value={pwModal.password} onChange={(e) => setPwModal({ ...pwModal, password: e.target.value })} required minLength={6} dir="ltr" />
            </Field>
            <p className="text-xs faint">{t('admin.users.setPasswordNote')}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPwModal(null)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={pwModal.password.length < 6}>{t('common.confirm')}</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Create account modal — identical fields to the register page */}
      <Modal
        open={createAccRole !== null}
        onClose={() => setCreateAccRole(null)}
        title={createAccRole === 'supervisor' ? t('admin.users.createSupervisorTitle') : createAccRole === 'delivery_worker' ? t('admin.users.createDeliveryWorkerTitle') : t('admin.users.createWorkerTitle')}
        wide
      >
        <form onSubmit={createAccount} className="space-y-3.5">
          <div className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--surface-hover)' }}>
            <span className="chip text-[0.7rem]">{t('common.role')}: {createAccRole === 'supervisor' ? t('common.supervisor') : createAccRole === 'delivery_worker' ? t('common.deliveryWorker') : t('common.worker')}</span>
            {createAccRole === 'supervisor' ? <span className="text-xs faint">{t('admin.users.supervisorHint')}</span> : null}
          </div>
          <AccountFormFields values={newAccount} onChange={(patch) => setNewAccount({ ...newAccount, ...patch })} />
          <Field label={t('task.workshop')} required>
            <select
              className="input-base"
              value={newAccountWorkshopId}
              onChange={(e) => setNewAccountWorkshopId(e.target.value)}
              required
            >
              <option value="">{t('common.select')}</option>
              {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreateAccRole(null)}>{t('common.cancel')}</Button>
            <Button
              type="submit"
              disabled={!newAccount.name || !newAccount.email || !newAccount.password || !newAccount.recoveryPhrase || newAccount.password !== newAccount.confirm || !newAccountWorkshopId}
            >
              {t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit account modal (worker / supervisor) */}
      <Modal open={Boolean(editUser)} onClose={() => setEditUser(null)} title={t('admin.users.editTitle')}>
        {editUser ? (
          <form onSubmit={saveEditedUser} className="space-y-3.5">
            <p className="text-sm muted">
              <b style={{ color: 'var(--text-1)' }}>{editUser.name}</b> · {t(editUser.role === 'supervisor' ? 'common.supervisor' : 'common.worker')}
            </p>
            <Field label={t('auth.name')} required>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required minLength={2} maxLength={80} />
            </Field>
            <Field label={t('auth.email')} required>
              <Input type="email" dir="ltr" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} required />
            </Field>
            <p className="text-xs faint">{t('admin.users.editNote')}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditUser(null)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={!editForm.name || !editForm.email}>{t('common.save')}</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Invite edit modal */}
      <Modal open={Boolean(inviteEdit)} onClose={() => setInviteEdit(null)} title={t('admin.invites.editTitle')}>
        {inviteEdit ? (
          <form onSubmit={(e) => {
            e.preventDefault();
            void updateInvite(inviteEdit.invite.id, {
              maxUses: inviteEdit.maxUses,
              expiresInDays: inviteEdit.expiresInDays,
              autoJoin: inviteEdit.autoJoin,
            }, t('admin.invites.updated'));
          }} className="space-y-3.5">
            <p className="text-sm font-bold" dir="ltr">{inviteEdit.invite.code} — {inviteEdit.invite.workshopName}</p>
            <Field label={t('members.usesLeft', { n: inviteEdit.maxUses })}>
              <Input type="number" min={1} max={500} value={inviteEdit.maxUses} onChange={(e) => setInviteEdit({ ...inviteEdit, maxUses: Number(e.target.value) })} />
            </Field>
            <Field label={t('members.inviteExpires')}>
              <Input type="number" min={1} max={365} value={inviteEdit.expiresInDays} onChange={(e) => setInviteEdit({ ...inviteEdit, expiresInDays: Number(e.target.value) })} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
              <input type="checkbox" checked={inviteEdit.autoJoin} onChange={(e) => setInviteEdit({ ...inviteEdit, autoJoin: e.target.checked })} className="h-4 w-4 accent-[var(--color-brand-500)]" />
              {t('invite.accept')} — {t('admin.settings.mode.open')}
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setInviteEdit(null)}>{t('common.cancel')}</Button>
              <Button type="submit">{t('admin.invites.save')}</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
