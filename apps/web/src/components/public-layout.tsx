'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { useLocale } from '@/providers/locale';
import { LanguageSwitcher, ThemeToggle, Logo } from '@/components/layout';
import { useAuth } from '@/providers/auth';

/** Shared chrome for the informational pages (about/faq/contact/terms/privacy). */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const { user, loading } = useAuth();
  const links = [
    { href: '/about', key: 'nav.about' },
    { href: '/faq', key: 'nav.faq' },
    { href: '/contact', key: 'nav.contact' },
    { href: '/terms', key: 'nav.terms' },
    { href: '/privacy', key: 'nav.privacy' },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b backdrop-blur-xl" style={{ background: 'var(--header-bg)', borderColor: 'var(--border)' }}>
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href="/" aria-label={t('nav.home')}><Logo /></Link>
          <nav className="ms-auto hidden items-center gap-1 md:flex" aria-label={t('nav.menu')}>
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="nav-link !py-2 text-sm">{t(l.key)}</Link>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-2 md:ms-2">
            <LanguageSwitcher />
            <ThemeToggle />
            {!loading ? (
              <Link href={user ? '/dashboard' : '/login'} className="btn btn-primary btn-sm">
                {user ? t('nav.dashboard') : t('nav.login')}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t py-6 text-center text-sm" style={{ borderColor: 'var(--border)' }}>
        <nav className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1" aria-label={t('nav.menu')}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="faint hover:underline">{t(l.key)}</Link>
          ))}
        </nav>
        <p className="faint">
          © {new Date().getFullYear()} ATS PRO - Advanced Tasks Supervisor — {t('footer.developedBy')}
        </p>
      </footer>
    </div>
  );
}
