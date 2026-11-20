'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useToast } from '@/providers/toast';
import { Button, ErrorState, LoadingScreen } from '@/components/ui';
import { Logo, Icon } from '@/components/layout';
import { formatDate } from '@/lib/format';

interface InvitePreview {
  invite: { workshopName: string; role: string; autoJoin: boolean; expiresAt: string; remaining: number };
}

function InviteInner() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t, locale } = useLocale();
  const { push } = useToast();
  const [data, setData] = useState<InvitePreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'joined' | 'pending' | null>(null);

  useEffect(() => {
    document.title = t('pageTitles.invite');
    api<InvitePreview>(`/api/invitations/${params.code}`, { noRetry: true })
      .then(setData)
      .catch((err) => setError(t((err as { code?: string })?.code ?? 'invite.invalid')));
  }, [params.code, t]);

  const accept = async () => {
    setBusy(true);
    try {
      const res = await api<{ status: string }>('/api/invitations/redeem', { method: 'POST', body: { code: params.code } });
      setResult(res.status === 'active' ? 'joined' : 'pending');
      push('success', t(res.status === 'active' ? 'invite.accepted' : 'invite.pending'));
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <section className="card p-6 text-center">
        <Logo withWordmark={false} size={40} />
        <h1 className="mt-3 text-xl font-black" style={{ color: 'var(--text-1)' }}>{t('invite.title')}</h1>
        <div className="mt-3"><ErrorState message={t('invite.invalid')} /></div>
        <Link href="/login" className="btn btn-primary btn-sm mt-4">{t('nav.login')}</Link>
      </section>
    );
  }

  if (!data || authLoading) return <LoadingScreen label={t('common.loading')} />;

  return (
    <section className="card p-6 sm:p-8 text-center">
      <div className="mx-auto mb-2 w-fit"><Logo withWordmark={false} size={44} /></div>
      <h1 className="text-xl font-black" style={{ color: 'var(--text-1)' }}>{t('invite.title')}</h1>
      <p className="mt-1 text-sm muted">{t('invite.body')}</p>

      <div className="mt-4 rounded-2xl p-4" style={{ background: 'var(--surface-hover)' }}>
        <p className="text-lg font-black" style={{ color: 'var(--text-1)' }}>{data.invite.workshopName}</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs faint">
          <span className="inline-flex items-center gap-1"><Icon name="workers" size={13} />{t('invite.role')}: {t('common.worker')}</span>
          <span className="inline-flex items-center gap-1"><Icon name="clock" size={13} />{t('invite.expires')}: {formatDate(data.invite.expiresAt, locale)}</span>
          <span>{t('invite.usesLeft')}:{' '}{data.invite.remaining}</span>
        </div>
      </div>

      {result ? (
        <div className="mt-5 space-y-3">
          <p className="rounded-xl p-4 text-sm font-bold" style={{ background: 'color-mix(in srgb, var(--st-approved) 12%, transparent)', color: 'var(--st-approved)' }}>
            {t(result === 'joined' ? 'invite.accepted' : 'invite.pending')}
          </p>
          <Button onClick={() => router.replace('/dashboard')}>{t('nav.dashboard')}</Button>
        </div>
      ) : user ? (
        <div className="mt-5">
          <Button onClick={() => void accept()} loading={busy} disabled={data.invite.remaining <= 0}>
            {t('invite.accept')}
          </Button>
        </div>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-2">
          <Link href={`/register?code=${encodeURIComponent(String(params.code))}`} className="btn btn-primary w-full">
            {t('invite.goRegister')}
          </Link>
          <Link href="/login" className="btn btn-ghost w-full">{t('invite.goLogin')}</Link>
        </div>
      )}
    </section>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={null}>
      <InviteInner />
    </Suspense>
  );
}
