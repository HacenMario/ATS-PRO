'use client';

import { useEffect } from 'react';
import { PublicLayout } from '@/components/public-layout';
import { useLocale } from '@/providers/locale';

export default function PrivacyPage() {
  const { t } = useLocale();
  useEffect(() => { document.title = t('pageTitles.privacy'); }, [t]);
  const sections = [1, 2, 3, 4, 5];
  return (
    <PublicLayout>
      <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>{t('privacy.title')}</h1>
      <div className="mt-6 space-y-5">
        {sections.map((i) => (
          <section key={i}>
            <h2 className="text-[1.05rem] font-extrabold" style={{ color: 'var(--text-1)' }}>{t(`privacy.s${i}h`)}</h2>
            <p className="mt-1.5 leading-relaxed muted">{t(`privacy.s${i}p`)}</p>
          </section>
        ))}
        <p className="rounded-xl border border-dashed p-4 text-sm muted" style={{ borderColor: 'var(--border-strong)' }}>
          {t('privacy.note')}
        </p>
        <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{t('footer.developedBy')}</p>
      </div>
    </PublicLayout>
  );
}
