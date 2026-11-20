/** Duration helpers — all computations in ms UTC. */

/** Planned duration between the scheduled start & end (null when incomplete or inverted). */
export function plannedDurationMs(plannedStart: Date | string | null, plannedEnd: Date | string | null): number | null {
  if (!plannedStart || !plannedEnd) return null;
  const s = new Date(plannedStart).getTime();
  const e = new Date(plannedEnd).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  return e - s;
}

/**
 * Actual duration: from the actual start to the moment completion was
 * reported/approved. Returns null while the data is incomplete.
 */
export function actualDurationMs(
  actualStart: Date | string | null,
  reportedAt: Date | string | null,
  approvedAt: Date | string | null,
): number | null {
  if (!actualStart) return null;
  const end = approvedAt ?? reportedAt;
  if (!end) return null;
  const s = new Date(actualStart).getTime();
  const e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  return e - s;
}

/** Is the planned end in the past while the task is still not approved? */
export function isPastDue(plannedEnd: Date | string | null, status: string, now: Date = new Date()): boolean {
  if (!plannedEnd) return false;
  const active = ['scheduled', 'in_progress', 'worker_reported_done'];
  if (!active.includes(status)) return false;
  return new Date(plannedEnd).getTime() < now.getTime();
}

/** Human-friendly duration split — the client formats it via i18n. */
export function splitDuration(ms: number | null): { days: number; hours: number; minutes: number } | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  };
}

/** Due-soon threshold: notify when the planned end is within this window. */
export const DUE_SOON_WINDOW_MS = 60 * 60 * 1000; // 1 hour
