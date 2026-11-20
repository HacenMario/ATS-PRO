'use client';

import { useEffect } from 'react';
import { PublicLayout } from '@/components/public-layout';
import { useLocale } from '@/providers/locale';

export default function FaqPage() {
  const { t } = useLocale();
  useEffect(() => { document.title = t('pageTitles.faq'); }, [t]);
  const items = [1, 2, 3, 4, 5, 6];
  return (
    <PublicLayout>
      <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>{t('faq.title')}</h1>
      <div className="mt-6 space-y-3">
        {items.map((i) => (
          <details key={i} className="card group p-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-[1.02rem] font-extrabold" style={{ color: 'var(--text-1)' }}>
              {t(`faq.q${i}`)}
              <span className="text-brand-500 transition group-open:rotate-45" aria-hidden="true">+</span>
            </summary>
            <div className="border-t px-4 py-3 text-sm leading-relaxed muted" style={{ borderColor: 'var(--border)' }}>
              {t(`faq.a${i}`)}
            </div>
          </details>
        ))}
      </div>
    </PublicLayout>
  );
}
