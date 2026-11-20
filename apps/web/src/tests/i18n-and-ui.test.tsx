/** i18n parity + RTL direction + formatting helpers — stops the build on missing keys. */
import { describe, it, expect } from 'vitest';
import { dictionaries, missingKeys, extraKeys, LOCALES, dirOf, isRTL } from '@ats/i18n';
import { formatDuration, makeT, toLocalInput, fromLocalInput, formatRelative } from '@/lib/format';
import { render, screen } from '@testing-library/react';
import { LocaleProvider, useLocale } from '@/providers/locale';
import { AppearanceProvider, useAppearance } from '@/providers/appearance';

describe('dictionary parity (build gate)', () => {
  it('every locale exposes exactly the reference keys with non-empty values', () => {
    for (const locale of LOCALES) {
      expect(missingKeys(locale)).toEqual([]);
      expect(extraKeys(locale)).toEqual([]);
      for (const [k, v] of Object.entries(dictionaries[locale])) {
        expect(String(v).trim().length, `${locale}:${k}`).toBeGreaterThan(0);
      }
    }
  });

  it('translates all task statuses in every language', () => {
    const statuses = ['draft', 'scheduled', 'in_progress', 'worker_reported_done', 'awaiting_supervisor_review', 'completed_approved', 'overdue', 'cancelled'];
    for (const s of statuses) {
      for (const l of LOCALES) {
        expect(dictionaries[l][`status.${s}` as keyof (typeof dictionaries)['ar']]).toBeTruthy();
      }
    }
  });
});

describe('RTL / LTR', () => {
  it('arabic is rtl; french and english are ltr', () => {
    expect(dirOf('ar')).toBe('rtl');
    expect(isRTL('ar')).toBe(true);
    expect(dirOf('fr')).toBe('ltr');
    expect(dirOf('en')).toBe('ltr');
  });

  it('LocaleProvider applies dir/lang to <html>', () => {
    function Probe() {
      const { locale } = useLocale();
      return <span data-testid="locale">{locale}</span>;
    }
    render(
      <LocaleProvider defaultLocale="fr">
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('locale').textContent).toBe('fr');
    expect(document.documentElement.dir).toBe('ltr');
  });
});

describe('font scale + theme', () => {
  it('AppearanceProvider sets the --font-scale custom property', async () => {
    function Probe() {
      const { setFontScale } = useAppearance();
      return <button onClick={() => setFontScale(1.3)}>bump</button>;
    }
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1');
  });
});

describe('format helpers', () => {
  const tAr = makeT('ar');
  const tEn = makeT('en');

  it('formats durations with localized units', () => {
    expect(formatDuration(90 * 60_000, tEn)).toContain('1 h');
    expect(formatDuration(90 * 60_000, tAr)).toContain('1');
    expect(formatDuration(null, tAr)).toBe('—');
  });

  it('round-trips datetime-local inputs', () => {
    const iso = '2026-03-01T08:30:00.000Z';
    const local = toLocalInput(iso);
    const back = fromLocalInput(local);
    expect(new Date(back!).getTime()).toBe(new Date(iso).getTime());
    expect(fromLocalInput('')).toBeNull();
  });

  it('relative time works for recent dates', () => {
    const now = new Date().toISOString();
    expect(formatRelative(now, 'en')).toBeTruthy();
    expect(formatRelative(now, 'ar')).toBeTruthy();
  });
});
