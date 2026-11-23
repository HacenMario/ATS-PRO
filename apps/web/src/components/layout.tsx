'use client';

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useAppearance, FONT_SCALES } from '@/providers/appearance';
import { useNotifications } from '@/providers/notifications';
import { LOCALE_LABELS } from '@ats/i18n';
import type { Locale } from '@ats/i18n';
import { formatRelative } from '@/lib/format';
import { pushSupport, enablePush, disablePush, type PushSupport } from '@/lib/push';
import { useToast } from '@/providers/toast';
import { translate } from '@ats/i18n';
import { LoadingScreen, notifAccent } from '@/components/ui';

/* ---------------- Logo ---------------- */
export function Logo({ withWordmark = true, size = 34 }: { withWordmark?: boolean; size?: number }) {
  const { t } = useLocale();
  return (
    <span className="flex items-center gap-2.5">
      <Image src="/logo-icon.svg" alt={t('app.name')} width={size} height={size} priority />
      {withWordmark ? (
        <span className="flex flex-col leading-none">
          <span className="text-[1.02rem] font-black tracking-tight" style={{ color: 'var(--text-1)' }}>
            ATS <span style={{ color: 'var(--color-brand-500)' }}>PRO</span>
          </span>
          <span className="mt-0.5 text-[0.66rem] font-semibold faint">{t('app.tagline')}</span>
        </span>
      ) : null}
    </span>
  );
}

/* ---------------- Flag icon ---------------- */
export function FlagIcon({ locale, size = 18 }: { locale: Locale; size?: number }) {
  const src = locale === 'ar' ? '/flags/dz.svg' : locale === 'fr' ? '/flags/fr.svg' : '/flags/gb.svg';
  return (
    <img src={src} alt="" width={Math.round(size * 1.5)} height={size} className="rounded-[3px] object-cover" style={{ width: Math.round(size * 1.5), height: size }} aria-hidden="true" />
  );
}

/** Round avatar bubble: photo when present, otherwise the initial letter. */
export function AvatarBubble({ src, name, size = 32 }: { src?: string | null; name: string; size?: number }) {
  if (src) {
    return (
      <img src={src} alt="" width={size} height={size} style={{ width: size, height: size }} className="rounded-full object-cover" aria-hidden="true" />
    );
  }
  return (
    <span className="flex items-center justify-center rounded-full text-xs font-black text-white" style={{ width: size, height: size, background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-brand-700))' }} aria-hidden="true">
      {(name ?? '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

/* ---------------- Icons (consistent inline set) ---------------- */
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (name) {
    case 'dashboard': return <svg {...common}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>;
    case 'reports': return <svg {...common}><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M2.5 20h19"/></svg>;
    case 'download': return <svg {...common}><path d="M12 3v12"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4 20h16"/></svg>;
    case 'tasks': return <svg {...common}><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6l1 1 2-2"/><path d="M3.5 12l1 1 2-2"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/></svg>;
    case 'workers': return <svg {...common}><circle cx="9" cy="8" r="3.4"/><path d="M2.8 20c.7-3.4 3.1-5.2 6.2-5.2s5.5 1.8 6.2 5.2"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.6c2.8.2 4.6 1.7 5.2 4.4"/></svg>;
    case 'workshop': return <svg {...common}><path d="M3 21V10l6 4V10l6 4V10l6 4v7z"/><path d="M3 10V4h4v6"/></svg>;
    case 'bell': return <svg {...common}><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z"/><path d="M10 19a2.2 2.2 0 0 0 4 0"/></svg>;
    case 'profile': return <svg {...common}><circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.4c1-3.8 3.9-5.8 7.2-5.8s6.2 2 7.2 5.8"/></svg>;
    case 'settings': return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.2-1.6l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.7-1.6L13.4 2h-2.8l-.4 2.9a7 7 0 0 0-2.7 1.6l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .5.1 1.1.2 1.6l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.7 1.6l.4 2.9h2.8l.4-2.9a7 7 0 0 0 2.7-1.6l2.3 1 2-3.4-2-1.5c.1-.5.2-1.1.2-1.6z"/></svg>;
    case 'admin': return <svg {...common}><path d="M12 3l8 3.5V12c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6.5z"/><path d="M9 12l2 2 4-4"/></svg>;
    case 'logout': return <svg {...common}><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h9"/></svg>;
    case 'menu': return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case 'close': return <svg {...common}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case 'sun': return <svg {...common}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>;
    case 'moon': return <svg {...common}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>;
    case 'search': return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>;
    case 'plus': return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case 'globe': return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>;
    case 'clock': return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'link': return <svg {...common}><path d="M10 14a5 5 0 0 0 7.1 0l2.4-2.4a5 5 0 0 0-7.1-7.1L11 5.9"/><path d="M14 10a5 5 0 0 0-7.1 0L4.5 12.4a5 5 0 0 0 7.1 7.1L13 18"/></svg>;
    case 'check': return <svg {...common}><path d="M4 12.5l5 5L20 6.5"/></svg>;
    case 'play': return <svg {...common}><path d="M7 5l12 7-12 7z"/></svg>;
    case 'flag': return <svg {...common}><path d="M5 21V4h9l-1 3h6l-1.5 4L19 15h-8l1-3H5"/></svg>;
    case 'return': return <svg {...common}><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>;
    case 'cancel': return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/></svg>;
    case 'trash': return <svg {...common}><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12"/><path d="M10 11v6M14 11v6"/></svg>;
    case 'copy': return <svg {...common}><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
    case 'paperclip': return <svg {...common}><path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.4 17.4a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
    case 'mail': return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>;
    case 'phone': return <svg {...common}><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>;
    case 'pin': return <svg {...common}><path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>;
    case 'shield': return <svg {...common}><path d="M12 3l8 3.5V12c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6.5z"/></svg>;
    case 'online': return <svg {...common}><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><path d="M5.5 12a6.5 6.5 0 0 1 13 0"/><path d="M2.5 12a9.5 9.5 0 0 1 19 0"/></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
  }
}

/* ---------------- Language switcher ---------------- */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, enabledLanguages, t } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const available: Locale[] = (['ar', 'fr', 'en'] as const).filter((l) => !enabledLanguages || enabledLanguages[l]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost btn-sm gap-2"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('common.language')}
      >
        <Icon name="globe" size={16} />
        {!compact ? <FlagIcon locale={locale} /> : null}
        <span className="hidden sm:inline">{LOCALE_LABELS[locale]}</span>
      </button>
      {open ? (
        <ul role="listbox" aria-label={t('common.language')} className="dropdown-panel glass-strong animate-fade-up absolute end-0 top-full z-[85] mt-2 min-w-44 rounded-2xl p-1.5">
          {available.map((l) => (
            <li key={l}>
              <button
                type="button"
                role="option"
                aria-selected={l === locale}
                onClick={() => { setLocale(l); setOpen(false); }}
                className="nav-link w-full !gap-2.5 text-sm"
                data-active={l === locale}
              >
                <FlagIcon locale={l} />
                <span>{LOCALE_LABELS[l]}</span>
                {l === locale ? <span className="ms-auto text-brand-500"><Icon name="check" size={14} /></span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ---------------- Theme toggle ---------------- */
export function ThemeToggle() {
  const { theme, resolved, setTheme } = useAppearance();
  const { t } = useLocale();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm !px-2.5"
      onClick={() => setTheme(next)}
      aria-label={`${t('common.theme')}: ${theme === 'system' ? t('common.system') : theme === 'dark' ? t('common.dark') : t('common.light')}`}
      title={t('common.theme')}
    >
      {resolved === 'dark' ? <Icon name="moon" size={17} /> : <Icon name="sun" size={17} />}
    </button>
  );
}

/* ---------------- Font size control (A+ only) ---------------- */
export function FontSizeControls() {
  const { fontScale, setFontScale } = useAppearance();
  const { t } = useLocale();
  const { patchMe } = useAuth();

  const stepUp = () => {
    const idx = FONT_SCALES.indexOf(fontScale);
    const next = FONT_SCALES[Math.min(FONT_SCALES.length - 1, Math.max(0, (idx === -1 ? 1 : idx) + 1))] ?? 1;
    setFontScale(next);
    void patchMe({ fontScale: next }).catch(() => undefined);
  };

  const maxScale = FONT_SCALES[FONT_SCALES.length - 1] ?? 1.45;
  return (
    <div role="group" aria-label={t('common.fontSize')}>
      {/* Only enlargement lives in the header (A− was removed): the base size is
          restored from the profile appearance settings, never shrunk here. */}
      <button
        type="button"
        className="btn btn-ghost btn-sm !px-2 font-black tracking-tight"
        onClick={stepUp}
        disabled={fontScale >= maxScale}
        aria-label={t('common.fontLarger')}
        title={t('common.fontLarger')}
      >
        <span className="text-[0.92rem]">A+</span>
      </button>
    </div>
  );
}

/* ---------------- Notifications bell ---------------- */
export function NotificationsBell() {
  const { unread } = useNotifications();
  const { t, locale } = useLocale();
  const { items, markRead, markAllRead } = useNotifications();
  const { meta } = useAuth();
  const { push: pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pushState, setPushState] = useState<PushSupport>('none');
  const [pushBusy, setPushBusy] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const refreshPush = useCallback(() => { void pushSupport().then(setPushState); }, []);
  useEffect(() => { refreshPush(); }, [refreshPush, open]);

  const togglePush = async () => {
    setPushBusy(true);
    try {
      if (pushState === 'subscribed') {
        await disablePush();
        pushToast('success', t('profile.pushDisable'));
      } else {
        const key = meta?.push?.vapidPublicKey;
        if (!key) { pushToast('error', t('notif.pushUnsupported')); return; }
        await enablePush(key);
        pushToast('success', t('notif.pushSubscribed'));
      }
      refreshPush();
    } catch {
      pushToast('error', t('notif.pushError'));
    } finally {
      setPushBusy(false);
    }
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const recent = items.slice(0, 6);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost btn-sm relative !px-2.5"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t('nav.notifications')}
      >
        <Icon name="bell" size={17} />
        {unread > 0 ? (
          <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[0.65rem] font-black text-white" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="dropdown-panel glass-strong animate-fade-up absolute end-0 top-full z-[85] mt-2 w-[min(92vw,22rem)] rounded-2xl p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-extrabold" style={{ color: 'var(--text-1)' }}>{t('nav.notifications')}</span>
            {unread > 0 ? (
              <button className="kbd-focus text-xs font-bold text-brand-500 hover:underline" onClick={() => void markAllRead()}>
                {t('notif.markAllRead')}
              </button>
            ) : null}
          </div>
          {pushState !== 'unsupported' ? (
            <div className="mx-1 mb-1 flex items-center justify-between gap-2 rounded-xl px-2.5 py-2" style={{ background: 'var(--surface-hover)' }}>
              <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--text-1)' }}>
                <Icon name="online" size={14} />
                {pushState === 'subscribed' ? t('notif.pushEnabled') : pushState === 'denied' ? t('notif.pushDenied') : t('notif.enablePush')}
              </span>
              {pushState === 'denied' ? null : (
                <button
                  type="button"
                  className={`btn btn-sm ${pushState === 'subscribed' ? 'btn-ghost' : 'btn-primary'} !px-2.5 !py-1 text-[0.72rem]`}
                  onClick={() => void togglePush()}
                  disabled={pushBusy}
                >
                  {pushState === 'subscribed' ? t('admin.invites.disable') : t('notif.enablePush')}
                </button>
              )}
            </div>
          ) : null}
          {recent.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm faint">{t('notif.empty')}</p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto pe-1">
              {recent.map((n) => {
                const label = translate(locale, `notif.title.${n.type}`, n.params);
                const body = translate(locale, `notif.body.${n.type}`, n.params);
                const accent = notifAccent(n.type);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="nav-link w-full flex-col !items-stretch !gap-1 rounded-xl"
                      style={{
                        ...(n.readAt ? { opacity: 0.65 } : {}),
                        // per-type accent frame, matching the notifications page
                        border: '1px solid color-mix(in srgb, ' + accent + ' 40%, transparent)',
                        background: 'color-mix(in srgb, ' + accent + ' ' + (n.readAt ? '4' : '8') + '%, transparent)',
                      }}
                      onClick={() => {
                        void markRead(n.id);
                        setOpen(false);
                        if (n.link) router.push(n.link);
                      }}
                    >
                      <span className="flex items-start gap-2">
                        {!n.readAt ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} aria-hidden="true" /> : null}
                        <span dir="auto" className="text-sm font-bold leading-snug [overflow-wrap:anywhere]" style={{ color: 'var(--text-1)' }}>{label}</span>
                      </span>
                      <span dir="auto" className="text-xs leading-snug muted [overflow-wrap:anywhere]" style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden', WebkitLineClamp: 3 }}>{body}</span>
                      <span className="text-[0.68rem] faint">{formatRelative(n.createdAt, locale)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/notifications" className="btn btn-ghost btn-sm mt-1 w-full" onClick={() => setOpen(false)}>
            {t('notif.pageTitle')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- App shell ---------------- */
interface NavItem { href: string; labelKey: string; icon: string; show?: boolean }

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, isSupervisor, isSuperAdmin, hasWorkshop, logout } = useAuth();
  const { t } = useLocale();
  const { socketConnected } = useNotifications();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return <LoadingScreen label={t('common.loading')} />;
  }

  // Smart per-account ordering:
  //  - worker: dashboard, tasks, notifications, profile (workshop page is not shown to workers)
  //  - delivery worker: dashboard (delivery stats), tasks (deliveries), notifications, profile
  //  - supervisor: dashboard, tasks, workers, workshop, profile
  //  - super admin: dashboard, administration, tasks, profile
  const navItems: NavItem[] = isSuperAdmin
    ? [
        { href: '/dashboard', labelKey: 'nav.dashboard', icon: 'dashboard' },
        { href: '/admin', labelKey: 'nav.admin', icon: 'admin' },
        { href: '/tasks', labelKey: 'nav.tasks', icon: 'tasks' },
        { href: '/reports', labelKey: 'nav.reports', icon: 'reports' },
        { href: '/profile', labelKey: 'nav.profile', icon: 'profile' },
      ]
    : isSupervisor
      ? [
          { href: '/dashboard', labelKey: 'nav.dashboard', icon: 'dashboard' },
          { href: '/tasks', labelKey: 'nav.tasks', icon: 'tasks' },
          { href: '/reports', labelKey: 'nav.reports', icon: 'reports' },
          { href: '/workers', labelKey: 'nav.workers', icon: 'workers' },
          { href: '/workshop', labelKey: 'nav.workshop', icon: 'workshop' },
          { href: '/profile', labelKey: 'nav.profile', icon: 'profile' },
        ]
      : [
          { href: '/dashboard', labelKey: 'nav.dashboard', icon: 'dashboard' },
          { href: '/tasks', labelKey: 'nav.tasks', icon: 'tasks' },
          { href: '/notifications', labelKey: 'nav.notifications', icon: 'bell' },
          { href: '/profile', labelKey: 'nav.profile', icon: 'profile' },
        ];

  const mobileItems = navItems.slice(0, 4);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const sidebar = (
    <nav aria-label={t('nav.menu')} className="flex h-full flex-col gap-1 p-3">
      <Link href="/dashboard" className="mb-3 px-2 pt-1"><Logo /></Link>
      {navItems.map((item) => (
        <Link key={item.href} href={item.href} className="nav-link" data-active={isActive(item.href)}>
          <Icon name={item.icon} />
          <span>{t(item.labelKey)}</span>
        </Link>
      ))}
      <div className="mt-auto space-y-1 pt-3">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs faint">
          <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
          {socketConnected ? t('dash.online') : t('dash.offline')}
        </div>
        <button
          type="button"
          className="nav-link w-full"
          onClick={async () => { await logout(); router.replace('/login'); }}
        >
          <Icon name="logout" />
          <span>{t('nav.logout')}</span>
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b backdrop-blur-xl" style={{ background: 'var(--header-bg)', borderColor: 'var(--border)' }}>
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:px-5">
          <button
            type="button"
            className="btn btn-ghost btn-sm !px-2.5 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label={t('nav.menu')}
            aria-expanded={sidebarOpen}
          >
            <Icon name="menu" />
          </button>
          <Link href="/dashboard" className="lg:hidden"><Logo withWordmark={false} size={30} /></Link>

          <div className="hidden lg:block">
            <span className="text-sm font-extrabold" style={{ color: 'var(--text-2)' }}>
              {(() => {
                const current = [...navItems].reverse().find((item) => isActive(item.href));
                return current ? t(current.labelKey) : t('nav.dashboard');
              })()}
            </span>
          </div>

          <div className="ms-auto flex items-center gap-2">
            {!hasWorkshop && !isSuperAdmin ? (
              <Link href="/workshop" className="chip tint !py-1.5 text-[0.72rem]" style={{ '--tint-color': 'var(--st-inprogress)' } as React.CSSProperties}>
                {t('dash.noWorkshop')}
              </Link>
            ) : null}
            <LanguageSwitcher />
            <FontSizeControls />
            <ThemeToggle />
            <NotificationsBell />
            <Link href="/profile" className="hidden items-center gap-2 sm:flex" aria-label={t('nav.profile')}>
              <AvatarBubble src={user.avatar} name={user.name} size={32} />
              <span className="max-w-28 break-words text-sm font-bold" style={{ color: 'var(--text-1)' }}>{user.name}</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-14 h-[calc(100dvh-3.5rem)] border-e" style={{ borderColor: 'var(--border)' }}>
            {sidebar}
          </div>
        </aside>

        {/* Mobile sidebar drawer */}
        {sidebarOpen ? (
          <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
            <div className="glass-strong animate-fade-up absolute inset-y-0 start-0 w-72 max-w-[85vw]">
              {sidebar}
            </div>
          </div>
        ) : null}

        {/* Main content */}
        <main className="min-w-0 flex-1 px-3 pb-24 pt-4 sm:px-5 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom bar */}
      <nav aria-label={t('nav.menu')} className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-xl lg:hidden" style={{ background: 'var(--header-bg)', borderColor: 'var(--border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
          {mobileItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-w-16 flex-col items-center gap-0.5 px-2 py-2.5 text-[0.66rem] font-bold transition"
              style={{ color: isActive(item.href) ? 'var(--color-brand-600)' : 'var(--text-3)' }}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              <Icon name={item.icon} size={21} />
              <span className="break-words">{t(item.labelKey)}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
