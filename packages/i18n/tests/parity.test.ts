import { describe, it, expect } from 'vitest';
import { dictionaries, missingKeys, extraKeys, translate, isRTL, dirOf, LOCALES, LOCALES as locales } from '../src';

describe('i18n dictionaries parity', () => {
  it('fr and en expose exactly the reference keys', () => {
    for (const locale of locales) {
      expect(missingKeys(locale), `${locale} missing keys`).toEqual([]);
      expect(extraKeys(locale), `${locale} extra keys`).toEqual([]);
    }
  });

  it('no dictionary value is empty', () => {
    for (const locale of LOCALES) {
      for (const [k, v] of Object.entries(dictionaries[locale])) {
        expect(String(v).trim().length, `${locale}:${k}`).toBeGreaterThan(0);
      }
    }
  });

  it('interpolates {params}', () => {
    expect(translate('en', 'notif.unreadCount', { n: 3 })).toContain('3');
    expect(translate('ar', 'timeline.set_progress', { p: 50 })).toContain('50');
    expect(translate('fr', 'common.durationHours', { n: 8 })).toContain('8');
  });

  it('falls back to the key when missing', () => {
    expect(translate('en', 'totally.bogus.key')).toBe('totally.bogus.key');
  });
});

describe('direction helpers', () => {
  it('arabic is RTL, french and english are LTR', () => {
    expect(isRTL('ar')).toBe(true);
    expect(isRTL('fr')).toBe(false);
    expect(isRTL('en')).toBe(false);
    expect(dirOf('ar')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
  });
});

describe('status & priority translations exist in all locales', () => {
  const statuses = ['draft', 'scheduled', 'in_progress', 'worker_reported_done', 'awaiting_supervisor_review', 'completed_approved', 'overdue', 'cancelled'];
  const priorities = ['low', 'medium', 'high', 'urgent'];
  it('statuses translated', () => {
    for (const s of statuses) for (const l of LOCALES) {
      expect(translate(l, `status.${s}`)).not.toBe(`status.${s}`);
    }
  });
  it('priorities translated', () => {
    for (const p of priorities) for (const l of LOCALES) {
      expect(translate(l, `priority.${p}`)).not.toBe(`priority.${p}`);
    }
  });
});
