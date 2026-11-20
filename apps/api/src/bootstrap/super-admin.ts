import bcrypt from 'bcryptjs';
import { User } from '../db/models/User';
import { superAdminPasswordSchema } from '@ats/shared';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Idempotent Super Admin bootstrap.
 *
 * Rules (documented in docs/SECURITY.md):
 *  - Reads SUPER_ADMIN_EMAIL + SUPER_ADMIN_PASSWORD (or SUPER_ADMIN_PASSWORD_FILE).
 *  - No defaults: missing/weak values produce a CLEAR config error; the API keeps
 *    running but logs that the platform administrator is not created.
 *  - If the account already exists, the password is NEVER overwritten automatically.
 *  - The password is stored bcrypt-hashed (cost 12), never in plaintext.
 */
export async function bootstrapSuperAdmin(): Promise<void> {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  let password = process.env.SUPER_ADMIN_PASSWORD ?? '';

  if (!password && process.env.SUPER_ADMIN_PASSWORD_FILE) {
    try {
      if (existsSync(process.env.SUPER_ADMIN_PASSWORD_FILE)) {
        password = readFileSync(process.env.SUPER_ADMIN_PASSWORD_FILE, 'utf8').trim();
      }
    } catch {
      password = '';
    }
  }

  if (!email || !password) {
    console.error(
      '[super-admin] CONFIG ERROR: SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (or SUPER_ADMIN_PASSWORD_FILE) are not set. ' +
      'The platform administrator account was NOT created. Set them and restart. No defaults exist.',
    );
    return;
  }

  const parsed = superAdminPasswordSchema().safeParse(password);
  if (!parsed.success) {
    console.error(
      '[super-admin] CONFIG ERROR: the configured SUPER_ADMIN_PASSWORD is too weak. ' +
      'It must be at least 12 characters with lower-case, upper-case, digits and symbols. The account was NOT created.',
    );
    return;
  }

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== 'super_admin') {
      existing.role = 'super_admin';
      await existing.save();
      console.log(`[super-admin] existing account ${email} promoted to super_admin.`);
    } else {
      console.log(`[super-admin] account ${email} already exists — nothing changed.`);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data, 12);
  await User.create({
    email,
    passwordHash,
    name: 'Platform Administrator',
    role: 'super_admin',
    status: 'active',
    preferredLanguage: 'ar',
  });
  console.log(`[super-admin] created super admin account ${email} (password stored hashed).`);
}
