'use client';

import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, useEffect, useId, useRef } from 'react';
import type { TaskStatus, TaskPriority } from '@ats/shared';

/* ============================================================
   Button
   ============================================================ */
export type ButtonVariant = 'primary' | 'ghost' | 'soft' | 'danger' | 'quiet';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  block,
  className = '',
  children,
  disabled,
  onClick,
  ...rest
}: ButtonProps) {
  const variantClass = {
    primary: 'btn-primary',
    ghost: 'btn-ghost',
    soft: 'btn-soft',
    danger: 'btn-danger',
    quiet: 'btn-quiet',
  }[variant];
  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';
  return (
    <button
      className={`btn ${variantClass} ${sizeClass} ${block ? 'btn-block' : ''} ${className}`}
      disabled={disabled || loading}
      onClick={(e) => {
        // Subtle haptic tick on supported devices — native-app feel, no-op elsewhere.
        try { navigator.vibrate?.(8); } catch { /* unsupported */ }
        onClick?.(e);
      }}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 14 : 16} light={variant === 'primary' || variant === 'danger'} /> : null}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  active?: boolean;
}
export function IconButton({ label, children, active, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? '!text-brand-600 !border-brand-500/40 !bg-brand-500/10' : ''} ${className}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ============================================================
   Spinner / loading / skeleton
   ============================================================ */
export function Spinner({ size = 20, light = false }: { size?: number; light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0 animate-spin" aria-hidden="true" style={{ color: light ? '#fff' : 'var(--color-brand-500)' }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function LoadingScreen({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-4" role="status" aria-live="polite">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-[1.35rem] bg-gradient-to-br from-brand-500 to-accent-500 opacity-20 blur-xl" aria-hidden="true" />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-[1.15rem] bg-gradient-to-br from-brand-500 via-brand-600 to-accent-500 text-white shadow-[var(--shadow-glow)]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h10" /><path d="M17.5 16.5l2 2 3.5-3.5" />
          </svg>
        </span>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <Spinner size={18} />
        {label ? <p className="text-[0.82rem] font-bold muted">{label}</p> : null}
      </div>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function CardSkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="mt-3"><Skeleton className="h-2 w-full" /></div>
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <Skeleton className="h-11 w-36 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-2xl lg:col-span-1" />
        <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
      </div>
    </div>
  );
}

/* ============================================================
   Card
   ============================================================ */
export function Card({
  children,
  className = '',
  as: Tag = 'section',
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
  hover?: boolean;
}) {
  return <Tag className={`card p-4 sm:p-5 ${hover ? 'card-hover' : ''} ${className}`}>{children}</Tag>;
}

/* ============================================================
   Form fields
   ============================================================ */
interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, children, className = '' }: FieldProps) {
  const id = useId();
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="field-label">
        {label}
        {required ? <span className="text-red-500" aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="field-hint">{hint}</p> : null}
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </div>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`input-base ${className}`} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`input-base ${className}`} />;
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={`input-base ${className}`}>
      {children}
    </select>
  );
}

export function SearchInput({ value, onChange, placeholder, ariaLabel, className = '' }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={`relative w-full ${className}`}>
      <svg className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="input-base !ps-10 !pe-10 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute end-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-3)] hover:bg-[var(--surface-hover)]"
          aria-label="Clear"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      ) : null}
    </div>
  );
}

/* ============================================================
   Toggle
   ============================================================ */
export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 text-start">
      <span className="min-w-0">
        <span className="block text-[0.9rem] font-bold" style={{ color: 'var(--text-1)' }}>{label}</span>
        {description ? <span className="mt-0.5 block text-xs leading-relaxed faint">{description}</span> : null}
      </span>
      <span
        className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition"
        style={{ background: checked ? 'linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600))' : 'var(--border-strong)' }}
        aria-hidden="true"
      >
        <span className="inline-block h-5 w-5 rounded-full bg-white shadow-md transition-all" style={{ marginInlineStart: checked ? 26 : 4 }} />
      </span>
    </button>
  );
}

/* ============================================================
   Segmented control
   ============================================================ */
export function Segmented<T extends string>({ value, options, onChange, ariaLabel, size = 'md' }: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`kbd-focus flex min-w-0 items-center justify-center gap-1.5 rounded-lg font-bold transition ${size === 'sm' ? 'px-2.5 py-1 text-[0.76rem]' : 'px-3 py-1.5 text-[0.84rem]'}`}
            style={active
              ? { background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600))', color: '#fff', boxShadow: '0 6px 16px -8px rgba(99,102,241,.8)' }
              : { color: 'var(--text-2)' }}
          >
            {opt.icon ?? null}
            <span className="whitespace-nowrap">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   Tabs
   ============================================================ */
export function Tabs<T extends string>({ tabs, value, onChange, className = '' }: {
  tabs: { value: T; label: string; icon?: ReactNode; badge?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={`scroll-x flex items-center gap-1 ${className}`}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className="relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[0.82rem] font-bold transition"
            style={{ color: active ? 'var(--text-1)' : 'var(--text-3)' }}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge ? <span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-black" style={{ background: 'var(--surface-hover)', color: 'var(--text-2)' }}>{tab.badge}</span> : null}
            {active ? <span className="absolute inset-x-2 -bottom-[3px] h-0.5 rounded-full" style={{ background: 'linear-gradient(90deg, var(--color-brand-500), var(--color-accent-500))' }} aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   Badges
   ============================================================ */
export const STATUS_STYLE: Record<TaskStatus, string> = {
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
  const color = STATUS_STYLE[status] ?? 'var(--text-3)';
  return (
    <span className="chip tint" style={{ '--tint-color': color } as React.CSSProperties}>
      <span className="status-dot" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

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
  medium: '#0891b2',
  high: '#d97706',
  urgent: '#e11d48',
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

/* ============================================================
   Progress / rating
   ============================================================ */
export function ProgressBar({ value, label, color, height = 8 }: { value: number; label?: string; color?: string; height?: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 overflow-hidden rounded-full" style={{ background: 'var(--surface-hover)', height }} role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${clamped}%`, background: color ?? 'linear-gradient(90deg, var(--color-brand-500), var(--color-accent-500))' }} />
      </div>
      <span className="w-9 shrink-0 text-end text-xs font-extrabold" style={{ color: 'var(--text-2)' }}>{clamped}%</span>
    </div>
  );
}

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

/* ============================================================
   Modal (bottom sheet on mobile)
   ============================================================ */
export function Modal({ open, onClose, title, children, wide = false, subtitle }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  subtitle?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // focus the first control when the dialog opens
    const timer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
      target?.focus();
    }, 60);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      window.clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 backdrop-blur-[6px] sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={title}>
      <div
        ref={panelRef}
        className={`glass-strong animate-modal-in max-h-[92dvh] w-full overflow-y-auto rounded-t-[1.75rem] p-5 sm:rounded-[1.5rem] sm:p-6 ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
      >
        <div className="sheet-handle sm:hidden" aria-hidden="true" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-black leading-tight" style={{ color: 'var(--text-1)' }}>{title}</h2>
            {subtitle ? <p className="mt-1 text-sm leading-relaxed muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            data-close
            className="icon-btn !h-9 !w-9 shrink-0"
            aria-label="Close"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   Bottom sheet (filters, menus, details)
   ============================================================ */
export function Sheet({ open, onClose, title, children, wide = false }: {
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/45 backdrop-blur-[4px] sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`glass-strong animate-modal-in max-h-[88dvh] w-full overflow-y-auto rounded-t-[1.75rem] p-5 sm:rounded-[1.5rem] ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="sheet-handle sm:hidden" aria-hidden="true" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-black" style={{ color: 'var(--text-1)' }}>{title}</h2>
          <button type="button" onClick={onClose} className="icon-btn !h-9 !w-9 shrink-0" aria-label="Close">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   States
   ============================================================ */
export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed px-5 py-12 text-center" style={{ borderColor: 'var(--border-strong)', background: 'color-mix(in srgb, var(--color-brand-500) 3%, transparent)' }}>
      {icon ? (
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-brand-500) 16%, transparent), color-mix(in srgb, var(--color-accent-500) 10%, transparent))' }}>
          <span style={{ color: 'var(--color-brand-500)' }}>{icon}</span>
        </div>
      ) : null}
      <p className="text-base font-extrabold" style={{ color: 'var(--text-1)' }}>{title}</p>
      {hint ? <p className="max-w-sm text-sm leading-relaxed muted">{hint}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border px-4 py-8 text-center" style={{ borderColor: 'color-mix(in srgb, var(--st-overdue) 30%, transparent)', background: 'color-mix(in srgb, var(--st-overdue) 7%, transparent)' }} role="alert">
      <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--st-overdue) 14%, transparent)', color: 'var(--st-overdue)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
      </span>
      <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{message}</p>
      {onRetry ? <Button variant="ghost" size="sm" onClick={onRetry}>{retryLabel}</Button> : null}
    </div>
  );
}

export function Pagination({ page, pages, onPage, labels }: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
  labels: { page: string; of: string; previous: string; next: string };
}) {
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-2 pt-2 sm:justify-center" aria-label="Pagination">
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={labels.previous}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="rtl:rotate-180" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        <span className="hidden sm:inline">{labels.previous}</span>
      </Button>
      <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-extrabold" style={{ color: 'var(--text-2)' }}>
        {labels.page} {page} {labels.of} {pages}
      </span>
      <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={labels.next}>
        <span className="hidden sm:inline">{labels.next}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="rtl:rotate-180" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </Button>
    </nav>
  );
}

/* ============================================================
   Donut / ring gauge
   ============================================================ */
export function Donut({ value, label, sublabel, color = 'var(--color-brand-500)', size = 110 }: {
  value: number;
  label: string;
  sublabel?: string;
  color?: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = Math.max(9, Math.round(size * 0.1));
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${clamped}%`}>
        <svg width={size} height={size} style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.14))' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-hover)" strokeWidth={stroke + 3} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-black tabular-nums" style={{ color: 'var(--text-1)' }}>
          {clamped}%
        </span>
      </div>
      <p className="text-center text-[0.76rem] font-bold leading-tight" style={{ color: 'var(--text-2)' }}>{label}</p>
      {sublabel ? <p className="text-center text-[0.68rem] leading-tight faint">{sublabel}</p> : null}
    </div>
  );
}

export function RingGauge({ value, size = 132, stroke = 11, label, caption, color = 'var(--color-brand-500)' }: {
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  caption?: string;
  color?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${clamped}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-hover)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - clamped / 100)}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)', filter: 'drop-shadow(0 0 8px color-mix(in srgb, ' + color + ' 55%, transparent))' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black tabular-nums leading-none" style={{ color: 'var(--text-1)' }}>{clamped}</span>
        <span className="mt-1 text-[0.62rem] font-extrabold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{caption}</span>
      </div>
    </div>
  );
}

/* ============================================================
   Avatar / keyboard hint
   ============================================================ */
export function Avatar({ src, name, size = 36, className = '' }: { src?: string | null; name: string; size?: number; className?: string }) {
  if (src) {
    return <img src={src} alt="" width={size} height={size} style={{ width: size, height: size }} className={`shrink-0 rounded-full object-cover ring-2 ring-[var(--surface-solid)] ${className}`} aria-hidden="true" />;
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-black text-white ring-2 ring-[var(--surface-solid)] ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)), background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))' }}
      aria-hidden="true"
    >
      {(name ?? '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
