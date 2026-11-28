'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useAppearance, FONT_SCALES } from '@/providers/appearance';
import { useToast } from '@/providers/toast';
import { useNotifications } from '@/providers/notifications';
import { Button, Card, Field, Input, Toggle, Segmented, ErrorState, LoadingScreen, Avatar } from '@/components/ui';
import { FlagIcon, Icon } from '@/components/layout';
import { formatDate, formatDateTime } from '@/lib/format';
import { LOCALE_LABELS, LOCALES } from '@ats/i18n';
import type { Locale, ThemeMode } from '@ats/shared';
import { pushSupport, enablePush, disablePush, type PushSupport as PushSupportState } from '@/lib/push';
import { api } from '@/lib/api';
import { fileToAvatarDataUrl } from '@/lib/avatar';
import { InstallAppRow } from '@/components/pwa';

function SettingsRow({ icon, title, body, children }: { icon: string; title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl p-3 transition hover:bg-[var(--surface-hover)]">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--color-brand-500) 10%, transparent)', color: 'var(--color-brand-500)' }}>
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.88rem] font-extrabold" style={{ color: 'var(--text-1)' }}>{title}</p>
        {body ? <p className="mt-0.5 text-xs leading-relaxed faint">{body}</p> : null}
        {children ? <div className="mt-2">{children}</div> : null}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, patchMe, memberships, meta, logout } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const { theme, setTheme, fontScale, setFontScale } = useAppearance();
  const { push: pushToast } = useToast();
  const { primeAudioNow } = useNotifications();

  const [name, setName] = useState('');
  const [busyName, setBusyName] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pushState, setPushState] = useState<PushSupportState>('none');
  const [pushBusy, setPushBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwOpen, setPwOpen] = useState(false);
  const avatarRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    document.title = t('profile.pageTitle');
    if (user) {
      setName(user.name);
      setSoundEnabled(user.soundEnabled);
    }
  }, [t, user]);

  const refreshPushState = useCallback(() => { void pushSupport().then(setPushState); }, []);
  useEffect(() => { refreshPushState(); }, [refreshPushState]);

  if (!user) return <LoadingScreen label={t('common.loading')} />;

  const saveAvatar = async (dataUrl: string | null) => {
    try {
      await patchMe({ avatar: dataUrl ?? '' });
      pushToast('success', t('profile.avatarSaved'));
    } catch (err) {
      pushToast('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    }
  };

  const pickAvatar = async (file: File) => {
    try {
      const url = await fileToAvatarDataUrl(file);
      await saveAvatar(url);
    } catch {
      pushToast('error', t('profile.avatarTooLarge'));
    }
  };

  const saveName = async () => {
    setBusyName(true);
    try {
      await patchMe({ name: name.trim() });
      pushToast('success', t('profile.saved'));
      setEditingName(false);
    } catch (err) {
      pushToast('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setBusyName(false);
    }
  };

  const changeLanguage = async (l: Locale) => {
    setLocale(l);
    await patchMe({ preferredLanguage: l }).catch(() => undefined);
  };

  const changeTheme = async (mode: ThemeMode) => {
    setTheme(mode);
    await patchMe({ theme: mode }).catch(() => undefined);
  };

  const changeFontScale = async (v: number) => {
    setFontScale(v);
    await patchMe({ fontScale: v }).catch(() => undefined);
  };

  const toggleSound = async (v: boolean) => {
    setSoundEnabled(v);
    if (v) primeAudioNow();
    await patchMe({ soundEnabled: v }).catch(() => undefined);
  };

  const subscribePush = async () => {
    setPushBusy(true);
    try {
      const key = meta?.push?.vapidPublicKey;
      if (!key) { pushToast('error', t('notif.pushUnsupported')); return; }
      await enablePush(key);
      pushToast('success', t('notif.pushSubscribed'));
      refreshPushState();
    } catch {
      pushToast('error', t('notif.pushError'));
    } finally {
      setPushBusy(false);
    }
  };

  const unsubscribePush = async () => {
    setPushBusy(true);
    try {
      await disablePush();
      refreshPushState();
    } finally {
      setPushBusy(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwBusy(true);
    setPwError('');
    if (newPassword !== confirmPassword) {
      setPwError(t('errors.passwordMismatch'));
      setPwBusy(false);
      return;
    }
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      pushToast('success', t('profile.passwordChanged'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwOpen(false);
    } catch (err) {
      setPwError(t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setPwBusy(false);
    }
  };

  const accountTypeLabel = user.role === 'super_admin'
    ? t('common.superAdmin')
    : memberships.some((m) => m.role === 'supervisor' && m.status === 'active')
      ? t('common.supervisor')
      : memberships.some((m) => m.role === 'delivery_worker' && m.status === 'active') || user.role === 'delivery_worker'
        ? t('common.deliveryWorker')
        : t('common.worker');
  const badgeColor = user.role === 'super_admin'
    ? 'var(--st-overdue)'
    : memberships.some((m) => m.role === 'supervisor' && m.status === 'active')
      ? 'var(--st-review)'
      : memberships.some((m) => m.role === 'delivery_worker' && m.status === 'active') || user.role === 'delivery_worker'
        ? 'var(--st-inprogress)'
        : 'var(--color-brand-500)';
  const activeWorkshop = memberships.find((m) => m.status === 'active') ?? memberships[0] ?? null;

  const pushStatusLabel: Record<PushSupportState, string> = {
    unsupported: t('profile.pushStatus.unsupported'),
    denied: t('profile.pushStatus.denied'),
    none: t('profile.pushStatus.none'),
    subscribed: t('profile.pushStatus.subscribed'),
  };

  const themeOptions: { value: ThemeMode; label: string; icon: string }[] = [
    { value: 'light', label: t('common.light'), icon: 'sun' },
    { value: 'dark', label: t('common.dark'), icon: 'moon' },
    { value: 'system', label: t('common.system'), icon: 'monitor' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Identity cover */}
      <section className="relative overflow-hidden rounded-[1.9rem] border" style={{ borderColor: 'var(--border)', background: 'var(--surface)', boxShadow: 'var(--shadow-1)' }}>
        <div className="relative h-28 sm:h-32" style={{ background: 'linear-gradient(120deg,#1e1b4b,#4338ca 45%,#0e7490)' }}>
          <div className="pointer-events-none absolute -end-10 -top-16 h-48 w-48 rounded-full" style={{ background: 'radial-gradient(circle, rgba(34,211,238,.4), transparent 65%)' }} />
          <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.9) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.9) 1px,transparent 1px)', backgroundSize: '24px 24px' }} />
          <button type="button" onClick={() => router.push('/notifications')} className="icon-btn absolute end-4 top-4 !border-white/20 !bg-white/10 !text-white !shadow-none backdrop-blur" aria-label={t('nav.notifications')}>
            <Icon name="bell" size={17} />
          </button>
        </div>
        <div className="px-4 pb-5 sm:px-6">
          <div className="-mt-10 flex flex-col gap-3 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 items-end gap-3">
              <div className="relative shrink-0">
                <Avatar src={user.avatar} name={user.name} size={82} className="ring-4 ring-[var(--surface-solid)]" />
                <button
                  type="button"
                  onClick={() => avatarRef.current?.click()}
                  className="absolute -bottom-1 -end-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--surface-solid)] text-white"
                  style={{ background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))' }}
                  aria-label={t('profile.changeAvatar')}
                  title={t('profile.changeAvatar')}
                >
                  <Icon name="paperclip" size={14} />
                </button>
                <input
                  ref={avatarRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAvatar(f); e.target.value = ''; }}
                />
              </div>
              <div className="min-w-0 flex-1 pb-1">
                {editingName ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="!min-h-10 !py-1.5 !text-base" aria-label={t('profile.name')} />
                    <Button size="sm" loading={busyName} onClick={() => void saveName()} disabled={name.trim().length < 2}>{t('common.save')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingName(false); setName(user.name); }}>{t('common.cancel')}</Button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setEditingName(true)} className="group flex min-w-0 items-center gap-2 text-start" aria-label={t('profile.editName')}>
                    <h1 className="truncate text-xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>{user.name}</h1>
                    <Icon name="edit" size={15} className="shrink-0 text-[var(--text-3)] group-hover:text-brand-500" />
                  </button>
                )}
                <p className="mt-0.5 truncate text-sm muted">{user.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="chip tint" style={{ '--tint-color': badgeColor } as React.CSSProperties}>{accountTypeLabel}</span>
                  {activeWorkshop ? (
                    <span className="chip tint max-w-full" style={{ '--tint-color': 'var(--color-brand-500)' } as React.CSSProperties} title={t('profile.workshopBadge')}>
                      <Icon name="workshop" size={12} />
                      <span className="truncate">{activeWorkshop.workshopName}</span>
                    </span>
                  ) : null}
                  <span className="text-[0.7rem] font-bold faint">{t('profile.memberSince')} {formatDate(user.createdAt, locale)}</span>
                </div>
              </div>
            </div>
            {user.avatar ? (
              <button type="button" onClick={() => void saveAvatar(null)} className="btn btn-quiet btn-sm shrink-0 !text-red-500">{t('profile.removeAvatar')}</button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Preferences */}
      <Card>
        <h2 className="section-title mb-2 flex items-center gap-1.5"><Icon name="sliders" size={17} className="text-brand-500" />{t('profile.preferences')}</h2>
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          <SettingsRow icon="globe" title={t('profile.language')} body={t('profile.languageHint')}>
            <div className="flex flex-wrap gap-2">
              {LOCALES.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => void changeLanguage(l)}
                  aria-pressed={locale === l}
                  className={`btn btn-sm ${locale === l ? 'btn-soft' : 'btn-ghost'}`}
                  style={locale === l ? { boxShadow: '0 0 0 2px var(--ring)' } : undefined}
                >
                  <FlagIcon locale={l} size={14} />
                  {LOCALE_LABELS[l]}
                </button>
              ))}
            </div>
          </SettingsRow>
          <SettingsRow icon="palette" title={t('profile.appearance')} body={t('profile.appearanceHint')}>
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map((opt) => {
                const active = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => void changeTheme(opt.value)}
                    aria-pressed={active}
                    className="flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition"
                    style={{
                      borderColor: active ? 'color-mix(in srgb, var(--color-brand-500) 55%, transparent)' : 'var(--border)',
                      background: active ? 'color-mix(in srgb, var(--color-brand-500) 9%, transparent)' : 'transparent',
                      color: active ? 'var(--color-brand-600)' : 'var(--text-2)',
                    }}
                  >
                    <Icon name={opt.icon} size={20} />
                    <span className="text-[0.72rem] font-extrabold">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </SettingsRow>
          <SettingsRow icon="monitor" title={t('profile.fontSize')} body={t('profile.fontSizeHint')}>
            <Segmented
              value={String(fontScale)}
              onChange={(v) => void changeFontScale(Number(v))}
              ariaLabel={t('common.fontSize')}
              options={FONT_SCALES.map((scale, i) => ({ value: String(scale), label: scale < 1 ? 'A−' : 'A' + '+'.repeat(i - 1) }))}
            />
          </SettingsRow>
        </div>
      </Card>

      {/* Notifications */}
      <Card>
        <h2 className="section-title mb-2 flex items-center gap-1.5"><Icon name="bell" size={17} className="text-brand-500" />{t('profile.notifications')}</h2>
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          <SettingsRow icon="zap" title={t('profile.soundEnabled')} body={t('profile.soundHint')}>
            <Toggle checked={soundEnabled} onChange={(v) => void toggleSound(v)} label={soundEnabled ? t('common.enabled') : t('common.disabled')} />
          </SettingsRow>
          <SettingsRow icon="online" title={t('profile.push')} body={t('profile.pushHint')}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip tint" style={{ '--tint-color': pushState === 'subscribed' ? 'var(--st-approved)' : pushState === 'denied' ? 'var(--st-overdue)' : 'var(--st-draft)' } as React.CSSProperties}>
                {pushStatusLabel[pushState]}
              </span>
              {pushState === 'subscribed' ? (
                <Button variant="ghost" size="sm" loading={pushBusy} onClick={() => void unsubscribePush()}>{t('profile.pushDisable')}</Button>
              ) : pushState !== 'unsupported' ? (
                <Button size="sm" loading={pushBusy} onClick={() => void subscribePush()} disabled={pushState === 'denied'}><Icon name="bell" size={15} />{t('notif.enablePush')}</Button>
              ) : null}
            </div>
          </SettingsRow>
        </div>
      </Card>

      {/* Security */}
      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="section-title flex items-center gap-1.5"><Icon name="lock" size={17} className="text-brand-500" />{t('profile.security')}</h2>
          <Button variant="ghost" size="sm" onClick={() => setPwOpen((v) => !v)}>{pwOpen ? t('common.close') : t('profile.changePassword')}</Button>
        </div>
        {pwOpen ? (
          <form onSubmit={changePassword} className="animate-fade-up space-y-3 rounded-2xl p-3" style={{ background: 'var(--surface-hover)' }} noValidate>
            <Field label={t('auth.currentPassword')} required>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required dir="ltr" autoComplete="current-password" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('auth.newPassword')} required hint={t('auth.passwordHint')}>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required dir="ltr" autoComplete="new-password" />
              </Field>
              <Field label={t('auth.confirmPassword')} required>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required dir="ltr" autoComplete="new-password" />
              </Field>
            </div>
            {pwError ? <ErrorState message={pwError} /> : null}
            <div className="flex justify-end">
              <Button type="submit" loading={pwBusy} disabled={!currentPassword || !newPassword}>{t('profile.changePassword')}</Button>
            </div>
          </form>
        ) : null}
        <p className="mt-3 border-t pt-3 text-xs faint" style={{ borderColor: 'var(--border)' }}>{t('members.lastLogin')}: {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t('common.never')}</p>
      </Card>

      {/* App */}
      <Card>
        <h2 className="section-title mb-3 flex items-center gap-1.5"><Icon name="install" size={17} className="text-brand-500" />{t('profile.app')}</h2>
        <div className="space-y-3">
          <InstallAppRow />
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--surface-hover)', color: 'var(--text-2)' }}>
                <Icon name="info" size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold" style={{ color: 'var(--text-1)' }}>ATS PRO</p>
                <p className="text-xs muted">{t('profile.version')} {meta?.app?.version ?? '2.0.0'}</p>
              </div>
            </div>
          </div>
          <p className="text-xs faint">{t('profile.developedBy')}</p>
          <Button variant="danger" block onClick={async () => { await logout(); router.replace('/login'); }}>
            <Icon name="logout" size={16} />{t('nav.logout')}
          </Button>
        </div>
      </Card>

      {/* Workshops */}
      <Card>
        <h2 className="section-title mb-3 flex items-center gap-1.5"><Icon name="workshop" size={17} className="text-brand-500" />{t('profile.workshops')}</h2>
        {memberships.length === 0 ? (
          <p className="text-sm muted">{t('profile.noWorkshops')}</p>
        ) : (
          <ul className="space-y-2">
            {memberships.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-hover)' }}>
                <span className="min-w-0 flex-1 break-words text-sm font-bold" style={{ color: 'var(--text-1)' }}>{m.workshopName}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="chip !px-2 !py-0.5 text-[0.66rem]">{t(m.role === 'supervisor' ? 'common.supervisor' : m.role === 'delivery_worker' ? 'common.deliveryWorker' : 'common.worker')}</span>
                  <span className="chip !px-2 !py-0.5 text-[0.66rem]">{t(m.status === 'active' ? 'common.active' : m.status === 'pending' ? 'common.pending' : m.status === 'suspended' ? 'common.suspended' : 'common.removed')}</span>
                  {m.joinedAt ? <span className="text-[0.68rem] font-bold faint">{formatDate(m.joinedAt, locale)}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
