import { z } from 'zod';
import { TASK_PRIORITIES, LOCALES, TASK_STATUSES } from './types';

/** Password policy for normal accounts: relaxed on purpose (6+ chars, any characters). */
export function passwordSchema(min = 6) {
  return z
    .string()
    .min(min, 'errors.passwordShort')
    .max(128, 'errors.passwordShort');
}

/** Stricter policy enforced for the bootstrapped Super Admin account. */
export function superAdminPasswordSchema() {
  return passwordSchema(12)
    .regex(/[a-z]/, 'errors.passwordWeak')
    .regex(/[A-Z]/, 'errors.passwordWeak')
    .regex(/[^A-Za-z0-9]/, 'errors.passwordWeak');
}

export const emailSchema = z.string().trim().toLowerCase().email('errors.invalidEmail').max(200, 'errors.invalidEmail');

export const GENDERS = ['male', 'female'] as const;
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'errors.nameRequired').max(80, 'errors.nameRequired'),
  email: emailSchema,
  password: passwordSchema(),
  preferredLanguage: z.enum(['ar', 'fr', 'en']).default('ar'),
  inviteCode: z.string({ required_error: 'errors.inviteRequired', invalid_type_error: 'errors.inviteRequired' }).trim().min(6, 'errors.codeInvalid').max(64),
  gender: z.enum(GENDERS).optional(),
  birthDate: z.coerce.date().optional(),
  bloodType: z.enum(BLOOD_TYPES).optional(),
  recoveryPhrase: z.string().trim().min(8, 'errors.recoveryPhraseShort').max(100),
  avatar: z.string().max(400_000).optional(),
});

/** Account creation by a supervisor (into his workshop) or by the super admin. */
export const createWorkerSchema = z.object({
  name: z.string().trim().min(2, 'errors.nameRequired').max(80),
  email: emailSchema,
  password: passwordSchema(),
  workshopId: z.string().trim().min(1).optional(),
  role: z.enum(['worker', 'delivery_worker', 'supervisor']).default('worker'),
  gender: z.enum(GENDERS).optional(),
  birthDate: z.coerce.date().optional(),
  bloodType: z.enum(BLOOD_TYPES).optional(),
  /** identical parity with the public register form */
  recoveryPhrase: z.string().trim().min(8, 'errors.recoveryPhraseShort').max(100),
  avatar: z.string().max(400_000).optional(),
}).strict();

/** POST /api/tasks/:id/delivery/request — supervisor / platform manager sends an
 * approved task to the workshop delivery workers with the customer details.
 * deliveryWorkerId targets ONE delivery worker; when omitted every delivery
 * worker of the workshop is offered the delivery. */
export const requestDeliverySchema = z.object({
  customerName: z.string().trim().min(2, 'errors.nameRequired').max(80),
  customerPhone: z.string().trim().min(6, 'errors.phoneInvalid').max(25),
  deliveryAddress: z.string().trim().min(3, 'errors.addressRequired').max(300),
  deliveryFee: z.coerce.number().min(0, 'errors.feeInvalid').max(10_000_000),
  deliveryWorkerId: z.string().trim().max(60).optional(),
}).strict();

export const recoverPasswordSchema = z.object({
  email: emailSchema,
  recoveryPhrase: z.string().trim().min(8, 'errors.recoveryPhraseShort').max(100),
  newPassword: passwordSchema(),
}).strict();

export const requestResetSchema = z.object({ email: emailSchema }).strict();

export const setWorkerPasswordSchema = z.object({
  password: passwordSchema(),
}).strict();

export const invitationEditSchema = z.object({
  maxUses: z.number().int().min(1).max(500).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  autoJoin: z.boolean().optional(),
  revoked: z.boolean().optional(),
}).strict();

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'errors.required').max(128),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10, 'errors.required'),
  password: passwordSchema(),
});

export const updateMeSchema = z.object({
  name: z.string().trim().min(2, 'errors.nameRequired').max(80).optional(),
  preferredLanguage: z.enum(['ar', 'fr', 'en']).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  fontScale: z.number().min(0.85).max(1.6).optional(),
  soundEnabled: z.boolean().optional(),
  avatar: z.union([z.string().max(400_000), z.literal('')]).optional(),
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'errors.required').max(128),
  newPassword: passwordSchema(),
});

const isoDate = z.coerce.date({ invalid_type_error: 'errors.invalidDate' });

/** Realistic scheduling: a task can never start in the past. Small 60s
 * tolerance absorbs client/server clock skew and slow submissions. */
const PLANNED_START_TOLERANCE_MS = 60_000;

export const createTaskSchema = z.object({
  title: z.string().trim().min(3, 'errors.titleRequired').max(150, 'errors.titleRequired'),
  description: z.string().trim().min(1, 'errors.required').max(5000),
  assigneeId: z.string().trim().min(1, 'errors.assigneeRequired').optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  location: z.string().trim().max(200).default(''),
  safetyNotes: z.string().trim().max(2000).default(''),
  plannedStart: isoDate.optional().nullable(),
  plannedEnd: isoDate.optional().nullable(),
  /** when true the task is created directly in "scheduled" */
  publish: z.boolean().default(false),
}).strict()
  .refine((v) => !v.publish || (!!v.plannedStart && !!v.plannedEnd && !!v.assigneeId), {
    message: 'errors.scheduleRequiredFields',
    path: ['publish'],
  })
  .refine((v) => !v.plannedStart || !v.plannedEnd || v.plannedEnd.getTime() > v.plannedStart.getTime(), {
    message: 'errors.endBeforeStart',
    path: ['plannedEnd'],
  })
  .refine((v) => !v.plannedStart || v.plannedStart.getTime() >= Date.now() - PLANNED_START_TOLERANCE_MS, {
    message: 'errors.dateInPast',
    path: ['plannedStart'],
  });

export const scheduleSchema = z.object({
  plannedStart: isoDate,
  plannedEnd: isoDate,
  assigneeId: z.string().trim().min(1, 'errors.assigneeRequired'),
}).strict()
  .refine((v) => v.plannedEnd.getTime() > v.plannedStart.getTime(), {
    message: 'errors.endBeforeStart',
    path: ['plannedEnd'],
  })
  .refine((v) => v.plannedStart.getTime() >= Date.now() - PLANNED_START_TOLERANCE_MS, {
    message: 'errors.dateInPast',
    path: ['plannedStart'],
  });

/** (Re)assign a task to another workshop member — allowed only while the work
 * has not started yet (draft / scheduled). */
export const assignSchema = z.object({
  assigneeId: z.string().trim().min(1, 'errors.assigneeRequired'),
}).strict();

export const updateTaskSchema = z.object({
  title: z.string().trim().min(3).max(150).optional(),
  description: z.string().trim().min(1).max(5000).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  location: z.string().trim().max(200).optional(),
  safetyNotes: z.string().trim().max(2000).optional(),
  assigneeId: z.string().trim().min(1).optional(),
}).strict();

export const progressSchema = z.object({ progress: z.number().int().min(0).max(100) }).strict();
export const reportDoneSchema = z.object({ note: z.string().trim().max(2000).optional() }).strict();
export const approveSchema = z.object({
  rating: z.number().int().min(1).max(5, 'errors.ratingRequired'),
  comment: z.string().trim().max(2000).default(''),
}).strict();
export const returnTaskSchema = z.object({ reason: z.string().trim().min(3, 'errors.reasonRequired').max(1000) }).strict();
export const cancelTaskSchema = z.object({ reason: z.string().trim().max(1000).optional() }).strict();
export const commentSchema = z.object({ text: z.string().trim().min(1, 'errors.required').max(2000) }).strict();

export const workshopSchema = z.object({
  name: z.string().trim().min(2, 'errors.nameRequired').max(120),
  description: z.string().trim().max(2000).default(''),
  address: z.string().trim().max(300).default(''),
  contactPhone: z.string().trim().max(40).default(''),
  contactEmail: z.union([emailSchema, z.literal('')]).default(''),
  timezone: z.string().trim().max(64).default('Africa/Algiers'),
  status: z.enum(['active', 'suspended']).default('active'),
}).strict();

export const workshopUpdateSchema = workshopSchema.partial();

export const memberRoleSchema = z.object({ role: z.enum(['worker', 'delivery_worker', 'supervisor']) }).strict();
export const memberStatusSchema = z.object({ status: z.enum(['active', 'suspended', 'removed']) }).strict();

export const invitationSchema = z.object({
  role: z.enum(['worker']).default('worker'),
  autoJoin: z.boolean().default(true),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  maxUses: z.number().int().min(1).max(500).default(50),
}).strict();

export const redeemSchema = z.object({ code: z.string().trim().min(6, 'errors.codeInvalid').max(64) }).strict();

export const adminUpdateUserSchema = z.object({
  status: z.enum(['active', 'suspended']).optional(),
  role: z.enum(['worker', 'supervisor', 'super_admin']).optional(),
  name: z.string().trim().min(2).max(80).optional(),
  email: emailSchema.optional(),
}).strict();

export const platformSettingsSchema = z.object({
  registrationMode: z.enum(['open', 'invite', 'closed']).optional(),
  enabledLanguages: z.object({
    ar: z.boolean(),
    fr: z.boolean(),
    en: z.boolean(),
  }).optional(),
  defaultLanguage: z.enum(['ar', 'fr', 'en']).optional(),
  contact: z.object({
    email: z.union([emailSchema, z.literal('')]).default(''),
    phone: z.string().trim().max(40).default(''),
    note: z.string().trim().max(500).default(''),
  }).optional(),
}).strict();

export const taskQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum([...TASK_STATUSES, 'all']).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  workerId: z.string().trim().optional(),
  q: z.string().trim().max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(['newest', 'oldest', 'dueAsc', 'dueDesc', 'priority']).default('newest'),
  mine: z.enum(['1', '0']).optional(),
}).strip();

export const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  unread: z.enum(['1', '0']).optional(),
}).strip();

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type CreateWorkerInput = z.infer<typeof createWorkerSchema>;
export type RequestDeliveryInput = z.infer<typeof requestDeliverySchema>;
export type ScheduleInput = z.infer<typeof scheduleSchema>;
export type TaskQueryInput = z.infer<typeof taskQuerySchema>;
export type PlatformSettingsInput = z.infer<typeof platformSettingsSchema>;
