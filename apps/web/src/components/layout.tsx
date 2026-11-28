'use client';

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
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
import { LoadingScreen, notifAccent, Avatar } from '@/components/ui';
import { CommandPalette } from '@/components/command-palette';
import { PwaStatusBars } from '@/components/pwa';

/* ============================================================
   Brand mark — crisp inline SVG, no external asset required.
   ============================================================ */
export function LogoMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="atsLogoBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="55%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id="atsLogoCheck" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#atsLogoBg)" />
      <rect x="17" y="15" width="30" height="36" rx="6" fill="#ffffff" opacity="0.97" />
      <rect x="26" y="11" width="12" height="8" rx="3" fill="#1e1b4b" opacity="0.85" />
      <rect x="23" y="28" width="18" height="3.2" rx="1.6" fill="#312e81" opacity="0.35" />
      <rect x="23" y="35" width="18" height="3.2" rx="1.6" fill="#312e81" opacity="0.35" />
      <rect x="23" y="42" width="11" height="3.2" rx="1.6" fill="#312e81" opacity="0.35" />
      <circle cx="43" cy="44" r="11" fill="url(#atsLogoCheck)" />
      <path d="M37.8 44.2l3.6 3.6 7-7" fill="none" stroke="#1e1b4b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ withWordmark = true, size = 36, compact = false }: { withWordmark?: boolean; size?: number; compact?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <LogoMark size={size} className="shrink-0" />
      {withWordmark ? (
        <span className="flex min-w-0 flex-col leading-none">
          <span dir="ltr" className="flex items-baseline gap-1 text-[1.05rem] font-black tracking-tight" style={{ color: 'var(--text-1)' }}>
            ATS<span className="gradient-text">PRO</span>
          </span>
          {!compact ? <span className="mt-1 truncate text-[0.6rem] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--text-3)' }}>Task Operations</span> : null}
        </span>
      ) : null}
    </span>
  );
}

/* ============================================================
   Flag icon (round-corner flag)
   ============================================================ */
export function FlagIcon({ locale, size = 18 }: { locale: Locale; size?: number }) {
  const src = locale === 'ar' ? '/flags/dz.svg' : locale === 'fr' ? '/flags/fr.svg' : '/flags/gb.svg';
  return (
    <img
      src={src}
      alt=""
      width={Math.round(size * 1.5)}
      height={size}
      className="shrink-0 rounded-[4px] object-cover ring-1 ring-black/10"
      style={{ width: Math.round(size * 1.5), height: size }}
      aria-hidden="true"
    />
  );
}

/** Backwards-compatible avatar bubble. */
export function AvatarBubble({ src, name, size = 32 }: { src?: string | null; name: string; size?: number }) {
  return <Avatar src={src} name={name} size={size} />;
}

/* ============================================================
   Icon set — one consistent 24px line family.
   ============================================================ */
type IconProps = { name: string; size?: number; className?: string; strokeWidth?: number };

export function Icon({ name, size = 20, className = '', strokeWidth = 1.8 }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: `shrink-0 ${className}`,
  };
  switch (name) {
    case 'dashboard': return <svg {...common}><rect x="3" y="3" width="7.5" height="9.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="5.5" rx="2" /><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2" /><rect x="3" y="15.5" width="7.5" height="5.5" rx="2" /></svg>;
    case 'reports': return <svg {...common}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M2.5 20h19" /></svg>;
    case 'download': return <svg {...common}><path d="M12 3v12" /><path d="M7.5 10.5L12 15l4.5-4.5" /><path d="M4 20h16" /></svg>;
    case 'tasks': return <svg {...common}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6l1 1 2-2" /><path d="M3.5 12l1 1 2-2" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></svg>;
    case 'workers': return <svg {...common}><circle cx="9" cy="8" r="3.4" /><path d="M2.8 20c.7-3.4 3.1-5.2 6.2-5.2s5.5 1.8 6.2 5.2" /><circle cx="17" cy="9" r="2.6" /><path d="M16 14.6c2.8.2 4.6 1.7 5.2 4.4" /></svg>;
    case 'workshop': return <svg {...common}><path d="M3 21V10l6 4V10l6 4V10l6 4v7z" /><path d="M3 10V4h4v6" /></svg>;
    case 'bell': return <svg {...common}><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" /><path d="M10 19a2.2 2.2 0 0 0 4 0" /></svg>;
    case 'bell-ring': return <svg {...common}><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" /><path d="M10 19a2.2 2.2 0 0 0 4 0" /><path d="M3 4l1.5 1.5M21 4l-1.5 1.5" /></svg>;
    case 'profile': return <svg {...common}><circle cx="12" cy="8" r="3.6" /><path d="M4.8 20.4c1-3.8 3.9-5.8 7.2-5.8s6.2 2 7.2 5.8" /></svg>;
    case 'settings': return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    case 'admin': return <svg {...common}><path d="M12 3l8 3.5V12c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6.5z" /><path d="M9 12l2 2 4-4" /></svg>;
    case 'logout': return <svg {...common}><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 8l-4 4 4 4" /><path d="M6 12h9" /></svg>;
    case 'menu': return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
    case 'close': return <svg {...common}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case 'sun': return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
    case 'moon': return <svg {...common}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" /></svg>;
    case 'search': return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>;
    case 'plus': return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case 'minus': return <svg {...common}><path d="M5 12h14" /></svg>;
    case 'globe': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></svg>;
    case 'clock': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case 'timer': return <svg {...common}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /><path d="M9 2h6" /></svg>;
    case 'link': return <svg {...common}><path d="M10 14a5 5 0 0 0 7.1 0l2.4-2.4a5 5 0 0 0-7.1-7.1L11 5.9" /><path d="M14 10a5 5 0 0 0-7.1 0L4.5 12.4a5 5 0 0 0 7.1 7.1L13 18" /></svg>;
    case 'check': return <svg {...common}><path d="M4 12.5l5 5L20 6.5" /></svg>;
    case 'check-circle': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.6 2.6L16 9.5" /></svg>;
    case 'play': return <svg {...common}><path d="M7 5l12 7-12 7z" /></svg>;
    case 'flag': return <svg {...common}><path d="M5 21V4h9l-1 3h6l-1.5 4L19 15h-8l1-3H5" /></svg>;
    case 'return': return <svg {...common}><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>;
    case 'cancel': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M8 8l8 8M16 8l-8 8" /></svg>;
    case 'alert-circle': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" /></svg>;
    case 'alert-triangle': return <svg {...common}><path d="M10.3 3.9L2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>;
    case 'info': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
    case 'trash': return <svg {...common}><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" /><path d="M10 11v6M14 11v6" /></svg>;
    case 'copy': return <svg {...common}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
    case 'paperclip': return <svg {...common}><path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.4 17.4a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>;
    case 'mail': return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
    case 'phone': return <svg {...common}><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>;
    case 'pin': return <svg {...common}><path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>;
    case 'shield': return <svg {...common}><path d="M12 3l8 3.5V12c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6.5z" /></svg>;
    case 'shield-check': return <svg {...common}><path d="M12 3l8 3.5V12c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6.5z" /><path d="M9 12l2 2 4-4" /></svg>;
    case 'online': return <svg {...common}><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /><path d="M5.5 12a6.5 6.5 0 0 1 13 0" /><path d="M2.5 12a9.5 9.5 0 0 1 19 0" /></svg>;
    case 'wifi-off': return <svg {...common}><path d="M2 2l20 20" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M5 12.5a10 10 0 0 1 4-2.3M15.5 10.4a10 10 0 0 1 3.5 2.1" /><path d="M12 20h.01" /></svg>;
    case 'refresh': return <svg {...common}><path d="M20 11a8 8 0 1 0-2.3 6.3" /><path d="M20 4v7h-7" /></svg>;
    case 'install': return <svg {...common}><path d="M12 3v12" /><path d="M7.5 10.5L12 15l4.5-4.5" /><rect x="4" y="19" width="16" height="2.5" rx="1.2" /></svg>;
    case 'calendar': return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10h18" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" /></svg>;
    case 'list': return <svg {...common}><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>;
    case 'grid': return <svg {...common}><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></svg>;
    case 'board': return <svg {...common}><rect x="3" y="3" width="5" height="18" rx="1.6" /><rect x="10" y="3" width="5" height="12" rx="1.6" /><rect x="17" y="3" width="4" height="8" rx="1.6" /></svg>;
    case 'filter': return <svg {...common}><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>;
    case 'sliders': return <svg {...common}><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h10M18 18h2" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="16" cy="18" r="2" /></svg>;
    case 'more': return <svg {...common}><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></svg>;
    case 'sparkle': return <svg {...common}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></svg>;
    case 'bolt': return <svg {...common}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>;
    case 'target': return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>;
    case 'trending': return <svg {...common}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>;
    case 'chart': return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M2.5 20h19" /></svg>;
    case 'pie': return <svg {...common}><path d="M21 12a9 9 0 1 1-9-9v9z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" /></svg>;
    case 'chevron-down': return <svg {...common}><path d="M6 9l6 6 6-6" /></svg>;
    case 'chevron-left': return <svg {...common}><path d="M15 18l-6-6 6-6" /></svg>;
    case 'chevron-right': return <svg {...common}><path d="M9 6l6 6-6 6" /></svg>;
    case 'arrow-left': return <svg {...common}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>;
    case 'arrow-right': return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case 'arrow-up-right': return <svg {...common}><path d="M7 17L17 7M8 7h9v9" /></svg>;
    case 'eye': return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>;
    case 'eye-off': return <svg {...common}><path d="M3 3l18 18" /><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" /><path d="M9.9 5.2A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.1 6.1A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.1-.9" /></svg>;
    case 'lock': return <svg {...common}><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
    case 'user-plus': return <svg {...common}><circle cx="9" cy="8" r="3.4" /><path d="M2.8 20c.7-3.4 3.1-5.2 6.2-5.2s5.5 1.8 6.2 5.2" /><path d="M19 8v6M22 11h-6" /></svg>;
    case 'key': return <svg {...common}><circle cx="8" cy="15" r="4" /><path d="M11 12L21 2M17 6l3 3M14 9l2 2" /></svg>;
    case 'help': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.8 2.2c-.8.5-1.3 1-1.3 1.8v.5M12 17h.01" /></svg>;
    case 'file': return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg>;
    case 'message': return <svg {...common}><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" /></svg>;
    case 'send': return <svg {...common}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>;
    case 'share': return <svg {...common}><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6" /></svg>;
    case 'drag': return <svg {...common}><circle cx="9" cy="6" r="1.2" fill="currentColor" /><circle cx="15" cy="6" r="1.2" fill="currentColor" /><circle cx="9" cy="12" r="1.2" fill="currentColor" /><circle cx="15" cy="12" r="1.2" fill="currentColor" /><circle cx="9" cy="18" r="1.2" fill="currentColor" /><circle cx="15" cy="18" r="1.2" fill="currentColor" /></svg>;
    case 'dots': return <svg {...common}><circle cx="12" cy="5" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="19" r="1.4" fill="currentColor" /></svg>;
    case 'award': return <svg {...common}><circle cx="12" cy="9" r="6" /><path d="M8.5 14L7 22l5-3 5 3-1.5-8" /></svg>;
    case 'briefcase': return <svg {...common}><rect x="2.5" y="7" width="19" height="13" rx="2.5" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2.5 12h19" /></svg>;
    case 'zap': return <svg {...common}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>;
    case 'inbox': return <svg {...common}><path d="M3 13h5l2 3h4l2-3h5" /><path d="M5 5h14l2 8v6H3v-6z" /></svg>;
    case 'external': return <svg {...common}><path d="M14 3h7v7" /><path d="M21 3l-9 9" /><path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></svg>;
    case 'monitor': return <svg {...common}><rect x="2" y="3" width="20" height="14" rx="2.5" /><path d="M8 21h8M12 17v4" /></svg>;
    case 'palette': return <svg {...common}><path d="M12 3a9 9 0 1 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a1.5 1.5 0 0 1 0-3h4.5A4.5 4.5 0 0 0 21 10.5C21 6.4 17 3 12 3z" /><circle cx="7.5" cy="11.5" r="1" fill="currentColor" /><circle cx="9.5" cy="7.5" r="1" fill="currentColor" /><circle cx="14" cy="6.5" r="1" fill="currentColor" /></svg>;
    case 'command': return <svg {...common}><path d="M9 9h6v6H9z" /><path d="M9 9V6a3 3 0 1 0-3 3zM15 9V6a3 3 0 1 1 3 3zM9 15v3a3 3 0 1 1-3-3zM15 15v3a3 3 0 1 0 3-3z" /></svg>;
    case 'edit': return <svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
    case 'star': return <svg {...common}><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9z" /></svg>;
    case 'layers': return <svg {...common}><path d="M12 2l9 5-9 5-9-5z" /><path d="M3 12l9 5 9-5" /><path d="M3 17l9 5 9-5" /></svg>;
    case 'database': return <svg {...common}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v7c0 1.7 4 3 9 3s9-1.3 9-3V5" /><path d="M3 12v7c0 1.7 4 3 9 3s9-1.3 9-3v-7" /></svg>;
    case 'server': return <svg {...common}><rect x="2" y="3" width="20" height="7" rx="2" /><rect x="2" y="14" width="20" height="7" rx="2" /><path d="M6 6.5h.01M6 17.5h.01" /></svg>;
    case 'cpu': return <svg {...common}><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>;
  }
}

/* ============================================================
   Language / theme / font controls
   ============================================================ */
export function LanguageSwitcher() {
  const { locale, setLocale, enabledLanguages, t } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const available: Locale[] = (['ar', 'fr', 'en'] as const).filter((l) => !enabledLanguages || enabledLanguages[l]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('common.language')}
        title={t('common.language')}
      >
        <Icon name="globe" size={17} />
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
                <FlagIcon locale={l} size={15} />
                <span>{LOCALE_LABELS[l]}</span>
                {l === locale ? <span className="ms-auto" style={{ color: 'var(--color-brand-500)' }}><Icon name="check" size={14} /></span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ThemeToggle() {
  const { theme, resolved, setTheme } = useAppearance();
  const { t } = useLocale();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => setTheme(next)}
      aria-label={`${t('common.theme')}: ${theme === 'system' ? t('common.system') : theme === 'dark' ? t('common.dark') : t('common.light')}`}
      title={t('common.theme')}
    >
      {resolved === 'dark' ? <Icon name="moon" size={17} /> : <Icon name="sun" size={17} />}
    </button>
  );
}

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
    <button
      type="button"
      className="icon-btn font-black"
      onClick={stepUp}
      disabled={fontScale >= maxScale}
      aria-label={t('common.fontLarger')}
      title={t('common.fontLarger')}
    >
      <span className="text-[0.85rem] tracking-tight">A+</span>
    </button>
  );
}

/* ============================================================
   Notifications bell
   ============================================================ */
export function NotificationsBell() {
  const { unread, items, markRead, markAllRead } = useNotifications();
  const { t, locale } = useLocale();
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
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const recent = items.slice(0, 6);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="icon-btn relative"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t('nav.notifications')}
      >
        <Icon name="bell" size={18} />
        {unread > 0 ? (
          <span className="absolute -end-0.5 -top-0.5 flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full px-1 text-[0.6rem] font-black text-white" style={{ background: 'linear-gradient(135deg,#f43f5e,#e11d48)', boxShadow: '0 0 0 2px var(--surface-solid)' }} aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="dropdown-panel glass-strong animate-fade-up absolute end-0 top-full z-[85] mt-2 w-[min(92vw,23rem)] rounded-2xl p-2">
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
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--text-1)' }}>
                <Icon name="online" size={14} />
                <span className="truncate">{pushState === 'subscribed' ? t('notif.pushEnabled') : pushState === 'denied' ? t('notif.pushDenied') : t('notif.enablePush')}</span>
              </span>
              {pushState === 'denied' ? null : (
                <button type="button" className={`btn btn-sm ${pushState === 'subscribed' ? 'btn-ghost' : 'btn-primary'} !px-2.5 !py-1 text-[0.7rem]`} onClick={() => void togglePush()} disabled={pushBusy}>
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
                        ...(n.readAt ? { opacity: 0.68 } : {}),
                        border: '1px solid color-mix(in srgb, ' + accent + ' 38%, transparent)',
                        background: 'color-mix(in srgb, ' + accent + ' ' + (n.readAt ? '4' : '8') + '%, transparent)',
                      }}
                      onClick={() => { void markRead(n.id); setOpen(false); if (n.link) router.push(n.link); }}
                    >
                      <span className="flex items-start gap-2">
                        {!n.readAt ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} aria-hidden="true" /> : null}
                        <span dir="auto" className="min-w-0 text-sm font-bold leading-snug [overflow-wrap:break-word]" style={{ color: 'var(--text-1)' }}>{label}</span>
                      </span>
                      <span dir="auto" className="text-xs leading-snug muted [overflow-wrap:break-word]" style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden', WebkitLineClamp: 2 }}>{body}</span>
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

/* ============================================================
   Page header — shared by every inner page
   ============================================================ */
export function PageHeader({ title, subtitle, actions, back, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  back?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="animate-fade-up mb-1 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {back ? (
            <button type="button" onClick={() => router.push(back)} className="mb-1.5 inline-flex items-center gap-1 text-xs font-bold text-brand-500 hover:underline kbd-focus">
              <Icon name="arrow-left" size={14} className="rtl:rotate-180" />
              {back}
            </button>
          ) : null}
          <h1 className="page-title">{title}</h1>
          {subtitle ? <p className="mt-1 max-w-2xl text-sm leading-relaxed muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

/* ============================================================
   App shell
   ============================================================ */
interface NavItem { href: string; labelKey: string; icon: string; section: 'workspace' | 'manage' | 'account'; }

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, isSupervisor, isSuperAdmin, logout } = useAuth();
  const { t } = useLocale();
  const { socketConnected, unread } = useNotifications();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const canManage = isSupervisor || isSuperAdmin;

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Global Ctrl/Cmd + K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Lock body scroll while the drawer is open
  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [sidebarOpen]);

  const navItems = useMemo<NavItem[]>(() => {
    if (isSuperAdmin) {
      return [
        { href: '/dashboard', labelKey: 'nav.dashboard', icon: 'dashboard', section: 'workspace' },
        { href: '/tasks', labelKey: 'nav.tasks', icon: 'tasks', section: 'workspace' },
        { href: '/calendar', labelKey: 'nav.calendar', icon: 'calendar', section: 'workspace' },
        { href: '/reports', labelKey: 'nav.reports', icon: 'reports', section: 'workspace' },
        { href: '/admin', labelKey: 'nav.admin', icon: 'admin', section: 'manage' },
        { href: '/notifications', labelKey: 'nav.notifications', icon: 'bell', section: 'account' },
        { href: '/profile', labelKey: 'nav.profile', icon: 'profile', section: 'account' },
      ];
    }
    if (isSupervisor) {
      return [
        { href: '/dashboard', labelKey: 'nav.dashboard', icon: 'dashboard', section: 'workspace' },
        { href: '/tasks', labelKey: 'nav.tasks', icon: 'tasks', section: 'workspace' },
        { href: '/calendar', labelKey: 'nav.calendar', icon: 'calendar', section: 'workspace' },
        { href: '/reports', labelKey: 'nav.reports', icon: 'reports', section: 'workspace' },
        { href: '/workers', labelKey: 'nav.workers', icon: 'workers', section: 'manage' },
        { href: '/workshop', labelKey: 'nav.workshop', icon: 'workshop', section: 'manage' },
        { href: '/notifications', labelKey: 'nav.notifications', icon: 'bell', section: 'account' },
        { href: '/profile', labelKey: 'nav.profile', icon: 'profile', section: 'account' },
      ];
    }
    return [
      { href: '/dashboard', labelKey: 'nav.dashboard', icon: 'dashboard', section: 'workspace' },
      { href: '/tasks', labelKey: 'nav.tasks', icon: 'tasks', section: 'workspace' },
      { href: '/calendar', labelKey: 'nav.calendar', icon: 'calendar', section: 'workspace' },
      { href: '/notifications', labelKey: 'nav.notifications', icon: 'bell', section: 'account' },
      { href: '/profile', labelKey: 'nav.profile', icon: 'profile', section: 'account' },
    ];
  }, [isSuperAdmin, isSupervisor]);

  const mobileItems = useMemo(() => {
    const preferred = ['/dashboard', '/tasks', '/calendar', '/notifications', '/profile'];
    return preferred
      .map((href) => navItems.find((n) => n.href === href))
      .filter((n): n is NavItem => Boolean(n))
      .slice(0, 5);
  }, [navItems]);

  const pageTitle = useMemo(() => {
    const exact: Record<string, string> = {
      '/tasks/new': t('task.newTitle'),
      '/tasks': t('nav.tasks'),
      '/dashboard': t('nav.dashboard'),
      '/calendar': t('nav.calendar'),
      '/reports': t('nav.reports'),
      '/workers': t('nav.workers'),
      '/workshop': t('nav.workshop'),
      '/admin': t('nav.admin'),
      '/notifications': t('nav.notifications'),
      '/profile': t('nav.profile'),
    };
    if (exact[pathname]) return exact[pathname];
    if (pathname.startsWith('/tasks/')) return t('pageTitles.taskDetails').split(' — ')[0] ?? t('pageTitles.taskDetails');
    return t('nav.dashboard');
  }, [pathname, t]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const sections: { key: NavItem['section']; label: string }[] = [
    { key: 'workspace', label: t('nav.section.workspace') },
    { key: 'manage', label: t('nav.section.manage') },
    { key: 'account', label: t('nav.section.account') },
  ];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <Link href="/dashboard" className="min-w-0"><Logo size={34} /></Link>
        <span className="chip !px-2 !py-0.5 text-[0.6rem] font-black" style={{ color: 'var(--color-brand-600)' }}>v2.0</span>
      </div>
      <nav aria-label={t('nav.menu')} className="flex-1 scroll-y space-y-4 px-2.5 pb-4">
        {sections.map((section) => {
          const items = navItems.filter((n) => n.section === section.key);
          if (items.length === 0) return null;
          return (
            <div key={section.key}>
              <p className="sidebar-label mb-1.5">{section.label}</p>
              <div className="space-y-1">
                {items.map((item) => (
                  <Link key={item.href} href={item.href} className="nav-link" data-active={isActive(item.href)}>
                    <Icon name={item.icon} size={19} />
                    <span className="truncate">{t(item.labelKey)}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="space-y-2 border-t p-3" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-[0.7rem] font-bold" style={{ color: 'var(--text-3)' }}>
          <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
          {socketConnected ? t('dash.online') : t('dash.offline')}
        </div>
        <div className="flex items-center gap-2.5 rounded-2xl p-2" style={{ background: 'var(--surface-hover)' }}>
          <Avatar src={user?.avatar} name={user?.name ?? '?'} size={38} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8rem] font-extrabold" style={{ color: 'var(--text-1)' }}>{user?.name}</p>
            <p className="truncate text-[0.66rem] faint">{isSuperAdmin ? t('common.superAdmin') : isSupervisor ? t('common.supervisor') : t('common.worker')}</p>
          </div>
          <button
            type="button"
            onClick={async () => { await logout(); router.replace('/login'); }}
            className="icon-btn !h-9 !w-9 shrink-0"
            aria-label={t('nav.logout')}
            title={t('nav.logout')}
          >
            <Icon name="logout" size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  if (loading || !user) return <LoadingScreen label={t('common.loading')} />;

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-[272px] border-e lg:block" style={{ borderColor: 'var(--border)', background: 'var(--nav-bg)', backdropFilter: 'blur(22px)' }}>
        {sidebar}
      </aside>

      <div className="lg:ps-[272px]">
        {/* Header */}
        <header className="sticky top-0 z-40 border-b" style={{ background: 'var(--header-bg)', borderColor: 'var(--border)', backdropFilter: 'blur(20px) saturate(1.2)', paddingTop: 'var(--safe-t)' }}>
          <div className="mx-auto flex h-[3.75rem] w-full max-w-[1320px] items-center gap-2 px-3 sm:px-5 lg:px-8">
            <button type="button" className="icon-btn lg:hidden" onClick={() => setSidebarOpen(true)} aria-label={t('nav.menu')} aria-expanded={sidebarOpen}>
              <Icon name="menu" size={20} />
            </button>
            <Link href="/dashboard" className="lg:hidden"><LogoMark size={30} /></Link>
            <div className="min-w-0 flex-1 lg:flex-none">
              <h2 className="truncate text-[0.98rem] font-extrabold leading-tight" style={{ color: 'var(--text-1)' }}>{pageTitle}</h2>
              <p className="hidden truncate text-[0.7rem] font-semibold lg:block" style={{ color: 'var(--text-3)' }}>{isSuperAdmin ? t('dash.adminTitle') : isSupervisor ? t('dash.supervisorTitle') : t('dash.workerTitle')}</p>
            </div>

            <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
              <button type="button" className="icon-btn" onClick={() => setPaletteOpen(true)} aria-label={t('palette.title')} title={`${t('palette.title')} (Ctrl+K)`}>
                <Icon name="search" size={18} />
              </button>
              <div className="hidden sm:block"><LanguageSwitcher /></div>
              <div className="hidden sm:block"><FontSizeControls /></div>
              <ThemeToggle />
              <NotificationsBell />
              <Link href="/profile" className="ml-0.5 hidden items-center justify-center sm:flex" aria-label={t('nav.profile')}>
                <Avatar src={user.avatar} name={user.name} size={36} />
              </Link>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="mx-auto w-full max-w-[1320px] px-3 pb-[calc(6.5rem+var(--safe-b))] pt-4 sm:px-5 sm:pt-5 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label={t('nav.menu')}
        className="fixed inset-x-0 bottom-0 z-40 border-t lg:hidden"
        style={{
          background: 'var(--nav-bg)',
          borderColor: 'var(--border)',
          backdropFilter: 'blur(22px) saturate(1.25)',
          WebkitBackdropFilter: 'blur(22px) saturate(1.25)',
          paddingBottom: 'var(--safe-b)',
          boxShadow: '0 -12px 30px -20px rgba(15,23,42,.35)',
        }}
      >
        <div className="mx-auto flex max-w-lg items-stretch px-1.5">
          {mobileItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} className="bottom-nav-item" data-active={active} aria-current={active ? 'page' : undefined}>
                <span className="nav-ico"><Icon name={item.icon} size={21} /></span>
                <span className="max-w-full truncate">{t(item.labelKey)}</span>
                {item.href === '/notifications' && unread > 0 ? <span className="bottom-nav-badge">{unread > 99 ? '99+' : unread}</span> : null}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Floating create button (supervisors / admin) */}
      {canManage ? (
        <Link
          href="/tasks/new"
          aria-label={t('task.action.newTask')}
          className="fixed bottom-[calc(5.1rem+var(--safe-b))] end-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-[var(--shadow-glow)] transition active:scale-95 lg:hidden"
          style={{ background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600) 60%, var(--color-accent-500))' }}
        >
          <Icon name="plus" size={24} strokeWidth={2.4} />
        </Link>
      ) : null}

      {/* Drawer */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[3px]" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 start-0 w-[86vw] max-w-sm border-e" style={{ background: 'var(--nav-bg)', borderColor: 'var(--border)', backdropFilter: 'blur(24px)' }}>
            <button type="button" onClick={() => setSidebarOpen(false)} className="icon-btn absolute end-3 top-3 z-10" aria-label={t('common.close')}>
              <Icon name="close" size={18} />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <PwaStatusBars />
    </div>
  );
}
