'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useAppearance, FONT_SCALES } from '@/providers/appearance';
import { useToast } from '@/providers/toast';
import { useNotifications } from '@/providers/notifications';
import { Button, Card, Field, Input, Toggle, Segmented, ErrorState, LoadingScreen } from '@/components/ui';
import { FlagIcon, Icon, AvatarBubble } from '@/components/layout';
import { formatDate, formatDateTime } from '@/lib/format';
import { LOCALE_LABELS, LOCALES } from '@ats/i18n';
import type { Locale, ThemeMode } from '@ats/shared';
import { pushSupport, enablePush, disablePush, type PushSupport as PushSupportState } from '@/lib/push';
import { api } from '@/lib/api';
import { fileToAvatarDataUrl } from '@/lib/avatar';

export default function ProfilePage() {
  const { user, patchMe, memberships, meta } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const { theme, setTheme, fontScale, setFontScale } = useAppearance();
  const { push: pushToast } = useToast();
  const { primeAudioNow } = useNotifications();

  const [name, setName] = useState('');
  const [busyName, setBusyName] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pushState, setPushState] = useState<PushSupportState>('none');
  const [pushBusy, setPushBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');
  const avatarRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.title = t('pageTitles.profile');
    if (user) {
      setName(user.name);
      setSoundEnabled(user.soundEnabled);
    }
  }, [t, user]);

  const refreshPushState = useCallback(() => {
    void pushSupport().then(setPushState);
  }, []);
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
  // The workshop the user currently belongs to (worker / supervisor accounts).
  const activeWorkshop = memberships.find((m) => m.status === 'active') ?? memberships[0] ?? null;

  const pushStatusLabel: Record<PushSupportState, string> = {
    unsupported: t('profile.pushStatus.unsupported'),
    denied: t('profile.pushStatus.denied'),
    none: t('profile.pushStatus.none'),
    subscribed: t('profile.pushStatus.subscribed'),
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>{t('profile.pageTitle')}</h1>

      {/* Identity */}
      <Card>
        <h2 className="section-title mb-4">{t('profile.identity')}</h2>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="relative">
            <AvatarBubble src={user.avatar} name={user.name} size={72} />
            <button
              type="button"
              onClick={() => avatarRef.current?.click()}
              className="kbd-focus absolute -bottom-1 -end-1 flex h-8 w-8 items-center justify-center rounded-full border-2"
              style={{ background: 'var(--color-brand-500)', borderColor: 'var(--surface-solid)', color: '#fff' }}
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
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickAvatar(f);
                e.target.value = '';
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-base font-extrabold" style={{ color: 'var(--text-1)' }}>{user.email}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="chip tint" style={{ '--tint-color': badgeColor } as React.CSSProperties}>
                {accountTypeLabel}
              </span>
              {activeWorkshop ? (
                <span
                  className="chip tint inline-flex max-w-full items-center gap-1.5 break-words [white-space:normal]"
                  style={{ '--tint-color': 'var(--color-brand-500)' } as React.CSSProperties}
                  title={t('profile.workshopBadge')}
                >
                  <Icon name="workshop" size={13} />
                  <span>{activeWorkshop.workshopName}</span>
                </span>
              ) : null}
              <span className="text-xs faint">{t('profile.memberSince')} {formatDate(user.createdAt, locale)}</span>
            </div>
            {user.avatar ? (
              <button type="button" onClick={() => void saveAvatar(null)} className="kbd-focus mt-1.5 text-xs font-bold text-red-500 hover:underline">
                {t('profile.removeAvatar')}
              </button>
            ) : null}
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void saveName(); }} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label={t('profile.name')} required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
            </Field>
          </div>
          <Button type="submit" loading={busyName} className="sm:w-auto">{t('common.save')}</Button>
        </form>
        {user.birthDate || user.bloodType || user.gender ? (
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t pt-3 text-sm" style={{ borderColor: 'var(--border)' }}>
            {user.gender ? (
              <div><dt className="text-xs faint">{t('auth.gender')}</dt><dd className="font-bold">{user.gender === 'male' ? t('auth.genderMale') : t('auth.genderFemale')}</dd></div>
            ) : null}
            {user.birthDate ? (
              <div><dt className="text-xs faint">{t('auth.birthDate')}</dt><dd className="font-bold">{formatDate(user.birthDate, locale)}</dd></div>
            ) : null}
            {user.bloodType ? (
              <div><dt className="text-xs faint">{t('auth.bloodType')}</dt><dd className="font-bold">{user.bloodType}</dd></div>
            ) : null}
          </dl>
        ) : null}
      </Card>

      {/* Preferences */}
      <Card>
        <h2 className="section-title mb-4">{t('profile.preferences')}</h2>
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-bold">{t('profile.language')}</p>
            <div className="flex flex-wrap gap-2">
              {LOCALES.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => void changeLanguage(l)}
                  aria-pressed={locale === l}
                  className="btn btn-ghost btn-sm gap-2"
                  style={locale === l ? { borderColor: 'var(--color-brand-500)', boxShadow: '0 0 0 2px var(--ring)' } : undefined}
                >
                  <FlagIcon locale={l} />
                  {LOCALE_LABELS[l]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold">{t('profile.appearance')}</p>
            <Segmented
              value={theme}
              onChange={(v) => void changeTheme(v)}
              ariaLabel={t('common.theme')}
              options={[
                { value: 'light', label: t('common.light'), icon: <Icon name="sun" size={14} /> },
                { value: 'dark', label: t('common.dark'), icon: <Icon name="moon" size={14} /> },
                { value: 'system', label: t('common.system') },
              ]}
            />
          </div>

          <div>
            <p className="mb-1 text-sm font-bold">{t('profile.fontSize')}</p>
            <p className="mb-2 text-xs faint">{t('profile.fontSizeHint')}</p>
            <Segmented
              value={String(fontScale)}
              onChange={(v) => void changeFontScale(Number(v))}
              ariaLabel={t('common.fontSize')}
              options={FONT_SCALES.map((scale, i) => ({
                value: String(scale),
                label: scale < 1 ? 'A−' : 'A' + '+'.repeat(i - 1),
                // render each label at its own scale for a true preview
              }))}
            />
          </div>
        </div>
      </Card>

      {/* Notifications */}
      <Card>
        <h2 className="section-title mb-4">{t('profile.notifications')}</h2>
        <div className="space-y-5">
          <Toggle checked={soundEnabled} onChange={(v) => void toggleSound(v)} label={t('profile.soundEnabled')} />
          <p className="text-xs faint">{t('profile.soundHint')}</p>

          <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-bold">{t('profile.push')}</p>
            <p className="mt-0.5 text-xs faint">{t('profile.pushHint')}</p>
            <p className="mt-2 text-sm">
              <span className="chip tint" style={{ '--tint-color': pushState === 'subscribed' ? 'var(--st-approved)' : pushState === 'denied' ? 'var(--st-overdue)' : 'var(--st-draft)' } as React.CSSProperties}>
                {pushStatusLabel[pushState]}
              </span>
            </p>
            {pushState === 'subscribed' ? (
              <Button variant="ghost" size="sm" className="mt-2" loading={pushBusy} onClick={() => void unsubscribePush()}>
                {t('profile.pushDisable')}
              </Button>
            ) : pushState !== 'unsupported' ? (
              <Button size="sm" className="mt-2" loading={pushBusy} onClick={() => void subscribePush()} disabled={pushState === 'denied'}>
                <Icon name="bell" size={15} />{t('notif.enablePush')}
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Security */}
      <Card>
        <h2 className="section-title mb-4">{t('profile.security')}</h2>
        <form onSubmit={changePassword} className="space-y-3.5" noValidate>
          <Field label={t('auth.currentPassword')} required>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required dir="ltr" autoComplete="current-password" />
          </Field>
          <div className="grid gap-3.5 sm:grid-cols-2">
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
        <p className="mt-3 text-xs faint">{t('members.lastLogin')}: {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t('common.never')}</p>
      </Card>

      {/* Workshops */}
      <Card>
        <h2 className="section-title mb-3">{t('profile.workshops')}</h2>
        {memberships.length === 0 ? (
          <p className="text-sm muted">{t('profile.noWorkshops')}</p>
        ) : (
          <ul className="space-y-2">
            {memberships.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-hover)' }}>
                <span className="break-words text-sm font-bold" style={{ color: 'var(--text-1)' }}>{m.workshopName}</span>
                <span className="flex items-center gap-2">
                  <span className="chip text-[0.7rem]">{t(m.role === 'supervisor' ? 'common.supervisor' : m.role === 'delivery_worker' ? 'common.deliveryWorker' : 'common.worker')}</span>
                  <span className="chip text-[0.7rem]">{t(m.status === 'active' ? 'common.active' : m.status === 'pending' ? 'common.pending' : m.status === 'suspended' ? 'common.suspended' : 'common.removed')}</span>
                  {m.joinedAt ? <span className="text-xs faint">{formatDate(m.joinedAt, locale)}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm font-bold" style={{ color: 'var(--text-2)' }}>{t('profile.developedBy')}</p>
        </div>
      </Card>
    </div>
  );
}
