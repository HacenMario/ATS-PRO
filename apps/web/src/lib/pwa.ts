'use client';

import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

/** Trigger the browser install prompt if it is available. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    deferredPrompt = null;
    emit();
    return true;
  }
  return false;
}

/** Register the service worker once (push + offline app shell). */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  });
}

export function usePwa() {
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [offline, setOffline] = useState(false);

  const sync = useCallback(() => {
    setInstallable(Boolean(deferredPrompt));
    setInstalled(window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  }, []);

  useEffect(() => {
    sync();
    setOffline(!navigator.onLine);

    const onPrompt = (e: Event) => { e.preventDefault(); deferredPrompt = e as BeforeInstallPromptEvent; sync(); };
    const onInstalled = () => { deferredPrompt = null; sync(); };
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    const sub = () => sync();
    listeners.add(sub);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      listeners.delete(sub);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [sync]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker.getRegistration('/').then((reg) => {
      if (!reg || cancelled) return;
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdateAvailable(true);
        });
      });
      // Check for a new version at most once per session.
      reg.update().catch(() => undefined);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const install = useCallback(async () => {
    const ok = await promptInstall();
    if (ok) setInstallable(false);
    return ok;
  }, []);

  const applyUpdate = useCallback(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration('/').then((reg) => {
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'skip-waiting' });
        window.location.reload();
      } else {
        window.location.reload();
      }
    }).catch(() => window.location.reload());
  }, []);

  return { installable, installed, updateAvailable, setUpdateAvailable, offline, install, applyUpdate };
}
