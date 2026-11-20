'use client';

import { useEffect } from 'react';
import { PublicLayout } from '@/components/public-layout';
import { useLocale } from '@/providers/locale';
import { useAuth } from '@/providers/auth';
import { Icon } from '@/components/layout';

export default function ContactPage() {
  const { t } = useLocale();
  const { meta } = useAuth();
  useEffect(() => { document.title = t('pageTitles.contact'); }, [t]);

  const email = meta?.contact?.email ?? '';
  const phone = meta?.contact?.phone ?? '';
  const note = meta?.contact?.note ?? '';
  const hasAny = Boolean(email || phone || note);

  return (
    <PublicLayout>
      <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>{t('contact.title')}</h1>
      <p className="mt-3 leading-relaxed muted">{t('contact.intro')}</p>

      <div className="card mt-5 grid gap-4 p-5 sm:grid-cols-2">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--surface-hover)' }} aria-hidden="true"><Icon name="mail" /></span>
          <div className="min-w-0">
            <p className="text-xs font-bold faint">{t('contact.email')}</p>
            {email ? (
              <a href={`mailto:${email}`} className="break-words text-sm font-bold text-brand-500 hover:underline kbd-focus">{email}</a>
            ) : (
              <p className="text-sm muted">{t('common.notConfigured')}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--surface-hover)' }} aria-hidden="true"><Icon name="phone" /></span>
          <div className="min-w-0">
            <p className="text-xs font-bold faint">{t('contact.phone')}</p>
            {phone ? (
              <a href={`tel:${phone}`} className="break-words text-sm font-bold text-brand-500 hover:underline kbd-focus">{phone}</a>
            ) : (
              <p className="text-sm muted">{t('common.notConfigured')}</p>
            )}
          </div>
        </div>
        {note ? (
          <div className="sm:col-span-2 rounded-xl p-3 text-sm leading-relaxed muted" style={{ background: 'var(--surface-hover)' }}>
            <span className="font-bold">{t('contact.note')}: </span>{note}
          </div>
        ) : null}
        {!hasAny ? (
          <p className="sm:col-span-2 rounded-xl border border-dashed p-4 text-sm muted" style={{ borderColor: 'var(--border-strong)' }}>
            {t('contact.notConfigured')}
          </p>
        ) : null}
      </div>

      <section className="card mt-5 p-5">
        <h2 className="section-title mb-2">{t('contact.supportTitle')}</h2>
        <p className="text-sm leading-relaxed muted">{t('contact.supportBody')}</p>
      </section>
    </PublicLayout>
  );
}
