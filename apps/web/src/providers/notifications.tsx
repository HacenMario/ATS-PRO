'use client';

/**
 * Realtime notifications: Socket.IO + polling fallback + offline sync.
 *
 * Strategy:
 *  - Connect a socket with a short-lived token when the user is signed in.
 *  - 'notification' events → unread++ + toast (+ optional sound if enabled
 *    and the browser allows audio; a visual toast is ALWAYS shown).
 *  - On 'online' event / socket reconnect → refetch unread count and mark
 *    the sync (server stored everything while the device was offline).
 *  - A 45s polling fallback covers environments where WebSocket is blocked.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { api, API_URL } from '@/lib/api';
import { useAuth } from './auth';
import { useToast } from './toast';
import { playAlertSound, primeAudio } from '@/lib/sound';
import { registerServiceWorker } from '@/lib/push';
import { translate } from '@ats/i18n';
import type { AppNotification } from '@ats/shared';

interface NotificationsCtx {
  unread: number;
  socketConnected: boolean;
  /** live socket handle (null until connected) — shared with feature providers */
  socket: ReturnType<typeof io> | null;
  items: AppNotification[];
  reload: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  primeAudioNow: () => void;
}

const Ctx = createContext<NotificationsCtx | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { push: pushToast } = useToast();
  const [unread, setUnread] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);
  const [socket, setSocket] = useState<ReturnType<typeof io> | null>(null);
  const [items, setItems] = useState<AppNotification[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userRef = useRef(user);
  userRef.current = user;

  const fetchUnread = useCallback(async () => {
    if (!userRef.current) return;
    try {
      const data = await api<{ unread: number }>('/api/notifications/unread-count');
      setUnread(data.unread);
    } catch { /* offline: server keeps the data, we retry on next tick */ }
  }, []);

  const reload = useCallback(async () => {
    if (!userRef.current) { setItems([]); return; }
    try {
      const data = await api<{ items: AppNotification[]; unread: number }>('/api/notifications?page=1&pageSize=40');
      setItems(data.items);
      setUnread(data.unread);
    } catch { /* ignore */ }
  }, []);

  const markRead = useCallback(async (id: string) => {
    try {
      const res = await api<{ unread: number }>(`/api/notifications/${id}/read`, { method: 'POST', body: {} });
      setUnread(res.unread);
      setItems((list) => list.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    } catch { /* ignore */ }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api('/api/notifications/read-all', { method: 'POST', body: {} });
      setUnread(0);
      setItems((list) => list.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    } catch { /* ignore */ }
  }, []);

  // ---- realtime socket ----
  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
      setUnread(0);
      setItems([]);
      return;
    }

    let cancelled = false;
    const connect = async () => {
      try {
        const { token } = await api<{ token: string }>('/api/auth/socket-token');
        if (cancelled) return;
        const socket = io(API_URL || window.location.origin, {
          path: '/socket.io',
          auth: { token },
          transports: ['websocket', 'polling'],
          reconnectionDelayMax: 15000,
        });
        socketRef.current = socket;
        setSocket(socket);
        socket.on('connect', () => {
          setSocketConnected(true);
          void fetchUnread();
        });
        socket.on('disconnect', () => setSocketConnected(false));
        socket.on('notification', (payload: { title: string; body: string; url?: string; tag?: string }) => {
          setUnread((u) => u + 1);
          pushToast('info', payload.title, payload.body);
          void reload();
          void playSoundIfEnabled();
        });
        socket.on('connect_error', () => setSocketConnected(false));
      } catch { /* token failed; polling fallback keeps working */ }
    };
    void connect();

    // polling fallback
    pollRef.current = setInterval(() => { void fetchUnread(); }, 45000);

    // offline → online sync
    const onOnline = () => {
      void fetchUnread();
      void reload();
    };
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      if (pollRef.current) clearInterval(pollRef.current);
      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const playSoundIfEnabled = useCallback(async () => {
    const u = userRef.current;
    if (!u?.soundEnabled) return;
    playAlertSound();
  }, []);

  // register SW early so push can work after permission
  useEffect(() => {
    if (user) void registerServiceWorker();
  }, [user]);

  // initial unread count after login
  useEffect(() => {
    if (user) {
      void fetchUnread();
      void reload();
    }
  }, [user, fetchUnread, reload]);

  // keep the page title badge
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
  }, [unread]);

  // prime audio on first user interaction (autoplay policy compliance)
  useEffect(() => {
    const prime = () => primeAudio();
    window.addEventListener('pointerdown', prime, { once: true });
    window.addEventListener('keydown', prime, { once: true });
    return () => {
      window.removeEventListener('pointerdown', prime);
      window.removeEventListener('keydown', prime);
    };
  }, []);

  const primeAudioNow = useCallback(() => primeAudio(), []);

  const value = useMemo<NotificationsCtx>(() => ({
    unread,
    socketConnected,
    socket,
    items,
    reload,
    markRead,
    markAllRead,
    primeAudioNow,
  }), [unread, socketConnected, socket, items, reload, markRead, markAllRead, primeAudioNow]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications(): NotificationsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNotifications outside NotificationsProvider');
  return ctx;
}

/** Server-rendered push payloads use the same dictionaries; helper for tests/docs. */
export function pushTextFor(locale: string, type: string, params: Record<string, string>): { title: string; body: string } {
  const loc = (locale === 'fr' || locale === 'en' ? locale : 'ar') as 'fr' | 'en' | 'ar';
  return {
    title: translate(loc, `notif.title.${type}`, params),
    body: translate(loc, `notif.body.${type}`, params),
  };
}
