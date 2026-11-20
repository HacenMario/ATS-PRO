'use client';

/** Web Push helpers: service-worker registration, permission, subscription. */
import { api } from './api';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64t = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64t);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export type PushSupport = 'unsupported' | 'denied' | 'none' | 'subscribed';

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (err) {
    console.warn('[push] SW registration failed:', (err as Error).message);
    return null;
  }
}

export async function pushSupport(): Promise<PushSupport> {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub ? 'subscribed' : 'none';
}

/** Ask permission + subscribe this device. Returns the subscription or null. */
export async function enablePush(vapidPublicKey: string): Promise<PushSubscription | null> {
  const reg = await registerServiceWorker();
  if (!reg) return null;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
  });
  const json = sub.toJSON() as { endpoint: string; keys?: { p256dh: string; auth: string } };
  if (!json.keys) return null;
  await api('/api/push/subscribe', {
    method: 'POST',
    body: { endpoint: json.endpoint, keys: json.keys },
  });
  return sub;
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    const json = sub.toJSON() as { endpoint?: string };
    await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: json.endpoint } }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
}
