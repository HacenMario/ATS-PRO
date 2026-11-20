'use client';

import { ReactNode } from 'react';
import { LocaleProvider } from './locale';
import { AppearanceProvider } from './appearance';
import { AuthProvider } from './auth';
import { ToastProvider } from './toast';
import { ConfirmProvider } from './confirm';
import { NotificationsProvider } from './notifications';
import { DeliveryOfferProvider } from './delivery-offer';
import type { Locale } from '@ats/shared';

/** Early (pre-hydration) theme/lang/font script to avoid flashes. */
export const EARLY_SETTINGS_SCRIPT = `
(function(){
  try {
    var d = document.documentElement;
    var lang = localStorage.getItem('ats.lang') || (document.cookie.match(/(?:^|; )ats_lang=([^;]*)/)||[])[1] || 'ar';
    var rtl = lang === 'ar';
    d.lang = lang; d.dir = rtl ? 'rtl' : 'ltr';
    var theme = localStorage.getItem('ats.theme') || 'system';
    var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) { d.classList.add('dark'); d.style.colorScheme = 'dark'; } else { d.style.colorScheme = 'light'; }
    var scale = parseFloat(localStorage.getItem('ats.fontScale') || '1');
    if (scale >= 0.85 && scale <= 1.4) d.style.setProperty('--font-scale', String(scale));
  } catch (e) {}
})();
`;

export function RootProviders({ children, defaultLocale }: { children: ReactNode; defaultLocale?: Locale }) {
  return (
    <LocaleProvider defaultLocale={defaultLocale}>
      <AppearanceProvider>
        <ToastProvider>
          <AuthProvider>
            <NotificationsProvider>
              <DeliveryOfferProvider>
                <ConfirmProvider>
                  {children}
                </ConfirmProvider>
              </DeliveryOfferProvider>
            </NotificationsProvider>
          </AuthProvider>
        </ToastProvider>
      </AppearanceProvider>
    </LocaleProvider>
  );
}
