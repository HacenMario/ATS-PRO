'use client';

import { AppShell } from '@/components/layout';
import { ToastViewport } from '@/providers/toast';
import { useLocale } from '@/providers/locale';
import type { ReactNode } from 'react';

export default function AppGroupLayout({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  return (
    <>
      <AppShell>{children}</AppShell>
      <ToastViewport t={t} />
    </>
  );
}
