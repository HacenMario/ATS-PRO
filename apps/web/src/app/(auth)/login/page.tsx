'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { Button, Input, ErrorState } from '@/components/ui';
import { Icon, LogoMark } from '@/components/layout';

export default function LoginPage() {
  const { user, login } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = t('pageTitles.login');
    if (user) router.replace('/dashboard');
  }, [t, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      router.replace('/dashboard');
    } catch (err) {
      setError(t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card relative overflow-hidden p-6 sm:p-8" aria-labelledby="login-title">
      <div className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full" style={{ background: 'radial-gradient(circle, rgba(99,102,241,.18), transparent 65%)' }} aria-hidden="true" />
      <div className="relative">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark size={46} />
          <div>
            <h1 id="login-title" className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>{t('auth.login.title')}</h1>
            <p className="text-sm muted">{t('auth.login.subtitle')}</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-email" className="field-label">{t('auth.email')}<span className="text-red-500" aria-hidden="true"> *</span></label>
            <div className="relative">
              <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]"><Icon name="mail" size={17} /></span>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                dir="ltr"
                inputMode="email"
                placeholder="name@example.com"
                className="!ps-11"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="login-password" className="field-label">{t('auth.password')}<span className="text-red-500" aria-hidden="true"> *</span></label>
              <Link href="/forgot-password" className="text-[0.72rem] font-extrabold text-brand-500 hover:underline">{t('auth.forgotLink')}</Link>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]"><Icon name="lock" size={17} /></span>
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                dir="ltr"
                className="!ps-11 !pe-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute end-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-3)] hover:bg-[var(--surface-hover)]"
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                title={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={17} />
              </button>
            </div>
          </div>

          {error ? <ErrorState message={error} /> : null}

          <Button type="submit" block size="lg" loading={busy} disabled={!email || !password}>
            {t('auth.submitLogin')}
            <Icon name="arrow-right" size={17} className="rtl:rotate-180" />
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[0.68rem] font-bold uppercase tracking-wide faint">
          <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
          {t('auth.or')}
          <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
        </div>

        <p className="text-center text-sm muted">
          {t('auth.noAccount')}{' '}
          <Link href="/register" className="font-extrabold text-brand-500 hover:underline kbd-focus">{t('nav.register')}</Link>
        </p>
      </div>
    </section>
  );
}
