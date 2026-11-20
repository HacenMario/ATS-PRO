'use client';

import { useEffect } from 'react';
import { PublicLayout } from '@/components/public-layout';
import { useLocale } from '@/providers/locale';

export default function TermsPage() {
  const { t, locale } = useLocale();
  useEffect(() => { document.title = t('pageTitles.terms'); }, [t]);
  const sections = [1, 2, 3, 4, 5];
  return (
    <PublicLayout>
      <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>{t('terms.title')}</h1>
      <p className="mt-2 text-sm faint">{t('terms.updated', { date: new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DZ' : locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'long', numberingSystem: 'latn' }).format(new Date()) })}</p>
      <div className="mt-6 space-y-5">
        {sections.map((i) => (
          <section key={i}>
            <h2 className="text-[1.05rem] font-extrabold" style={{ color: 'var(--text-1)' }}>{t(`terms.s${i}h`)}</h2>
            <p className="mt-1.5 leading-relaxed muted">{t(`terms.s${i}p`)}</p>
          </section>
        ))}
        <p className="rounded-xl border border-dashed p-4 text-sm muted" style={{ borderColor: 'var(--border-strong)' }}>
          {t('terms.note')}
        </p>
        <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{t('footer.developedBy')}</p>
      </div>
    </PublicLayout>
  );
}
