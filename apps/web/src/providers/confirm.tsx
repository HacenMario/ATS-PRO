'use client';

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import { useLocale } from './locale';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmCtx {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<ConfirmCtx | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const close = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {pending ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="glass-strong animate-modal-in w-full max-w-md rounded-2xl p-5">
            <h2 id="confirm-title" className="text-base font-extrabold" style={{ color: 'var(--text-1)' }}>{pending.title}</h2>
            <p className="mt-2 text-sm leading-relaxed muted">{pending.message}</p>
            <div className="mt-4 flex flex-row justify-end gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => close(false)} autoFocus>
                {pending.cancelLabel ?? t('confirm.cancelLabel')}
              </button>
              <button className={`btn btn-sm ${pending.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
                {pending.confirmLabel ?? t('confirm.confirmLabel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}

export function useConfirm(): ConfirmCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConfirm outside ConfirmProvider');
  return ctx;
}
