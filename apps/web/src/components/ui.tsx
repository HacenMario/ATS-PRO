'use client';

import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, useEffect, useId } from 'react';
import type { TaskStatus, TaskPriority } from '@ats/shared';

/* ---------------- Button ---------------- */
type ButtonVariant = 'primary' | 'ghost' | 'danger';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, className = '', children, disabled, ...rest }: ButtonProps) {
  const variantClass = variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : 'btn-ghost';
  const sizeClass = size === 'sm' ? 'btn-sm' : '';
  return (
    <button className={`btn ${variantClass} ${sizeClass} ${className}`} disabled={disabled || loading} {...rest}>
      {loading ? <Spinner size={16} light={variant !== 'ghost'} /> : null}
      {children}
    </button>
  );
}

/* ---------------- Spinner / Loading ---------------- */
export function Spinner({ size = 20, light = false }: { size?: number; light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true" style={{ color: light ? '#fff' : 'var(--color-brand-500)' }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function LoadingScreen({ label }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <Spinner size={36} />
      {label ? <p className="text-sm font-semibold muted">{label}</p> : null}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl ${className}`} style={{ background: 'var(--surface-hover)' }} aria-hidden="true" />;
}

export function CardSkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

/* ---------------- Card ---------------- */
export function Card({ children, className = '', as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <Tag className={`card p-5 ${className}`}>{children}</Tag>;
}

/* ---------------- Form fields ---------------- */
interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
        {label}
        {required ? <span className="ms-1 text-red-500" aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="text-xs faint">{hint}</p> : null}
      {error ? <p className="text-xs font-semibold text-red-500" role="alert">{error}</p> : null}
    </div>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`input-base ${className}`} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`input-base min-h-24 resize-y ${className}`} />;
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={`input-base appearance-none ${className}`}>
      {children}
    </select>
  );
}

/* ---------------- Toggle ---------------- */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="kbd-focus flex items-center gap-3"
    >
      <span
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition"
        style={{ background: checked ? 'var(--color-brand-500)' : 'var(--border-strong)' }}
        aria-hidden="true"
      >
        <span
          className="inline-block rounded-full bg-white shadow transition-all"
          style={{ width: 18, height: 18, marginInlineStart: checked ? 24 : 4 }}
        />
      </span>
      <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{label}</span>
    </button>
  );
}

/* ---------------- Segmented control ---------------- */
export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="glass inline-flex flex-wrap gap-1 rounded-xl p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className="kbd-focus flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition"
          style={value === opt.value
            ? { background: 'var(--color-brand-500)', color: '#fff' }
            : { color: 'var(--text-2)' }}
        >
          {opt.icon ?? null}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Badges ---------------- */
const STATUS_STYLE: Record<TaskStatus, string> = {
  draft: 'var(--st-draft)',
  scheduled: 'var(--st-scheduled)',
  in_progress: 'var(--st-inprogress)',
  worker_reported_done: 'var(--st-reported)',
  awaiting_supervisor_review: 'var(--st-review)',
  completed_approved: 'var(--st-approved)',
  overdue: 'var(--st-overdue)',
  cancelled: 'var(--st-cancelled)',
};

export function StatusBadge({ status, label }: { status: TaskStatus; label: string }) {
  const color = STATUS_STYLE[status];
  return (
    <span className="chip tint" style={{ '--tint-color': color } as React.CSSProperties}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

/** Accent color per notification type — gives every notification its own
 * recognizable frame color in the dropdown and on the notifications page. */
export const NOTIF_ACCENT: Record<string, string> = {
  task_assigned: 'var(--color-brand-500)',
  task_updated: 'var(--st-scheduled)',
  task_cancelled: 'var(--st-cancelled)',
  task_due_soon: 'var(--st-inprogress)',
  task_overdue: 'var(--st-overdue)',
  task_reported: 'var(--st-reported)',
  task_approved: 'var(--st-approved)',
  task_returned: 'var(--st-review)',
  task_rescheduled: 'var(--st-scheduled)',
  invitation_used: 'var(--color-brand-500)',
  membership_approved: 'var(--st-approved)',
  membership_removed: 'var(--st-cancelled)',
  account_suspended: 'var(--st-overdue)',
  account_activated: 'var(--st-approved)',
  task_comment: 'var(--color-brand-500)',
  password_reset_request: 'var(--st-review)',
  password_changed: 'var(--st-review)',
  password_changed_by_admin: 'var(--st-review)',
  worker_created: 'var(--st-reported)',
  delivery_ready: 'var(--st-inprogress)',
  delivery_accepted: 'var(--st-scheduled)',
  delivery_done: 'var(--st-approved)',
  generic: 'var(--text-3)',
};

export function notifAccent(type: string): string {
  return NOTIF_ACCENT[type] ?? NOTIF_ACCENT.generic!;
}

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  low: '#64748b',
  medium: '#0d9488',
  high: '#d97706',
  urgent: '#dc2626',
};

export function PriorityBadge({ priority, label }: { priority: TaskPriority; label: string }) {
  const color = PRIORITY_STYLE[priority];
  const flags = { low: 1, medium: 2, high: 3, urgent: 4 } as const;
  return (
    <span className="chip" style={{ borderColor: 'transparent', background: 'var(--surface-hover)', color }} title={label}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <rect key={i} x={i * 4} y={9 - (i < flags[priority] ? 9 : 5)} width="3" height={i < flags[priority] ? 3 : 0} fill={color} opacity={i < flags[priority] ? 1 : 0.25} />
        ))}
        <rect x="0" y="9" width="3" height="3" fill={color} opacity="0.35" />
        <rect x="4" y="6" width="3" height="6" fill={color} opacity={flags[priority] >= 2 ? 0.85 : 0.25} />
        <rect x="8" y="3" width="3" height="9" fill={color} opacity={flags[priority] >= 3 ? 1 : 0.25} />
      </svg>
      {label}
    </span>
  );
}

/* ---------------- Progress ---------------- */
export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--surface-hover)' }} role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full transition-all" style={{ width: `${clamped}%`, background: 'linear-gradient(90deg, var(--color-brand-400), var(--color-brand-600))' }} />
      </div>
      <span className="w-10 text-end text-xs font-bold faint">{clamped}%</span>
    </div>
  );
}

/* ---------------- Rating ---------------- */
export function Rating({ value, onChange, readOnly = false, size = 22 }: {
  value: number | null;
  onChange?: (v: number) => void;
  readOnly?: boolean;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-1" role={readOnly ? 'img' : 'radiogroup'} aria-label={readOnly ? `${value ?? 0}/5` : undefined}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = (value ?? 0) >= star;
        const starEl = (
          <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9z"
              fill={filled ? '#f59e0b' : 'none'} stroke={filled ? '#d97706' : 'var(--border-strong)'} strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        );
        if (readOnly) return <span key={star}>{starEl}</span>;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star}/5`}
            className="kbd-focus rounded p-0.5 transition hover:scale-110"
            onClick={() => onChange?.(star)}
          >
            {starEl}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, children, wide = false }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`glass-strong animate-modal-in max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-extrabold" style={{ color: 'var(--text-1)' }}>{title}</h2>
          <button onClick={onClose} className="kbd-focus rounded-lg px-2 text-xl leading-none faint hover:opacity-70" aria-label={title}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------------- States ---------------- */
export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed py-12 text-center" style={{ borderColor: 'var(--border-strong)' }}>
      {icon ? <div className="faint" aria-hidden="true">{icon}</div> : null}
      <p className="text-base font-extrabold" style={{ color: 'var(--text-1)' }}>{title}</p>
      {hint ? <p className="max-w-sm text-sm leading-relaxed muted">{hint}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl py-10 text-center" style={{ background: 'color-mix(in srgb, var(--st-overdue) 8%, transparent)' }} role="alert">
      <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{message}</p>
      {onRetry ? <Button variant="ghost" size="sm" onClick={onRetry}>{retryLabel}</Button> : null}
    </div>
  );
}

/* ---------------- Pagination ---------------- */
export function Pagination({ page, pages, onPage, labels }: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
  labels: { page: string; of: string; previous: string; next: string };
}) {
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-3 pt-2" aria-label="Pagination">
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={labels.previous}>{labels.previous}</Button>
      <span className="text-sm font-bold faint">{labels.page} {page} {labels.of} {pages}</span>
      <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={labels.next}>{labels.next}</Button>
    </nav>
  );
}

/* ---------------- Donut (3D-styled percentage ring) ---------------- */
export function Donut({ value, label, sublabel, color = 'var(--color-brand-500)', size = 110 }: {
  value: number;
  label: string;
  sublabel?: string;
  color?: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = Math.max(9, Math.round(size * 0.105));
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${clamped}%`}>
        <svg width={size} height={size} style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.18))' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-hover)" strokeWidth={stroke + 3} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-black" style={{ color: 'var(--text-1)' }}>
          {clamped}%
        </span>
      </div>
      <p className="text-center text-[0.78rem] font-bold leading-tight" style={{ color: 'var(--text-2)' }}>{label}</p>
      {sublabel ? <p className="text-center text-[0.7rem] leading-tight faint">{sublabel}</p> : null}
    </div>
  );
}
