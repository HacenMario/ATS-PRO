'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { Button, Field, Input, ErrorState } from '@/components/ui';
import { Icon } from '@/components/layout';

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
    <section className="card p-6 sm:p-8" aria-labelledby="login-title">
      <h1 id="login-title" className="text-xl font-black" style={{ color: 'var(--text-1)' }}>{t('auth.login.title')}</h1>
      <p className="mt-1 text-sm muted">{t('auth.login.subtitle')}</p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Field label={t('auth.email')} required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            dir="ltr"
            inputMode="email"
            placeholder="name@example.com"
          />
        </Field>
        <Field label={t('auth.password')} required>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              dir="ltr"
              className="!pe-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="kbd-focus absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 faint hover:opacity-70"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <Icon name="profile" size={16} />
            </button>
          </div>
        </Field>

        {error ? <ErrorState message={error} /> : null}

        <Button type="submit" className="w-full" loading={busy} disabled={!email || !password}>
          {t('auth.submitLogin')}
        </Button>
      </form>

      <div className="mt-5 flex flex-col items-center gap-2 text-sm">
        <Link href="/forgot-password" className="text-brand-500 font-bold hover:underline kbd-focus">{t('auth.forgotLink')}</Link>
        <p className="muted">
          {t('auth.noAccount')}{' '}
          <Link href="/register" className="text-brand-500 font-bold hover:underline kbd-focus">{t('nav.register')}</Link>
        </p>
      </div>
    </section>
  );
}
