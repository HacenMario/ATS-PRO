'use client';

/**
 * Lightweight, dependency-free chart components for the reports page.
 * Pure flex/grid bars (no SVG) so they stay responsive at every width,
 * render identically in RTL/LTR (charts are forced LTR) and need no libraries.
 */
import type { TrendPoint, TaskStatus, TaskPriority } from '@ats/shared';
import { TASK_STATUSES, TASK_PRIORITIES } from '@ats/shared';
import { StatusBadge } from '@/components/ui';
import { useLocale } from '@/providers/locale';
import { formatNumber } from '@/lib/format';

const STATUS_COLORS: Record<TaskStatus, string> = {
  draft: 'var(--st-draft)',
  scheduled: 'var(--st-scheduled)',
  in_progress: 'var(--st-inprogress)',
  worker_reported_done: 'var(--st-reported)',
  awaiting_supervisor_review: 'var(--st-review)',
  completed_approved: 'var(--st-approved)',
  overdue: 'var(--st-overdue)',
  cancelled: 'var(--st-cancelled)',
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: '#64748b',
  medium: '#0d9488',
  high: '#d97706',
  urgent: '#dc2626',
};

/** Grouped weekly bars: created vs completed, oldest → newest. */
export function TrendChart({ data, labels }: {
  data: TrendPoint[];
  labels: { created: string; completed: string; empty: string };
}) {
  const { locale } = useLocale();
  const max = Math.max(1, ...data.map((p) => Math.max(p.created, p.completed)));
  const weekLabel = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DZ' : locale === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short', numberingSystem: 'latn' }).format(d);
  };

  if (data.every((p) => p.created === 0 && p.completed === 0)) {
    return <p className="py-8 text-center text-sm faint">{labels.empty}</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs font-bold">
        <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-2)' }}>
          <span className="trend-dot" style={{ background: 'var(--st-scheduled)' }} aria-hidden="true" />
          {labels.created}
        </span>
        <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-2)' }}>
          <span className="trend-dot" style={{ background: 'var(--st-approved)' }} aria-hidden="true" />
          {labels.completed}
        </span>
      </div>
      {/* Chronological order stays LTR in every language */}
      <div className="trend-chart" dir="ltr">
        {data.map((p) => (
          <div className="trend-col" key={p.weekStart} title={`${labels.created}: ${p.created} · ${labels.completed}: ${p.completed}`}>
            <div className="trend-bars">
              <span className="trend-bar bar-created" style={{ height: `${Math.round((p.created / max) * 100)}%` }} aria-hidden="true" />
              <span className="trend-bar bar-completed" style={{ height: `${Math.round((p.completed / max) * 100)}%` }} aria-hidden="true" />
            </div>
            <span className="trend-wk">{weekLabel(p.weekStart)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal share bars: task statuses. */
export function StatusBars({ counts }: { counts: Record<string, number> }) {
  const { t } = useLocale();
  const keys = TASK_STATUSES.filter((s) => (counts[s] ?? 0) > 0);
  const max = Math.max(1, ...keys.map((k) => counts[k] ?? 0));

  if (keys.length === 0) {
    return <p className="py-6 text-center text-sm faint">—</p>;
  }

  return (
    <ul className="space-y-2.5">
      {keys.map((k) => {
        const count = counts[k] ?? 0;
        return (
          <li key={k} className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <StatusBadge status={k} label={t(`status.${k}`)} />
              <span className="text-xs font-bold faint">{formatNumber(count)}</span>
            </div>
            <span className="block h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-hover)' }} aria-hidden="true">
              <span className="chart-fill block h-full rounded-full" style={{ width: `${(count / max) * 100}%`, background: STATUS_COLORS[k] }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Horizontal share bars: task priorities. */
export function PriorityBars({ counts }: { counts: Record<string, number> }) {
  const { t } = useLocale();
  const keys = TASK_PRIORITIES.filter((p) => (counts[p] ?? 0) > 0);
  const max = Math.max(1, ...keys.map((k) => counts[k] ?? 0));

  if (keys.length === 0) {
    return <p className="py-6 text-center text-sm faint">—</p>;
  }

  return (
    <ul className="space-y-2.5">
      {keys.map((k) => {
        const count = counts[k] ?? 0;
        return (
          <li key={k} className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <span className="chip" style={{ color: PRIORITY_COLORS[k as TaskPriority], borderColor: 'transparent', background: 'var(--surface-hover)' }}>
                {t(`priority.${k}`)}
              </span>
              <span className="text-xs font-bold faint">{formatNumber(count)}</span>
            </div>
            <span className="block h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-hover)' }} aria-hidden="true">
              <span className="chart-fill block h-full rounded-full" style={{ width: `${(count / max) * 100}%`, background: PRIORITY_COLORS[k as TaskPriority] }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
