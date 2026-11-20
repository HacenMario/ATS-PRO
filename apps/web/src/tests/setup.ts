import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// jsdom lacks matchMedia — required by the appearance provider.
beforeEach(() => {
  if (typeof window !== 'undefined' && !window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  }
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.style.cssText = '';
  document.cookie = 'ats_lang=; path=/; max-age=0';
});
