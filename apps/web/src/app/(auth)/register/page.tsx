'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { Button, Field, Input, Select, ErrorState, Avatar } from '@/components/ui';
import { Icon, LogoMark } from '@/components/layout';
import { fileToAvatarDataUrl } from '@/lib/avatar';

function strengthOf(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return { score, label: score <= 2 ? 'weak' : score === 3 ? 'fair' : score === 4 ? 'good' : 'strong' };
}

function RegisterForm() {
  const { register, meta, user } = useAuth();
  const { t, locale } = useLocale();
  const router = useRouter();
  const search = useSearchParams();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
  useEffect(() => { if (user) router.replace('/dashboard'); }, [user, router]);

  const mode = meta?.registrationMode ?? 'invite';
  const strength = useMemo(() => strengthOf(password), [password]);
  const strengthColor = strength.score <= 2 ? 'var(--st-overdue)' : strength.score === 3 ? 'var(--st-inprogress)' : strength.score === 4 ? 'var(--st-scheduled)' : 'var(--st-approved)';

  const pickAvatar = async (file: File) => {
    try { setAvatar(await fileToAvatarDataUrl(file)); }
    catch { setError(t('profile.avatarTooLarge')); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    if (password !== confirm) { setError(t('errors.passwordMismatch')); setBusy(false); return; }
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
      <section className="card p-8 text-center">
        <LogoMark size={48} className="mx-auto" />
        <h1 className="mt-4 text-2xl font-black" style={{ color: 'var(--text-1)' }}>{t('auth.register.title')}</h1>
        <p className="mt-3 text-sm muted">{t('auth.registrationClosed')}</p>
        <Link href="/login" className="btn btn-primary mt-5">{t('nav.login')}</Link>
      </section>
    );
  }

  const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  return (
    <section className="card p-6 sm:p-8" aria-labelledby="register-title">
      <div className="mb-6 flex items-center gap-3">
        <LogoMark size={46} />
        <div>
          <h1 id="register-title" className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>{t('auth.register.title')}</h1>
          <p className="text-sm muted">{t('auth.register.subtitle')}</p>
        </div>
      </div>

      <div className="mb-5 flex gap-2.5 rounded-2xl border p-3" style={{ borderColor: 'color-mix(in srgb, var(--st-inprogress) 30%, transparent)', background: 'color-mix(in srgb, var(--st-inprogress) 7%, transparent)' }}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--st-inprogress) 15%, transparent)', color: 'var(--st-inprogress)' }}><Icon name="key" size={16} /></span>
        <p className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--text-2)' }}>{t('auth.inviteRequiredNote')}</p>
      </div>

      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="flex flex-wrap items-center gap-4 rounded-2xl p-3" style={{ background: 'var(--surface-hover)' }}>
          <Avatar src={avatar} name={name || '?'} size={62} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold" style={{ color: 'var(--text-1)' }}>{t('auth.avatarOptional')}</p>
            <p className="text-xs faint">{t('auth.avatarHint')}</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAvatar(f); e.target.value = ''; }}
            />
            <Button type="button" variant="soft" size="sm" className="mt-2" onClick={() => fileRef.current?.click()}>
              <Icon name="paperclip" size={14} />{t('profile.changeAvatar')}
            </Button>
          </div>
        </div>

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-[0.72rem] font-extrabold uppercase tracking-wider faint"><Icon name="profile" size={14} />{t('auth.section.account')}</h2>
          <div className="space-y-4">
            <Field label={t('auth.name')} required error={fields.name ? t(fields.name) : undefined}>
              <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" maxLength={80} />
            </Field>
            <Field label={t('auth.email')} required error={fields.email ? t(fields.email) : undefined}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" dir="ltr" inputMode="email" placeholder="name@example.com" />
            </Field>
          </div>
        </div>

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-[0.72rem] font-extrabold uppercase tracking-wider faint"><Icon name="lock" size={14} />{t('auth.section.security')}</h2>
          <div className="space-y-4">
            <Field label={t('auth.password')} required hint={t('auth.passwordHint')} error={fields.password ? t(fields.password) : undefined}>
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" dir="ltr" className="!pe-12" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute end-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-3)] hover:bg-[var(--surface-hover)]" aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}>
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={17} />
                </button>
              </div>
              {password ? (
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between text-[0.68rem] font-bold">
                    <span className="faint">{t('auth.strength.title')}</span>
                    <span style={{ color: strengthColor }}>{t(`auth.strength.${strength.label}`)}</span>
                  </div>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < strength.score ? strengthColor : 'var(--surface-hover)' }} />
                    ))}
                  </div>
                </div>
              ) : null}
            </Field>
            <Field label={t('auth.confirmPassword')} required error={password && confirm && password !== confirm ? t('errors.passwordMismatch') : undefined}>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" dir="ltr" />
            </Field>
            <Field label={t('auth.recoveryPhrase')} required hint={t('auth.recoveryPhraseHint')} error={fields.recoveryPhrase ? t(fields.recoveryPhrase) : undefined}>
              <Input value={recoveryPhrase} onChange={(e) => setRecoveryPhrase(e.target.value)} required minLength={8} />
            </Field>
          </div>
        </div>

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-[0.72rem] font-extrabold uppercase tracking-wider faint"><Icon name="workers" size={14} />{t('auth.section.personal')}</h2>
          <div className="space-y-4">
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
          </div>
        </div>

        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-[0.72rem] font-extrabold uppercase tracking-wider faint"><Icon name="key" size={14} />{t('auth.section.invite')}</h2>
          <Field label={t('auth.inviteCodeLabel')} required hint={t('auth.inviteCodeHint')} error={fields.inviteCode ? t(fields.inviteCode) : undefined}>
            <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} required dir="ltr" placeholder="ATSO-XXXXXXXX" className="font-mono" />
          </Field>
        </div>

        {error ? <ErrorState message={error} /> : null}

        <Button type="submit" block size="lg" loading={busy} disabled={!name || !email || !password || !inviteCode || !recoveryPhrase}>
          {t('auth.submitRegister')}
          <Icon name="arrow-right" size={17} className="rtl:rotate-180" />
        </Button>
      </form>

      <p className="mt-5 text-center text-sm muted">
        {t('auth.haveAccount')}{' '}
        <Link href="/login" className="font-extrabold text-brand-500 hover:underline kbd-focus">{t('nav.login')}</Link>
      </p>
    </section>
  );
}

export default function RegisterPage() {
  return <RegisterForm />;
}
