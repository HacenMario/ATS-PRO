'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { useLocale } from '@/providers/locale';
import { Logo, LanguageSwitcher } from '@/components/layout';
import { useAuth } from '@/providers/auth';
import { LoadingScreen } from '@/components/ui';

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const { loading } = useAuth();
  if (loading) return <LoadingScreen label={t('common.loading')} />;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <Link href="/" aria-label={t('app.name')} className="flex min-w-0 items-center">
          <Logo size={30} />
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="pb-6 text-center text-sm faint">
        {t('footer.developedBy')}
      </footer>
    </div>
  );
}
