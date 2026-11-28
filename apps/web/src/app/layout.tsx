import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { cookies } from 'next/headers';
import { RootProviders, EARLY_SETTINGS_SCRIPT } from '@/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'ATS PRO - Advanced Tasks Supervisor',
  description: 'إدارة مهام العاملين في الورش والمصانع — Gestion des tâches des ouvriers — Workshop & factory task management',
  applicationName: 'ATS PRO',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'ATS PRO' },
  icons: {
    icon: [
      { url: '/logo-icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/icon-512.png',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Prevent BOTH zoom sources on phones: manual pinch-zoom and the automatic
  // input-focus zoom iOS performs when the keyboard opens. The CSS side keeps
  // every input at ≥16px (see globals.css) — this is the belt-and-suspenders pair.
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f9ff' },
    { media: '(prefers-color-scheme: dark)', color: '#060913' },
  ],
};

const COOKIE_LOCALES = ['ar', 'fr', 'en'] as const;

// The language cookie is kept in sync with the persisted UI preference, so the
// server renders the SAME language the client will hydrate with (no hydration
// mismatch, no language flash). Falls back to Arabic when no cookie is present.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const savedLocale = (await cookies()).get('ats_lang')?.value;
  const ssrLocale = COOKIE_LOCALES.includes(savedLocale as 'ar' | 'fr' | 'en') ? (savedLocale as 'ar' | 'fr' | 'en') : 'ar';

  return (
    <html lang={ssrLocale} dir={ssrLocale === 'ar' ? 'rtl' : 'ltr'} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <Script id="ats-early-settings" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: EARLY_SETTINGS_SCRIPT }} />
      </head>
      <body className="antialiased">
        <RootProviders defaultLocale={ssrLocale}>{children}</RootProviders>
        <Script id="ats-sw-register" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: "if('serviceWorker' in navigator){window.addEventListener('load',function(){try{navigator.serviceWorker.register('/sw.js',{scope:'/'})}catch(e){}})}" }} />
      </body>
    </html>
  );
}
