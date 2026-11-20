'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { Button, Field, Input, Select, ErrorState } from '@/components/ui';
import { AvatarBubble } from '@/components/layout';
import { fileToAvatarDataUrl } from '@/lib/avatar';

function RegisterForm() {
  const { register, meta, user } = useAuth();
  const { t, locale } = useLocale();
  const router = useRouter();
  const search = useSearchParams();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState(search.get('code') ?? '');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [gender, setGender] = useState<'' | 'male' | 'female'>('');
  const [birthDate, setBirthDate] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = t('pageTitles.register'); }, [t]);
  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  const mode = meta?.registrationMode ?? 'invite';

  const pickAvatar = async (file: File) => {
    try {
      setAvatar(await fileToAvatarDataUrl(file));
    } catch {
      setError(t('profile.avatarTooLarge'));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    if (password !== confirm) {
      setError(t('errors.passwordMismatch'));
      setBusy(false);
      return;
    }
    try {
      await register({
        name: name.trim(), email: email.trim(), password,
        preferredLanguage: locale,
        inviteCode: inviteCode.trim(),
        recoveryPhrase: recoveryPhrase.trim(),
        gender: gender || undefined,
        birthDate: birthDate || undefined,
        bloodType: bloodType || undefined,
        avatar: avatar ?? undefined,
      });
      router.replace('/dashboard');
    } catch (err) {
      setFields((err as { fields?: Record<string, string> })?.fields ?? {});
      setError(t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'closed') {
    return (
      <section className="card p-6 text-center">
        <h1 className="text-xl font-black" style={{ color: 'var(--text-1)' }}>{t('auth.register.title')}</h1>
        <p className="mt-3 text-sm muted">{t('auth.registrationClosed')}</p>
        <Link href="/login" className="btn btn-primary btn-sm mt-4">{t('nav.login')}</Link>
      </section>
    );
  }

  const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  return (
    <section className="card p-6 sm:p-8" aria-labelledby="register-title">
      <h1 id="register-title" className="text-xl font-black" style={{ color: 'var(--text-1)' }}>{t('auth.register.title')}</h1>
      <p className="mt-1 text-sm muted">{t('auth.register.subtitle')}</p>
      <p className="mt-3 rounded-xl border border-dashed p-3 text-xs font-semibold" style={{ borderColor: 'var(--border-strong)', color: 'var(--text-2)' }}>
        {t('auth.inviteRequiredNote')}
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <AvatarBubble src={avatar} name={name || '?'} size={64} />
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{t('auth.avatarOptional')}</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickAvatar(f);
                e.target.value = '';
              }}
            />
            <Button type="button" variant="ghost" size="sm" className="mt-1.5" onClick={() => fileRef.current?.click()}>
              {t('profile.changeAvatar')}
            </Button>
          </div>
        </div>

        <Field label={t('auth.name')} required error={fields.name ? t(fields.name) : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        </Field>
        <Field label={t('auth.email')} required error={fields.email ? t(fields.email) : undefined}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" dir="ltr" inputMode="email" />
        </Field>
        <Field label={t('auth.password')} required hint={t('auth.passwordHint')} error={fields.password ? t(fields.password) : undefined}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" dir="ltr" />
        </Field>
        <Field label={t('auth.confirmPassword')} required error={password && confirm && password !== confirm ? t('errors.passwordMismatch') : undefined}>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" dir="ltr" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('auth.gender')}>
            <Select value={gender} onChange={(e) => setGender(e.target.value as 'male' | 'female' | '')}>
              <option value="">{t('common.select')}</option>
              <option value="male">{t('auth.genderMale')}</option>
              <option value="female">{t('auth.genderFemale')}</option>
            </Select>
          </Field>
          <Field label={t('auth.birthDate')}>
            <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </Field>
        </div>
        <Field label={t('auth.bloodType')}>
          <Select value={bloodType} onChange={(e) => setBloodType(e.target.value)}>
            <option value="">{t('common.select')}</option>
            {BLOOD.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </Field>

        <Field label={t('auth.recoveryPhrase')} required hint={t('auth.recoveryPhraseHint')} error={fields.recoveryPhrase ? t(fields.recoveryPhrase) : undefined}>
          <Input value={recoveryPhrase} onChange={(e) => setRecoveryPhrase(e.target.value)} required minLength={8} />
        </Field>

        <Field label={t('auth.inviteCodeLabel')} required hint={t('auth.inviteCodeHint')} error={fields.inviteCode ? t(fields.inviteCode) : undefined}>
          <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} required dir="ltr" placeholder="ATSO-XXXXXXXX" />
        </Field>

        {error ? <ErrorState message={error} /> : null}

        <Button type="submit" className="w-full" loading={busy} disabled={!name || !email || !password || !inviteCode || !recoveryPhrase}>
          {t('auth.submitRegister')}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm muted">
        {t('auth.haveAccount')}{' '}
        <Link href="/login" className="text-brand-500 font-bold hover:underline kbd-focus">{t('nav.login')}</Link>
      </p>
    </section>
  );
}

export default function RegisterPage() {
  return <RegisterForm />;
}
