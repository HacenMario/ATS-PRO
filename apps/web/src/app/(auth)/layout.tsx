'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { useLocale } from '@/providers/locale';
import { Logo, LogoMark, LanguageSwitcher, ThemeToggle } from '@/components/layout';
import { Icon } from '@/components/layout';
import { useAuth } from '@/providers/auth';
import { LoadingScreen } from '@/components/ui';

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const { loading, user } = useAuth();
  if (loading) return <LoadingScreen label={t('common.loading')} />;

  const points = [
    { icon: 'bolt', text: t('auth.brand.point1') },
    { icon: 'shield-check', text: t('auth.brand.point2') },
    { icon: 'chart', text: t('auth.brand.point3') },
    { icon: 'globe', text: t('auth.brand.point4') },
  ];

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.02fr_1fr]">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-10" style={{ background: 'linear-gradient(150deg,#12102e 0%,#1e1b4b 35%,#3730a3 70%,#0e7490 115%)' }}>
        <div className="pointer-events-none absolute -end-24 -top-24 h-96 w-96 rounded-full" style={{ background: 'radial-gradient(circle, rgba(34,211,238,.35), transparent 65%)' }} aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -start-20 h-96 w-96 rounded-full" style={{ background: 'radial-gradient(circle, rgba(251,191,36,.22), transparent 65%)' }} aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.9) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.9) 1px,transparent 1px)', backgroundSize: '34px 34px' }} aria-hidden="true" />

        <div className="relative">
          <Logo size={40} />
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-black leading-[1.1] tracking-tight text-white">
            {t('auth.brand.headline')}
            <span className="mt-2 block bg-gradient-to-r from-white via-cyan-200 to-cyan-300 bg-clip-text text-transparent">{t('auth.brand.headlineAccent')}</span>
          </h1>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-white/65">{t('auth.brand.sub')}</p>
          <ul className="mt-8 space-y-4">
            {points.map((p) => (
              <li key={p.icon} className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white backdrop-blur">
                  <Icon name={p.icon} size={18} />
                </span>
                <span className="text-[0.9rem] font-semibold text-white/85">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between gap-4 border-t border-white/15 pt-5">
          <div>
            <p className="text-[0.66rem] font-extrabold uppercase tracking-wider text-white/45">{t('auth.brand.developedBy')}</p>
            <p className="text-sm font-bold text-white/85">{t('footer.developedBy')}</p>
          </div>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.66rem] font-extrabold text-white/70">v2.0</span>
        </div>
      </aside>

      {/* Form panel */}
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Link href={user ? '/dashboard' : '/'} aria-label={t('app.name')} className="flex items-center gap-2.5">
            <LogoMark size={32} />
            <span className="lg:hidden"><Logo size={28} /></span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6">
          <div className="w-full max-w-md animate-fade-up">{children}</div>
        </main>

        <footer className="px-4 pb-6 text-center">
          <p className="text-[0.72rem] font-semibold faint">{t('footer.developedBy')}</p>
        </footer>
      </div>
    </div>
  );
}
