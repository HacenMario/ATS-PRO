'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/providers/locale';
import { usePwa, promptInstall } from '@/lib/pwa';
import { Button } from '@/components/ui';
import { Icon } from '@/components/layout';

/** Native-app style banners: new version, offline, install invitation. */
export function PwaStatusBars() {
  const { t } = useLocale();
  const { updateAvailable, setUpdateAvailable, offline, applyUpdate } = usePwa();
  const [showInstall, setShowInstall] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (updateAvailable || offline) return;
    // Invite to install once the user has used the app for a few seconds.
    const timer = window.setTimeout(() => {
      if (!localStorage.getItem('ats.installDismissed')) setShowInstall(true);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [updateAvailable, offline]);

  if (offline) {
    return (
      <div className="fixed inset-x-0 top-0 z-[60] px-3 pt-2" style={{ paddingTop: 'calc(var(--safe-t) + 0.5rem)' }} role="status">
        <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: 'color-mix(in srgb, var(--st-inprogress) 40%, transparent)', background: 'var(--surface-strong)', boxShadow: 'var(--shadow-2)' }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--st-inprogress) 16%, transparent)', color: 'var(--st-inprogress)' }}>
            <Icon name="wifi-off" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.84rem] font-extrabold" style={{ color: 'var(--text-1)' }}>{t('pwa.offlineTitle')}</p>
            <p className="text-[0.72rem] leading-snug muted">{t('pwa.offlineBody')}</p>
          </div>
          <button type="button" onClick={() => window.location.reload()} className="btn btn-ghost btn-sm shrink-0">{t('common.retry')}</button>
        </div>
      </div>
    );
  }

  if (updateAvailable) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3" style={{ paddingBottom: 'calc(var(--safe-b) + 5.2rem)' }} role="status">
        <div className="glass-strong mx-auto flex max-w-2xl items-center gap-3 rounded-2xl p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--color-brand-500) 16%, transparent)', color: 'var(--color-brand-500)' }}>
            <Icon name="refresh" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.84rem] font-extrabold" style={{ color: 'var(--text-1)' }}>{t('pwa.updateTitle')}</p>
            <p className="text-[0.72rem] leading-snug muted">{t('pwa.updateBody')}</p>
          </div>
          <Button size="sm" onClick={applyUpdate}>{t('pwa.updateAction')}</Button>
          <button type="button" onClick={() => setUpdateAvailable(false)} className="icon-btn !h-9 !w-9 shrink-0" aria-label={t('common.close')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      </div>
    );
  }

  if (showInstall && !dismissed) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3" style={{ paddingBottom: 'calc(var(--safe-b) + 5.2rem)' }}>
        <div className="glass-strong mx-auto flex max-w-2xl items-center gap-3 rounded-2xl p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--color-brand-500) 16%, transparent)', color: 'var(--color-brand-500)' }}>
            <Icon name="install" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.84rem] font-extrabold" style={{ color: 'var(--text-1)' }}>{t('pwa.installTitle')}</p>
            <p className="text-[0.72rem] leading-snug muted">{t('pwa.installBody')}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              void promptInstall();
              setShowInstall(false);
              localStorage.setItem('ats.installDismissed', '1');
            }}
            className="btn btn-primary btn-sm shrink-0"
          >
            {t('pwa.installAction')}
          </button>
          <button type="button" onClick={() => { setDismissed(true); localStorage.setItem('ats.installDismissed', '1'); }} className="icon-btn !h-9 !w-9 shrink-0" aria-label={t('common.close')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}

/** Install row for the profile page — works only when the browser offers installation. */
export function InstallAppRow() {
  const { t } = useLocale();
  const { installable, installed, install } = usePwa();
  const [busy, setBusy] = useState(false);

  if (installed) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--st-approved) 14%, transparent)', color: 'var(--st-approved)' }}>
            <Icon name="check" size={19} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold" style={{ color: 'var(--text-1)' }}>{t('pwa.installedTitle')}</p>
            <p className="text-xs muted">{t('pwa.installedBody')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--color-brand-500) 14%, transparent)', color: 'var(--color-brand-500)' }}>
          <Icon name="install" size={19} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-extrabold" style={{ color: 'var(--text-1)' }}>{t('pwa.installTitle')}</p>
          <p className="text-xs leading-snug muted">{installable ? t('pwa.installBody') : t('pwa.installUnavailable')}</p>
        </div>
      </div>
      {installable ? (
        <Button size="sm" variant="soft" loading={busy} onClick={async () => { setBusy(true); await install(); setBusy(false); }}>
          {t('pwa.installAction')}
        </Button>
      ) : null}
    </div>
  );
}
