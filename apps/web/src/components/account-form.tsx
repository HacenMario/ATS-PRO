'use client';

import { useRef } from 'react';
import { useLocale } from '@/providers/locale';
import { Button, Field, Input, Select } from '@/components/ui';
import { AvatarBubble } from '@/components/layout';
import { fileToAvatarDataUrl } from '@/lib/avatar';

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export interface AccountFormValues {
  name: string;
  email: string;
  password: string;
  confirm: string;
  gender: string;
  birthDate: string;
  bloodType: string;
  recoveryPhrase: string;
  avatar: string | null;
}

export const EMPTY_ACCOUNT_FORM: AccountFormValues = {
  name: '', email: '', password: '', confirm: '', gender: '', birthDate: '', bloodType: '', recoveryPhrase: '', avatar: null,
};

/**
 * Account fields with FULL parity to the public register page: avatar, name,
 * email, password + confirmation, gender, birth date, blood type and recovery
 * phrase — same order, same labels, same hints. Used by every "create account"
 * modal (admin, supervisor) so the forms stay identical to self-registration.
 */
export function AccountFormFields({ values, onChange, fields }: {
  values: AccountFormValues;
  onChange: (patch: Partial<AccountFormValues>) => void;
  fields?: Record<string, string>;
}) {
  const { t } = useLocale();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const pickAvatar = async (file: File) => {
    try {
      onChange({ avatar: await fileToAvatarDataUrl(file) });
    } catch { /* ignore oversized file */ }
  };

  const mismatch = values.password && values.confirm && values.password !== values.confirm;

  return (
    <div className="space-y-4">
      {/* Avatar — identical to register */}
      <div className="flex items-center gap-4">
        <AvatarBubble src={values.avatar} name={values.name || '?'} size={56} />
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{t('auth.avatarOptional')}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pickAvatar(f);
              e.target.value = '';
            }}
          />
          <Button type="button" variant="ghost" size="sm" className="mt-1.5" onClick={() => fileRef.current?.click()}>
            {t('profile.changeAvatar')}
          </Button>
        </div>
      </div>

      <Field label={t('auth.name')} required error={fields?.name ? t(fields.name) : undefined}>
        <Input value={values.name} onChange={(e) => onChange({ name: e.target.value })} required autoComplete="name" />
      </Field>
      <Field label={t('auth.email')} required error={fields?.email ? t(fields.email) : undefined}>
        <Input type="email" value={values.email} onChange={(e) => onChange({ email: e.target.value })} required autoComplete="email" dir="ltr" inputMode="email" />
      </Field>
      <Field label={t('auth.password')} required hint={t('auth.passwordHint')} error={fields?.password ? t(fields.password) : undefined}>
        <Input type="password" value={values.password} onChange={(e) => onChange({ password: e.target.value })} required autoComplete="new-password" dir="ltr" />
      </Field>
      <Field label={t('auth.confirmPassword')} required error={mismatch ? t('errors.passwordMismatch') : undefined}>
        <Input type="password" value={values.confirm} onChange={(e) => onChange({ confirm: e.target.value })} required autoComplete="new-password" dir="ltr" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('auth.gender')}>
          <Select value={values.gender} onChange={(e) => onChange({ gender: e.target.value })}>
            <option value="">{t('common.select')}</option>
            <option value="male">{t('auth.genderMale')}</option>
            <option value="female">{t('auth.genderFemale')}</option>
          </Select>
        </Field>
        <Field label={t('auth.birthDate')}>
          <Input type="date" value={values.birthDate} onChange={(e) => onChange({ birthDate: e.target.value })} />
        </Field>
      </div>
      <Field label={t('auth.bloodType')}>
        <Select value={values.bloodType} onChange={(e) => onChange({ bloodType: e.target.value })}>
          <option value="">{t('common.select')}</option>
          {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
        </Select>
      </Field>

      <Field label={t('auth.recoveryPhrase')} required hint={t('auth.recoveryPhraseHint')} error={fields?.recoveryPhrase ? t(fields.recoveryPhrase) : undefined}>
        <Input value={values.recoveryPhrase} onChange={(e) => onChange({ recoveryPhrase: e.target.value })} required minLength={8} />
      </Field>
    </div>
  );
}
