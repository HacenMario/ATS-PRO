'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastCtx {
  toasts: Toast[];
  push: (kind: ToastKind, title: string, message?: string) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

const KIND_STYLES: Record<ToastKind, { bar: string; icon: string }> = {
  success: { bar: 'bg-brand-500', icon: '✓' },
  error: { bar: 'bg-red-500', icon: '!' },
  warning: { bar: 'bg-amber-500', icon: '!' },
  info: { bar: 'bg-sky-500', icon: 'i' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, title: string, message?: string) => {
    const id = idRef.current++;
    setToasts((list) => [...list.slice(-4), { id, kind, title, message }]);
    window.setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4500);
  }, [dismiss]);

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}

/** Renders the toast stack — mounted once in the root layout. */
export function ToastViewport({ t }: { t: (k: string) => string }) {
  const { toasts, dismiss } = useToast();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:end-6 sm:items-end">
      {toasts.map((toast) => (
        <div key={toast.id} className="glass-strong animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl p-3.5">
          <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-black text-white ${KIND_STYLES[toast.kind].bar}`} aria-hidden>
            {KIND_STYLES[toast.kind].icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-snug" style={{ color: 'var(--text-1)' }}>{toast.title}</p>
            {toast.message ? <p className="mt-0.5 text-[0.83rem] leading-snug muted">{toast.message}</p> : null}
          </div>
          <button onClick={() => dismiss(toast.id)} className="kbd-focus rounded-lg px-1.5 text-lg leading-none faint hover:opacity-70" aria-label={t('common.close')}>×</button>
        </div>
      ))}
    </div>
  );
}
