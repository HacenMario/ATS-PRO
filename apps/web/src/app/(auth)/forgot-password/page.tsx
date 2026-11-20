'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/providers/locale';
import { Button, Field, Input, ErrorState, Segmented } from '@/components/ui';
import { API_URL, api } from '@/lib/api';

type Tab = 'phrase' | 'request';

export default function ForgotPasswordPage() {
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>('phrase');

  const [email, setEmail] = useState('');
  const [phrase, setPhrase] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<'recovered' | 'requested' | null>(null);

  useEffect(() => { document.title = t('pageTitles.forgot'); }, [t]);

  const recoverWithPhrase = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    if (newPassword !== confirm) {
      setError(t('errors.passwordMismatch'));
      setBusy(false);
      return;
    }
    try {
      await api('/api/auth/recover-password', {
        method: 'POST',
        body: { email: email.trim(), recoveryPhrase: phrase.trim(), newPassword },
        noRetry: true,
      });
      setDone('recovered');
    } catch (err) {
      setError(t((err as { code?: string })?.code ?? 'errors.invalidCredentials'));
    } finally {
      setBusy(false);
    }
  };

  const requestToSupervisor = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await fetch(`${API_URL}/api/auth/request-reset`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setDone('requested');
    } catch {
      setError(t('errors.networkError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-6 sm:p-8" aria-labelledby="forgot-title">
      <h1 id="forgot-title" className="text-xl font-black" style={{ color: 'var(--text-1)' }}>{t('auth.forgot.title')}</h1>
      <p className="mt-1 text-sm muted">{t('auth.forgot.subtitle')}</p>

      {done ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl p-4 text-sm leading-relaxed font-semibold" style={{ background: 'color-mix(in srgb, var(--st-approved) 12%, transparent)', color: 'var(--st-approved)' }}>
            {done === 'recovered' ? t('auth.recover.success') : t('auth.recover.requestSent')}
          </div>
          <Link href="/login" className="btn btn-primary btn-sm w-full">{t('nav.login')}</Link>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <Segmented
            value={tab}
            onChange={setTab}
            ariaLabel={t('auth.forgot.title')}
            options={[
              { value: 'phrase', label: t('auth.recover.tabPhrase') },
              { value: 'request', label: t('auth.recover.tabRequest') },
            ]}
          />

          {tab === 'phrase' ? (
            <form onSubmit={recoverWithPhrase} className="space-y-4" noValidate>
              <Field label={t('auth.email')} required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" inputMode="email" autoComplete="email" />
              </Field>
              <Field label={t('auth.recover.phrase')} required hint={t('auth.recover.phraseHint')}>
                <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} required minLength={8} />
              </Field>
              <Field label={t('auth.newPassword')} required hint={t('auth.passwordHint')}>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required dir="ltr" autoComplete="new-password" />
              </Field>
              <Field label={t('auth.confirmPassword')} required>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required dir="ltr" autoComplete="new-password" />
              </Field>
              {error ? <ErrorState message={error} /> : null}
              <Button type="submit" className="w-full" loading={busy} disabled={!email || !phrase || !newPassword}>
                {t('auth.recover.submit')}
              </Button>
            </form>
          ) : (
            <form onSubmit={requestToSupervisor} className="space-y-4" noValidate>
              <p className="rounded-xl border border-dashed p-3 text-xs leading-relaxed muted" style={{ borderColor: 'var(--border-strong)' }}>
                {t('auth.recover.requestHint')}
              </p>
              <Field label={t('auth.email')} required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" inputMode="email" autoComplete="email" />
              </Field>
              {error ? <ErrorState message={error} /> : null}
              <Button type="submit" className="w-full" loading={busy} disabled={!email}>
                {t('auth.recover.tabRequest')}
              </Button>
            </form>
          )}

          <p className="text-center text-sm">
            <Link href="/login" className="text-brand-500 font-bold hover:underline kbd-focus">{t('common.back')}</Link>
          </p>
        </div>
      )}
    </section>
  );
}
