'use client';

import { useEffect, useRef } from 'react';

/**
 * Silent background refresh: re-runs the given loader at a fixed interval so
 * page content stays current even without realtime socket events. The loader
 * receives `silent=true` and must NOT toggle loading skeletons — the update
 * replaces data in place. Paused while the tab is hidden (saves resources,
 * resumes on focus).
 */
export function useSilentRefresh(loader: (silent: boolean) => void | Promise<void>, intervalMs = 15_000): void {
  const ref = useRef(loader);
  ref.current = loader;

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void ref.current(true);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
