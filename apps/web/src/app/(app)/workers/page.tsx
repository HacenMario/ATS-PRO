'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useSilentRefresh } from '@/lib/use-silent-refresh';
import { useConfirm } from '@/providers/confirm';
import { useToast } from '@/providers/toast';
import { Button, Card, Field, Input, Select, Modal, ErrorState, EmptyState, LoadingScreen, Segmented } from '@/components/ui';
import { Icon, AvatarBubble } from '@/components/layout';
import { formatDateTime } from '@/lib/format';
import { AccountFormFields, EMPTY_ACCOUNT_FORM, type AccountFormValues } from '@/components/account-form';

interface MemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'worker' | 'delivery_worker' | 'supervisor';
  status: 'active' | 'pending' | 'suspended' | 'removed';
  joinedAt: string | null;
  lastLoginAt: string | null;
}

interface InviteRow {
  id: string; code: string; role: string; autoJoin: boolean; maxUses: number; uses: number; expiresAt: string; remaining: number;
}

interface ResetRequestRow {
  id: string; userId: string; name: string; email: string; avatar: string | null; createdAt: string;
}

export default function WorkersPage() {
  const { user, isSupervisor, isSuperAdmin } = useAuth();
  const { t } = useLocale();
  const confirmAction = useConfirm();
  const { push } = useToast();

  const [workshops, setWorkshops] = useState<{ id: string; name: string; membershipRole?: string }[]>([]);
  const [workshopId, setWorkshopId] = useState('');
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [resetRequests, setResetRequests] = useState<ResetRequestRow[]>([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'members' | 'invites' | 'requests'>(() => {
    // Deep link support: /workers?tab=requests opens the password-reset
    // requests tab directly (notification links land here).
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'requests') return 'requests';
    return 'members';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createRole, setCreateRole] = useState<'worker' | 'delivery_worker'>('worker');
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<'worker' | 'supervisor'>('worker');
  const [newAccount, setNewAccount] = useState<AccountFormValues>({ ...EMPTY_ACCOUNT_FORM });
  const [busy, setBusy] = useState(false);
  const [autoJoin, setAutoJoin] = useState(true);
  const [pwModal, setPwModal] = useState<{ req: ResetRequestRow; password: string } | null>(null);

  const isAdmin = isSupervisor || isSuperAdmin;

  useEffect(() => { document.title = t('pageTitles.workers'); }, [t]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const ws = await api<{ items: { id: string; name: string; membershipRole?: string }[] }>('/api/workshops');
        const usable = isSuperAdmin ? ws.items : ws.items.filter((w) => w.membershipRole === 'supervisor');
        setWorkshops(usable);
        if (usable.length > 0) setWorkshopId(usable[0]!.id);
      } catch (err) {
        setError(t((err as { code?: string })?.code ?? 'errors.serverError'));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isSuperAdmin]);

  const loadMembers = useCallback(async (silent = false) => {
    if (!workshopId) return;
    if (!silent) setError('');
    try {
      const [m, inv, rr] = await Promise.all([
        api<{ items: MemberRow[] }>(`/api/workshops/${workshopId}/members`),
        api<{ items: InviteRow[] }>(`/api/workshops/${workshopId}/invitations`).catch(() => ({ items: [] as InviteRow[] })),
        api<{ items: ResetRequestRow[] }>(`/api/workshops/${workshopId}/reset-requests`).catch(() => ({ items: [] as ResetRequestRow[] })),
      ]);
      setMembers(m.items);
      setInvites(inv.items);
      setResetRequests(rr.items);
    } catch (err) {
      // silent refresh failures are non-fatal — keep the current content
      if (!silent) setError(t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshopId]);
  useSilentRefresh(loadMembers);

  useEffect(() => { void loadMembers(); }, [workshopId, loadMembers]);

  if (!user) return <LoadingScreen label={t('common.loading')} />;
  if (!isAdmin) {
    return <div className="mx-auto max-w-lg py-10"><ErrorState message={t('errors.forbidden')} /></div>;
  }
  if (loading) return <LoadingScreen label={t('common.loading')} />;
  if (workshops.length === 0) {
    return <div className="mx-auto max-w-lg py-10"><EmptyState title={t('dash.noWorkshop')} hint={t('dash.noWorkshopHint')} /></div>;
  }

  const filtered = members.filter((m) =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase()),
  );
  const pending = filtered.filter((m) => m.status === 'pending');
  const active = filtered.filter((m) => m.status !== 'pending');

  const changeRole = async (m: MemberRow, role: 'worker' | 'delivery_worker' | 'supervisor') => {
    try {
      await api(`/api/workshops/${workshopId}/members/${m.userId}`, { method: 'PATCH', body: { role } });
      push('success', t('members.roleChanged'));
      void loadMembers();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  const changeStatus = async (m: MemberRow, status: 'active' | 'suspended' | 'removed') => {
    const message = status === 'removed' ? t('members.confirmRemove', { name: m.name }) : t('members.confirmSuspend', { name: m.name });
    const ok = await confirmAction.confirm({ title: t('confirm.title'), message, danger: status !== 'active' });
    if (!ok) return;
    try {
      await api(`/api/workshops/${workshopId}/members/${m.userId}`, { method: 'PATCH', body: { status } });
      push('success', t('members.statusChanged'));
      void loadMembers();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/workshops/${workshopId}/members`, { method: 'POST', body: { email: addEmail.trim(), role: addRole } });
      push('success', t('common.success'));
      setAddOpen(false);
      setAddEmail('');
      void loadMembers();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newAccount.password !== newAccount.confirm) return;
    setBusy(true);
    try {
      await api(`/api/workshops/${workshopId}/members/create`, {
        method: 'POST',
        body: {
          name: newAccount.name.trim(),
          email: newAccount.email.trim(),
          password: newAccount.password,
          role: createRole,
          gender: newAccount.gender || undefined,
          birthDate: newAccount.birthDate || undefined,
          bloodType: newAccount.bloodType || undefined,
          recoveryPhrase: newAccount.recoveryPhrase.trim(),
          avatar: newAccount.avatar ?? undefined,
        },
      });
      push('success', t('members.accountCreated'));
      setCreateOpen(false);
      setCreateRole('worker');
      setNewAccount({ ...EMPTY_ACCOUNT_FORM });
      void loadMembers();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setBusy(false);
    }
  };

  const createInvite = async () => {
    setBusy(true);
    try {
      await api(`/api/workshops/${workshopId}/invitations`, { method: 'POST', body: { role: 'worker', autoJoin, expiresInDays: 7, maxUses: 50 } });
      push('success', t('common.success'));
      void loadMembers();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      push('success', t('members.codeCopied'));
    } catch {
      push('error', t('common.error'));
    }
  };

  const approveReset = async () => {
    if (!pwModal) return;
    setBusy(true);
    try {
      await api(`/api/workshops/${workshopId}/reset-requests/${pwModal.req.id}/approve`, {
        method: 'POST',
        body: { password: pwModal.password },
      });
      push('success', t('workers.resetApproved'));
      setPwModal(null);
      void loadMembers();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setBusy(false);
    }
  };

  const dismissReset = async (r: ResetRequestRow) => {
    const ok = await confirmAction.confirm({ title: t('confirm.title'), message: t('workers.resetDismiss') });
    if (!ok) return;
    try {
      await api(`/api/workshops/${workshopId}/reset-requests/${r.id}/dismiss`, { method: 'POST', body: {} });
      push('success', t('workers.resetDismissed'));
      void loadMembers();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  const activeCount = members.filter((m) => m.status === 'active').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>{t('members.pageTitle')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)}><Icon name="plus" size={15} />{t('members.inviteTitle')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setCreateOpen(true)}><Icon name="profile" size={15} />{t('members.createAccount')}</Button>
          <Button size="sm" onClick={() => void createInvite()} loading={busy && invites.length === 0}><Icon name="link" size={15} />{t('members.createInvite')}</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={workshopId} onChange={(e) => setWorkshopId(e.target.value)} className="!w-auto" aria-label={t('workshop.selectWorkshop')}>
          {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
        <Segmented value={tab} onChange={setTab} ariaLabel={t('common.actions')}
          options={[
            { value: 'members', label: `${t('members.membersTab')} (${activeCount})` },
            { value: 'invites', label: t('admin.invites.title') },
            { value: 'requests', label: `${t('workers.resetRequests')} (${resetRequests.length})` },
          ]} />
      </div>

      {error ? <ErrorState message={error} onRetry={() => void loadMembers()} retryLabel={t('common.retry')} /> : null}

      {tab === 'requests' ? (
        <Card>
          <h2 className="section-title mb-3">{t('workers.resetRequests')}</h2>
          {resetRequests.length === 0 ? (
            <p className="py-6 text-center text-sm faint">{t('workers.resetRequestsEmpty')}</p>
          ) : (
            <ul className="space-y-2.5">
              {resetRequests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-hover)' }}>
                  <AvatarBubble src={r.avatar} name={r.name} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-bold" style={{ color: 'var(--text-1)' }}>{r.name}</p>
                    <p className="break-all text-xs faint">{r.email} · {formatDateTime(r.createdAt)}</p>
                  </div>
                  <Button size="sm" onClick={() => setPwModal({ req: r, password: '' })}>{t('workers.resetApprove')}</Button>
                  <Button size="sm" variant="danger" onClick={() => void dismissReset(r)}>{t('workers.resetDismiss')}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : tab === 'invites' ? (
        <Card>
          <h2 className="section-title mb-2">{t('members.inviteTitle')}</h2>
          <p className="mb-3 text-sm muted">{t('members.inviteNote')}</p>
          <label className="mb-4 flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
            <input type="checkbox" checked={autoJoin} onChange={(e) => setAutoJoin(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand-500)]" />
            {t('invite.accept')} — {t('admin.settings.mode.open')}
          </label>
          {invites.length === 0 ? (
            <p className="text-sm faint">{t('admin.invites.empty')}</p>
          ) : (
            <ul className="space-y-2.5">
              {invites.map((inv) => {
                const isExpired = new Date(inv.expiresAt).getTime() < Date.now();
                const isRevoked = inv.remaining <= 0 && inv.uses >= inv.maxUses;
                return (
                  <li key={inv.id} className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-hover)' }}>
                    <code className="rounded-lg px-2 py-1 text-sm font-black tracking-wider" dir="ltr" style={{ background: 'var(--surface-solid)', color: 'var(--color-brand-600)' }}>{inv.code}</code>
                    <span className="text-xs faint">{t('members.inviteExpires')}: {formatDateTime(inv.expiresAt)}</span>
                    <span className="text-xs faint">{t('members.usesLeft', { n: inv.remaining })}</span>
                    <span className="chip text-[0.68rem]">{inv.autoJoin ? t('admin.settings.mode.open') : t('common.pending')}</span>
                    <span className="chip text-[0.68rem]" style={isRevoked || isExpired ? { color: 'var(--st-overdue)', borderColor: 'var(--st-overdue)' } : undefined}>
                      {isRevoked ? t('admin.invites.disabled') : isExpired ? t('errors.codeExpired') : t('common.active')}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => void copyCode(inv.code)}><Icon name="copy" size={14} />{t('members.copyCode')}</Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : (
        <>
          {pending.length > 0 ? (
            <Card>
              <h2 className="section-title mb-3">{t('members.pendingTitle')}</h2>
              <ul className="space-y-2.5">
                {pending.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-hover)' }}>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-bold" style={{ color: 'var(--text-1)' }}>{m.name}</p>
                      <p className="break-all text-xs faint">{m.email}</p>
                    </div>
                    <Button size="sm" onClick={() => void changeStatus(m, 'active')}>{t('members.approve')}</Button>
                    <Button size="sm" variant="danger" onClick={() => void changeStatus(m, 'removed')}>{t('common.remove')}</Button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <div className="relative mb-4">
              <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center faint" aria-hidden="true"><Icon name="search" size={16} /></span>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('members.searchPlaceholder')} className="!ps-9" aria-label={t('common.search')} />
            </div>
            {active.length === 0 ? (
              <EmptyState title={t('members.noMembers')} hint={t('members.inviteNote')} />
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {active.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                    <AvatarBubble name={m.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                        {m.name} {m.userId === user.id ? <span className="font-normal faint">{t('members.you')}</span> : null}
                      </p>
                      <p className="break-all text-xs faint">{m.email} · {t('members.lastLogin')}: {m.lastLoginAt ? formatDateTime(m.lastLoginAt) : t('common.never')}</p>
                    </div>
                    <span className={`chip text-[0.7rem] ${m.status === 'active' ? '' : 'opacity-70'}`}>
                      {t(m.role === 'supervisor' ? 'common.supervisor' : m.role === 'delivery_worker' ? 'common.deliveryWorker' : 'common.worker')} · {t(m.status === 'active' ? 'common.active' : m.status === 'suspended' ? 'common.suspended' : 'common.removed')}
                    </span>
                    {m.userId !== user.id ? (
                      <div className="flex flex-wrap gap-1.5">
                        <Select value={m.role} onChange={(e) => void changeRole(m, e.target.value as 'worker' | 'delivery_worker' | 'supervisor')} className="!w-auto !py-1.5 text-xs" aria-label={t('members.role')}>
                          <option value="worker">{t('common.worker')}</option>
                          <option value="delivery_worker">{t('common.deliveryWorker')}</option>
                          <option value="supervisor">{t('common.supervisor')}</option>
                        </Select>
                        {m.status === 'suspended' ? (
                          <Button size="sm" variant="ghost" onClick={() => void changeStatus(m, 'active')}>{t('members.activate')}</Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => void changeStatus(m, 'suspended')}>{t('members.suspend')}</Button>
                        )}
                        <Button size="sm" variant="danger" onClick={() => void changeStatus(m, 'removed')}>{t('members.remove')}</Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {/* Add existing user by email */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('members.inviteTitle')}>
        <form onSubmit={addMember} className="space-y-4">
          <Field label={t('members.email')} required>
            <Input type="email" dir="ltr" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} required placeholder="worker@example.com" />
          </Field>
          <Field label={t('members.role')}>
            <Select value={addRole} onChange={(e) => setAddRole(e.target.value as 'worker' | 'supervisor')}>
              <option value="worker">{t('common.worker')}</option>
              <option value="supervisor">{t('common.supervisor')}</option>
            </Select>
          </Field>
          <p className="text-xs faint">{t('workshop.createdByAdmin')} — {t('members.inviteNote')}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={busy} disabled={!addEmail}>{t('common.add')}</Button>
          </div>
        </form>
      </Modal>

      {/* Create new account in this workshop — same fields as the register page */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('members.createAccountTitle')} wide>
        <form onSubmit={createAccount} className="space-y-3.5">
          <Field label={t('members.role')} hint={t('members.roleHint')}>
            <Select value={createRole} onChange={(e) => setCreateRole(e.target.value as 'worker' | 'delivery_worker')}>
              <option value="worker">{t('common.worker')}</option>
              <option value="delivery_worker">{t('common.deliveryWorker')}</option>
            </Select>
          </Field>
          <AccountFormFields values={newAccount} onChange={(patch) => setNewAccount({ ...newAccount, ...patch })} />
          <p className="text-xs faint">{t('members.accountPasswordNote')}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button
              type="submit"
              loading={busy}
              disabled={!newAccount.name || !newAccount.email || !newAccount.password || !newAccount.recoveryPhrase || newAccount.password !== newAccount.confirm}
            >
              {t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Approve password reset with a new password */}
      <Modal open={Boolean(pwModal)} onClose={() => setPwModal(null)} title={t('workers.resetApprove')}>
        {pwModal ? (
          <form onSubmit={(e) => { e.preventDefault(); void approveReset(); }} className="space-y-3.5">
            <p className="text-sm muted">{t('workers.resetRequestFrom')}: <b>{pwModal.req.name}</b> ({pwModal.req.email})</p>
            <Field label={t('workers.resetNewPassword')} required hint={t('auth.passwordHint')}>
              <Input value={pwModal.password} onChange={(e) => setPwModal({ ...pwModal, password: e.target.value })} required minLength={6} dir="ltr" />
            </Field>
            <p className="text-xs faint">{t('members.accountPasswordNote')}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPwModal(null)}>{t('common.cancel')}</Button>
              <Button type="submit" loading={busy} disabled={pwModal.password.length < 6}>{t('workers.resetApprove')}</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
