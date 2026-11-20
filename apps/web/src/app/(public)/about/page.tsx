'use client';

import { useEffect } from 'react';
import { PublicLayout } from '@/components/public-layout';
import { useLocale } from '@/providers/locale';

export default function AboutPage() {
  const { t } = useLocale();
  useEffect(() => { document.title = t('pageTitles.about'); }, [t]);
  return (
    <PublicLayout>
      <article className="prose-preset space-y-4">
        <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>{t('about.title')}</h1>
        <p className="leading-relaxed muted">{t('about.p1')}</p>
        <p className="leading-relaxed muted">{t('about.p2')}</p>
        <p className="leading-relaxed muted">{t('about.p3')}</p>
        <div className="card p-5">
          <h2 className="section-title mb-2">{t('app.name')}</h2>
          <p className="text-sm muted">{t('app.tagline')} — {t('footer.developedBy')}</p>
        </div>
      </article>
    </PublicLayout>
  );
}
