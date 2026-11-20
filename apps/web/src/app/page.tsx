'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { LoadingScreen } from '@/components/ui';

/** Entry: signed-in → dashboard, otherwise → login. */
export default function Home() {
  const { user, loading } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/') return;
    if (!loading) {
      router.replace(user ? '/dashboard' : '/login');
    }
  }, [user, loading, router, pathname]);

  return <LoadingScreen label={t('common.loading')} />;
}
