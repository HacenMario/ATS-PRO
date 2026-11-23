/**
 * Advanced Tasks Supervisor — shared domain types.
 * Used by both the API (apps/api) and the web app (apps/web).
 */

export const ROLES = ['worker', 'delivery_worker', 'supervisor', 'super_admin'] as const;
export type Role = (typeof ROLES)[number];

/** Role of a user *within* a workshop (stored on the Membership document). */
export const WORKSHOP_ROLES = ['worker', 'delivery_worker', 'supervisor'] as const;
export type WorkshopRole = (typeof WORKSHOP_ROLES)[number];

export const ACCOUNT_STATUSES = ['active', 'suspended'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ['active', 'pending', 'suspended', 'removed'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** Full task lifecycle. See docs/ARCHITECTURE.md for the state machine. */
export const TASK_STATUSES = [
  'draft',
  'scheduled',
  'in_progress',
  'worker_reported_done',
  'awaiting_supervisor_review',
  'completed_approved',
  'overdue',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_ACTIONS = [
  'create',
  'update',
  'schedule',
  'start',
  'set_progress',
  'report_done',
  'begin_review',
  'approve',
  'return',
  'cancel',
  'reschedule',
  'comment',
  'attach',
] as const;
export type TaskAction = (typeof TASK_ACTIONS)[number];

/** Delivery lifecycle actions appended to the task change log. */
export const TASK_DELIVERY_ACTIONS = ['delivery_requested', 'delivery_accepted', 'delivery_done'] as const;
export type TaskDeliveryAction = (typeof TASK_DELIVERY_ACTIONS)[number];

/** Delivery status of an approved task requested to the workshop delivery workers. */
export const DELIVERY_STATUSES = ['pending', 'accepted', 'delivered'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export interface TaskDelivery {
  status: DeliveryStatus;
  customerName: string;
  customerPhone: string;
  address: string;
  fee: number;
  workerId: string | null;
  workerName?: string | null;
  requestedAt: string;
  deliveredAt: string | null;
}

export type Locale = 'ar' | 'fr' | 'en';

export const LOCALES: Locale[] = ['ar', 'fr', 'en'];
export const RTL_LOCALES: Locale[] = ['ar'];

export type ThemeMode = 'light' | 'dark' | 'system';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: AccountStatus;
  preferredLanguage: Locale;
  theme: ThemeMode;
  fontScale: number;
  soundEnabled: boolean;
  avatar: string | null;
  gender: 'male' | 'female' | null;
  birthDate: string | null;
  bloodType: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface PublicWorkshop {
  id: string;
  name: string;
  description: string;
  address: string;
  contactPhone: string;
  contactEmail: string;
  status: 'active' | 'suspended';
  timezone: string;
  createdAt: string;
  memberCount?: number;
  activeTaskCount?: number;
  overdueTaskCount?: number;
}

export interface TaskAttachment {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
}

export interface TaskChangeLogEntry {
  at: string;
  byUserId: string;
  byName: string;
  action: TaskAction | TaskDeliveryAction;
  from?: TaskStatus | null;
  to?: TaskStatus | null;
  field?: string;
  note?: string;
}

export interface Task {
  id: string;
  workshopId: string;
  workshopName?: string;
  title: string;
  description: string;
  assigneeId: string | null;
  assigneeName?: string | null;
  createdById: string;
  createdByName?: string;
  status: TaskStatus;
  previousStatus?: TaskStatus | null;
  priority: TaskPriority;
  progress: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  reportedAt: string | null;
  reviewStartedAt: string | null;
  approvedAt: string | null;
  plannedDurationMs: number | null;
  actualDurationMs: number | null;
  location: string;
  safetyNotes: string;
  attachments: TaskAttachment[];
  supervisorComment: string;
  supervisorRating: number | null;
  returnReason: string;
  changeLog: TaskChangeLogEntry[];
  delivery: TaskDelivery | null;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType =
  | 'task_assigned'
  | 'task_updated'
  | 'task_cancelled'
  | 'task_due_soon'
  | 'task_overdue'
  | 'task_reported'
  | 'task_approved'
  | 'task_returned'
  | 'task_rescheduled'
  | 'invitation_used'
  | 'membership_approved'
  | 'membership_removed'
  | 'account_suspended'
  | 'account_activated'
  | 'task_comment'
  | 'password_reset_request'
  | 'password_changed'
  | 'password_changed_by_admin'
  | 'worker_created'
  | 'delivery_ready'
  | 'delivery_accepted'
  | 'delivery_done'
  | 'generic';

export interface AppNotification {
  id: string;
  type: NotificationType;
  /** i18n parameter bag — rendered client-side in the user's current language */
  params: Record<string, string>;
  link: string | null;
  taskId: string | null;
  workshopId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface PlatformSettings {
  registrationMode: 'open' | 'invite' | 'closed';
  enabledLanguages: Record<Locale, boolean>;
  defaultLanguage: Locale;
  contact: {
    email: string;
    phone: string;
    note: string;
  };
}

/** One bucket of the 8-week activity trend (reports page). */
export interface TrendPoint {
  /** ISO timestamp of the week start (Monday 00:00 local tz). */
  weekStart: string;
  created: number;
  completed: number;
}

/** Per-worker performance row (dashboard table + reports board). */
export interface WorkerStatRow {
  userId: string;
  name: string;
  assigned: number;
  completed: number;
  late: number;
  onTime: number;
  avgRating: number | null;
}

export interface TaskStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
  overdue: number;
  completedThisWeek: number;
  createdThisWeek: number;
  /** approved since local midnight (workshop timezone) */
  completedToday: number;
  /** approved since the 1st of the current month */
  completedThisMonth: number;
  /** approved in the rolling last 6 months */
  completedLast6Months: number;
  /** approved since Jan 1st of the current year */
  completedThisYear: number;
  /** active members with the worker role in the scoped workshops */
  workersCount: number;
  /** active members with the supervisor role in the scoped workshops */
  supervisorsCount: number;
  avgCompletionMs: number | null;
  avgRating: number | null;
  pendingReviews: number;
  /** performance board rows, sorted by completed desc (top 20) */
  perWorker: WorkerStatRow[];
  /** active members with the delivery_worker role in the scoped workshops */
  deliveryWorkersCount: number;
  /** delivery pipeline statistics for the scoped workshops */
  delivery: {
    pending: number;
    accepted: number;
    delivered: number;
    /** deliveries completed by the current user (delivery workers only) */
    myDelivered: number;
    /** sum of delivery fees earned by the current user (delivery workers only) */
    myEarnings: number;
  };
  /** created vs completed tasks per week, oldest → newest (8 weeks) */
  trend: TrendPoint[];
  /** task count per priority for the scoped workshops */
  byPriority: Record<TaskPriority, number>;
  /** share of approved tasks finished within their planned duration (0–100, null when unknown) */
  onTimeRate: number | null;
}

/** Stable error codes — the client translates these via the i18n dictionaries. */
export interface ApiErrorBody {
  error: {
    code: string;
    message?: string;
    fields?: Record<string, string>;
  };
}
