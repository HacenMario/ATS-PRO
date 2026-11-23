'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, apiUrl } from '@/lib/api';
import { useLocale } from '@/providers/locale';
import { useAuth } from '@/providers/auth';
import { useConfirm } from '@/providers/confirm';
import { useToast } from '@/providers/toast';
import { Button, Input, Select, Textarea, StatusBadge, PriorityBadge, ProgressBar, Rating, Modal, CardSkeletonRows } from '@/components/ui';
import { Icon } from '@/components/layout';
import { formatDateTime, fromLocalInput, formatNumber } from '@/lib/format';
import type { Task, TaskStatus, TaskPriority } from '@ats/shared';
import { TASK_STATUSES, TASK_PRIORITIES } from '@ats/shared';
import { translate } from '@ats/i18n';

export function statusLabel(locale: string, status: TaskStatus): string {
  return translate(locale as 'ar', `status.${status}`);
}
export function priorityLabel(locale: string, priority: TaskPriority): string {
  return translate(locale as 'ar', `priority.${priority}`);
}

/* ---------------- Task card ---------------- */
export function TaskCard({ task }: { task: Task }) {
  const { locale, t } = useLocale();
  const { isSupervisor, isDeliveryWorker } = useAuth();
  // Attention-drawing bounce: a worker sees their scheduled tasks bouncing; a
  // supervisor sees tasks waiting for their review bouncing. Subtle, and
  // disabled for users who prefer reduced motion (see globals.css).
  const needsAttention = (task.status === 'scheduled' && !isSupervisor && !isDeliveryWorker)
    || (task.status === 'worker_reported_done' && isSupervisor);
  // Data cells live in a one-column grid on phones and two columns from sm up:
  // each cell is a self-contained unit (icon + text wrap together), so no text
  // is ever split mid-word across a flex line whatever the font scale is.
  return (
    <Link
      href={`/tasks/${task.id}`}
      className={`card group flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]${needsAttention ? ' card-bounce' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={task.status} label={statusLabel(locale, task.status)} />
        <PriorityBadge priority={task.priority} label={priorityLabel(locale, task.priority)} />
        {task.delivery ? (
          <span className="chip tint" style={{ '--tint-color': deliveryStatusColor(task.delivery.status) } as React.CSSProperties}>
            {t(`task.deliveryStatus_${task.delivery.status}`)}
          </span>
        ) : null}
        {task.progress > 0 && task.status !== 'completed_approved' ? (
          <span className="ms-auto text-xs font-bold faint">{task.progress}%</span>
        ) : null}
      </div>
      <h3 dir="auto" className="text-[1.02rem] font-extrabold leading-snug group-hover:underline [overflow-wrap:anywhere]" style={{ color: 'var(--text-1)' }}>
        {task.title}
      </h3>
      {task.description ? (
        <p dir="auto" className="whitespace-pre-wrap break-words text-[0.85rem] leading-relaxed muted">{task.description}</p>
      ) : null}
      <ProgressBar value={task.progress} label={t('task.progress')} />
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs faint sm:grid-cols-2">
        <span dir="auto" className="inline-flex min-w-0 items-start gap-1">
          <Icon name="workers" size={13} />
          <span className="min-w-0 [overflow-wrap:anywhere]">{task.assigneeName ?? t('task.noAssignee')}</span>
        </span>
        {task.plannedEnd ? (
          <span className="inline-flex min-w-0 items-start gap-1">
            <Icon name="clock" size={13} />
            <span className="min-w-0 [overflow-wrap:anywhere]">{formatDateTime(task.plannedEnd, locale)}</span>
          </span>
        ) : null}
        {task.location ? (
          <span dir="auto" className="inline-flex min-w-0 items-start gap-1">
            <Icon name="pin" size={13} />
            <span className="min-w-0 [overflow-wrap:anywhere]">{task.location}</span>
          </span>
        ) : null}
        {task.workshopName ? (
          <span dir="auto" className="inline-flex min-w-0 items-start gap-1">
            <Icon name="workshop" size={13} />
            <span className="min-w-0 [overflow-wrap:anywhere]">{task.workshopName}</span>
          </span>
        ) : null}
      </div>
    </Link>
  );
}

/** Accent color of a delivery status chip. */
export function deliveryStatusColor(status: 'pending' | 'accepted' | 'delivered'): string {
  return status === 'pending' ? 'var(--st-inprogress)' : status === 'accepted' ? 'var(--st-scheduled)' : 'var(--st-approved)';
}

/** Delivery panel shown on the task detail page once a delivery was requested:
 * customer, phone, address, fee, status and the claiming delivery worker. */
export function DeliveryInfo({ task }: { task: Task }) {
  const { t, locale } = useLocale();
  const d = task.delivery;
  if (!d) return null;
  const color = deliveryStatusColor(d.status);
  return (
    <section className="card p-4" aria-label={t('task.deliveryTitle')}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Icon name="pin" size={16} />
        <h2 className="section-title">{t('task.deliveryTitle')}</h2>
        <span className="chip tint" style={{ '--tint-color': color } as React.CSSProperties}>{t(`task.deliveryStatus_${d.status}`)}</span>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs font-bold faint">{t('task.deliveryCustomer')}</dt>
          <dd dir="auto" className="mt-0.5 font-bold [overflow-wrap:anywhere]" style={{ color: 'var(--text-1)' }}>{d.customerName}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-bold faint">{t('task.deliveryPhone')}</dt>
          <dd dir="ltr" className="mt-0.5 font-bold [overflow-wrap:anywhere]" style={{ color: 'var(--text-1)' }}>
            <a className="hover:underline" href={`tel:${d.customerPhone}`}>{d.customerPhone}</a>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-bold faint">{t('task.deliveryAddress')}</dt>
          <dd dir="auto" className="mt-0.5 font-bold [overflow-wrap:anywhere]" style={{ color: 'var(--text-1)' }}>{d.address}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-bold faint">{t('task.deliveryFee')}</dt>
          <dd className="mt-0.5 font-bold" style={{ color: 'var(--text-1)' }}>{formatNumber(d.fee, locale)} {t('common.currency')}</dd>
        </div>
        {d.workerName ? (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-xs font-bold faint">{t('task.deliveryWorker')}</dt>
            <dd dir="auto" className="mt-0.5 font-bold [overflow-wrap:anywhere]" style={{ color: 'var(--text-1)' }}>{d.workerName}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

/* ---------------- Filters ---------------- */
export interface TaskFilterState {
  status: 'all' | TaskStatus;
  priority: 'all' | TaskPriority;
  workerId: string;
  q: string;
  from: string;
  to: string;
  sort: 'newest' | 'oldest' | 'dueAsc' | 'dueDesc' | 'priority';
  mine: boolean;
}

export const INITIAL_FILTERS: TaskFilterState = {
  status: 'all', priority: 'all', workerId: '', q: '', from: '', to: '', sort: 'newest', mine: false,
};

export interface WorkerOption { id: string; name: string }

export function TaskFilters({ filters, onChange, workers, showWorkerFilter = true, showMine = false }: {
  filters: TaskFilterState;
  onChange: (f: TaskFilterState) => void;
  workers: WorkerOption[];
  showWorkerFilter?: boolean;
  showMine?: boolean;
}) {
  const { locale, t } = useLocale();
  const set = (patch: Partial<TaskFilterState>) => onChange({ ...filters, ...patch });

  return (
    <div className="card flex flex-col gap-3 p-4" role="search" aria-label={t('task.filters.title')}>
      {/* Row 1: search (full width, its own row to avoid any overlap in every language) */}
      <div className="relative w-full">
        <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center faint" aria-hidden="true"><Icon name="search" size={16} /></span>
        <Input
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder={t('task.searchPlaceholder')}
          className="!ps-9"
          aria-label={t('common.search')}
        />
      </div>
      {/* Row 2: filters wrap with stable minimum widths (no overlap in fr/en/ar) */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select value={filters.sort} onChange={(e) => set({ sort: e.target.value as TaskFilterState['sort'] })} aria-label={t('task.filters.sort')} className="!w-full sm:!w-auto sm:!min-w-44">
          <option value="newest">{t('task.sort.newest')}</option>
          <option value="oldest">{t('task.sort.oldest')}</option>
          <option value="dueAsc">{t('task.sort.dueAsc')}</option>
          <option value="dueDesc">{t('task.sort.dueDesc')}</option>
          <option value="priority">{t('task.sort.priority')}</option>
        </Select>
        <Select value={filters.status} onChange={(e) => set({ status: e.target.value as TaskFilterState['status'] })} aria-label={t('task.filters.status')} className="!w-full sm:!w-auto sm:!min-w-44">
          <option value="all">{t('common.status')}: {t('common.all')}</option>
          {TASK_STATUSES.map((st) => (
            <option key={st} value={st}>{statusLabel(locale, st)}</option>
          ))}
        </Select>
        <Select value={filters.priority} onChange={(e) => set({ priority: e.target.value as TaskFilterState['priority'] })} aria-label={t('task.filters.priority')} className="!w-full sm:!w-auto sm:!min-w-40">
          <option value="all">{t('common.priority')}: {t('common.all')}</option>
          {TASK_PRIORITIES.map((pr) => (
            <option key={pr} value={pr}>{priorityLabel(locale, pr)}</option>
          ))}
        </Select>
        {showWorkerFilter ? (
          <Select value={filters.workerId} onChange={(e) => set({ workerId: e.target.value })} aria-label={t('task.filters.worker')} className="!w-full sm:!w-auto sm:!min-w-44">
            <option value="">{t('task.filters.allWorkers')}</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>
        ) : null}
        <Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} aria-label={t('task.filters.dateFrom')} className="!w-full sm:!w-auto" />
        <Input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} aria-label={t('task.filters.dateTo')} className="!w-full sm:!w-auto" />
        {showMine ? (
          <label className="flex items-center gap-2 text-sm font-bold sm:col-span-2" style={{ color: 'var(--text-1)' }}>
            <input type="checkbox" checked={filters.mine} onChange={(e) => set({ mine: e.target.checked })} className="h-4 w-4 accent-[var(--color-brand-500)]" />
            {t('task.filters.mine')}
          </label>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...INITIAL_FILTERS })} className="sm:col-span-2 sm:w-fit">{t('common.resetFilters')}</Button>
      </div>
    </div>
  );
}

export function filtersToQuery(f: TaskFilterState, page: number): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '12');
  if (f.status !== 'all') params.set('status', f.status);
  if (f.priority !== 'all') params.set('priority', f.priority);
  if (f.workerId) params.set('workerId', f.workerId);
  if (f.q) params.set('q', f.q);
  if (f.from) params.set('from', `${f.from}T00:00:00`);
  if (f.to) params.set('to', `${f.to}T23:59:59`);
  params.set('sort', f.sort);
  if (f.mine) params.set('mine', '1');
  return params.toString();
}

export function TaskListSkeleton() {
  return <CardSkeletonRows rows={4} />;
}

export function TaskList({ data, page, onPage }: { data: { items: Task[]; pages: number } | null; page: number; onPage: (p: number) => void }) {
  const { t } = useLocale();
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.items.map((task) => <TaskCard key={task.id} task={task} />)}
      </div>
      {data && data.pages > 1 ? (
        <nav className="flex items-center justify-center gap-3 pt-3" aria-label="Pagination">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('common.previous')}</Button>
          <span className="text-sm font-bold faint">{t('common.page')} {page} {t('common.of')} {data.pages}</span>
          <Button variant="ghost" size="sm" disabled={page >= data.pages} onClick={() => onPage(page + 1)}>{t('common.next')}</Button>
        </nav>
      ) : null}
    </>
  );
}

/* ---------------- Timeline ---------------- */
export function TaskTimeline({ task }: { task: Task }) {
  const { locale, t } = useLocale();
  return (
    <div>
      {task.changeLog.length === 0 ? (
        <p className="text-sm faint">{t('common.noResults')}</p>
      ) : (
        <ol className="relative space-y-4 ps-5">
          <span className="absolute inset-y-1 start-[7px] w-px" style={{ background: 'var(--border-strong)' }} aria-hidden="true" />
          {[...task.changeLog].reverse().map((entry, i) => {
            // Precise phrasing: a draft creation, a reassignment, an attachment
            // removal, the delivery lifecycle and the overdue sweep each get
            // their own wording instead of a generic action label.
            const removedFile = entry.action === 'attach' && entry.note?.startsWith('removed:') ? entry.note.slice('removed:'.length) : null;
            const timelineKey = entry.to === 'overdue'
              ? 'timeline.overdue'
              : entry.action === 'create' && entry.to === 'draft'
                ? 'timeline.createDraft'
                : entry.action === 'update' && entry.field === 'assigneeId'
                  ? 'timeline.assign'
                  : removedFile
                    ? 'timeline.attachRemoved'
                    : `timeline.${entry.action}`;
            const label = translate(locale, timelineKey, {
              p: entry.note && entry.action === 'set_progress' ? entry.note : undefined,
              rating: entry.action === 'approve' ? String(task.supervisorRating ?? '—') : undefined,
              reason: entry.action === 'return' ? (entry.note ?? '') : undefined,
              file: entry.action === 'attach' && !removedFile ? (entry.note ?? '') : (removedFile ?? undefined),
              worker: entry.action === 'update' && entry.field === 'assigneeId' ? (entry.note ?? '') : undefined,
              customer: entry.action === 'delivery_requested' ? (entry.note?.split('|')[0] ?? '') : undefined,
            });
            // Notes are rendered as a quote below the entry — except when the
            // note is already woven into the phrase, or is an internal marker.
            const noteInPhrase = entry.action === 'set_progress' || entry.action === 'return' || entry.action === 'attach'
              || (entry.action === 'update' && entry.field === 'assigneeId') || entry.note === 'details'
              || entry.action === 'delivery_requested';
            return (
              <li key={`${entry.at}-${i}`} className="relative">
                <span className="absolute -start-5 top-1.5 h-3 w-3 rounded-full border-2" style={{ background: 'var(--surface-solid)', borderColor: 'var(--color-brand-500)' }} aria-hidden="true" />
                <p dir="auto" className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                  {entry.byName || '—'} <span className="font-semibold muted">{label}</span>
                </p>
                <p className="text-xs faint">{formatDateTime(entry.at, locale)}</p>
                {entry.note && !noteInPhrase ? (
                  <p dir="auto" className="mt-1 rounded-lg px-2 py-1 text-xs leading-relaxed muted" style={{ background: 'var(--surface-hover)' }}>{entry.note}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/* ---------------- Attachments ---------------- */
type AttachmentPreview = { fileId: string; filename: string; mimeType: string } | null;

/** Full-screen media viewer (image / video) opened from an attachment preview. */
export function MediaLightbox({ media, taskUrl, onClose }: { media: AttachmentPreview; taskUrl: string; onClose: () => void }) {
  const { t } = useLocale();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!media) return null;
  const src = apiUrl(`${taskUrl}/${media.fileId}`);
  const isVideo = media.mimeType.startsWith('video/');
  return (
    <div
      className="fixed inset-0 z-[86] flex flex-col items-center justify-center gap-3 bg-black/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={media.filename}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="btn btn-ghost btn-sm absolute end-4 top-4 !text-white"
        aria-label={t('common.close')}
      >
        <Icon name="cancel" size={18} />
      </button>
      <div className="flex min-h-0 w-full max-w-5xl flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {isVideo ? (
          <video src={src} controls autoPlay className="max-h-[80dvh] max-w-full rounded-2xl" />
        ) : (
          <img src={src} alt={media.filename} className="max-h-[80dvh] max-w-full rounded-2xl object-contain" />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="max-w-[60vw] break-words text-sm font-bold text-white">{media.filename}</span>
        <a href={`${src}?dl=1`} download={media.filename} className="btn btn-ghost btn-sm !text-white">
          <Icon name="link" size={14} />{t('common.download')}
        </a>
      </div>
    </div>
  );
}

export function TaskAttachments({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const { t } = useLocale();
  const { user } = useAuth();
  const { push } = useToast();
  const confirmAction = useConfirm();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<AttachmentPreview>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const canUpload = user && (task.status !== 'completed_approved' && task.status !== 'cancelled');
  const mediaUrl = (fileId: string) => apiUrl(`/api/tasks/${task.id}/attachments/${fileId}`);
  const mediaItems = task.attachments.filter((a) => a.mimeType.startsWith('image/') || a.mimeType.startsWith('video/'));

  const removeAttachment = async (fileId: string, filename: string) => {
    const ok = await confirmAction.confirm({ title: t('task.deleteAttachment'), message: t('task.deleteAttachmentConfirm', { name: filename }), danger: true });
    if (!ok) return;
    setDeleting(fileId);
    try {
      await api(`/api/tasks/${task.id}/attachments/${fileId}`, { method: 'DELETE', body: {} });
      push('success', t('common.success'));
      onChanged();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setDeleting(null);
    }
  };
  const fileItems = task.attachments.filter((a) => !a.mimeType.startsWith('image/') && !a.mimeType.startsWith('video/'));

  const doUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api(`/api/tasks/${task.id}/attachments`, { method: 'POST', formData: fd });
      push('success', t('common.success'));
      onChanged();
    } catch (err) {
      push('error', t((err as { code?: string })?.code ?? 'errors.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {task.attachments.length === 0 ? <p className="text-sm faint">{t('task.attachmentsEmpty')}</p> : null}

      {/* Image / video previews — click a picture to open the full viewer */}
      {mediaItems.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {mediaItems.map((a) => (
            <li key={a.fileId} className="group relative overflow-hidden rounded-xl" style={{ background: 'var(--surface-hover)' }}>
              {a.mimeType.startsWith('video/') ? (
                <button type="button" className="block w-full cursor-zoom-in" onClick={() => setPreview(a)} aria-label={a.filename}>
                  <video src={mediaUrl(a.fileId)} preload="metadata" className="h-36 w-full object-cover" muted />
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100" style={{ background: 'rgba(0,0,0,0.35)' }} aria-hidden="true">
                    <Icon name="play" size={26} />
                  </span>
                </button>
              ) : (
                <button type="button" className="block w-full cursor-zoom-in" onClick={() => setPreview(a)} aria-label={a.filename}>
                  <img src={mediaUrl(a.fileId)} alt={a.filename} loading="lazy" className="h-36 w-full object-cover transition group-hover:scale-[1.03]" />
                </button>
              )}
              <span className="absolute inset-x-0 bottom-0 break-words bg-black/55 px-2 py-1 text-[0.66rem] font-bold leading-snug text-white">{a.filename}</span>
              {canUpload ? (
                <button
                  type="button"
                  onClick={() => void removeAttachment(a.fileId, a.filename)}
                  disabled={deleting === a.fileId}
                  className="absolute end-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-red-600"
                  aria-label={`${t('task.deleteAttachment')}: ${a.filename}`}
                  title={t('task.deleteAttachment')}
                >
                  <Icon name="close" size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Non-media files stay as download rows */}
      {fileItems.length > 0 ? (
        <ul className="space-y-2">
          {fileItems.map((a) => (
            <li key={a.fileId} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--surface-hover)' }}>
              <Icon name="paperclip" size={15} />
              <a href={`${mediaUrl(a.fileId)}?dl=1`} download={a.filename} className="min-w-0 flex-1 break-words text-sm font-bold text-brand-500 hover:underline kbd-focus">
                {a.filename}
              </a>
              <span className="text-xs faint">{Math.max(1, Math.round(a.size / 1024))} KB</span>
              <a href={`${mediaUrl(a.fileId)}?dl=1`} download={a.filename} className="btn btn-ghost btn-sm !px-2" aria-label={t('common.download')}>
                <Icon name="link" size={14} />
              </a>
              {canUpload ? (
                <button
                  type="button"
                  onClick={() => void removeAttachment(a.fileId, a.filename)}
                  disabled={deleting === a.fileId}
                  className="btn btn-ghost btn-sm !px-2 text-red-500 hover:!bg-red-500/10"
                  aria-label={`${t('task.deleteAttachment')}: ${a.filename}`}
                  title={t('task.deleteAttachment')}
                >
                  <Icon name="close" size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <MediaLightbox media={preview} taskUrl={`/api/tasks/${task.id}/attachments`} onClose={() => setPreview(null)} />

      {canUpload ? (
        <>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void doUpload(file);
              e.target.value = '';
            }}
          />
          <Button variant="ghost" size="sm" loading={uploading} onClick={() => fileRef.current?.click()} disabled={task.attachments.length >= 6}>
            <Icon name="paperclip" size={15} />
            {uploading ? t('common.uploading') : t('task.action.attach')}
          </Button>
          <p className="text-xs faint">{t('task.attachmentHint')}</p>
        </>
      ) : null}
    </div>
  );
}

/* ---------------- Task actions panel ---------------- */
type ApiErrorLike = { code?: string };

export function TaskActions({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const { t } = useLocale();
  const { user, isSupervisor, isDeliveryWorker } = useAuth();
  const confirmAction = useConfirm();
  const { push } = useToast();

  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<null | 'approve' | 'return' | 'cancel' | 'reschedule' | 'assign' | 'progress' | 'comment' | 'delivery'>(null);
  const [rating, setRating] = useState(4);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [deliveryForm, setDeliveryForm] = useState({ customerName: '', customerPhone: '', deliveryAddress: '', deliveryFee: '' });
  const [dlvWorkers, setDlvWorkers] = useState<{ id: string; name: string }[]>([]);
  const [dlvTarget, setDlvTarget] = useState('');
  const [progress, setProgress] = useState(task.progress);
  const [text, setText] = useState('');
  const [schedStart, setSchedStart] = useState('');
  const [schedEnd, setSchedEnd] = useState('');
  const [schedAssignee, setSchedAssignee] = useState('');
  const [schedWorkers, setSchedWorkers] = useState<WorkerOption[]>([]);
  const [schedLoadingWorkers, setSchedLoadingWorkers] = useState(false);

  const isAssignee = user?.id === task.assigneeId;
  const canManage = isSupervisor;

  // Load workshop members whenever the scheduling or assignment modal opens,
  // so a draft (or an unassigned task) can always be scheduled/assigned with a
  // chosen worker — supervisors are listed too (a supervising worker is valid).
  useEffect(() => {
    if ((modal !== 'reschedule' && modal !== 'assign') || !task.workshopId) return;
    let cancelled = false;
    setSchedLoadingWorkers(true);
    api<{ items: { userId: string; name: string; status: string }[] }>(`/api/workshops/${task.workshopId}/members`)
      .then((res) => {
        if (cancelled) return;
        setSchedWorkers(res.items.filter((m) => m.status === 'active').map((m) => ({ id: m.userId, name: m.name })));
      })
      .catch(() => setSchedWorkers([]))
      .finally(() => { if (!cancelled) setSchedLoadingWorkers(false); });
    return () => { cancelled = true; };
  }, [modal, task.workshopId]);

  const openScheduleModal = () => {
    // Drafts and cancelled tasks keep their (possibly empty/old) dates for editing;
    // overdue tasks start clean. datetime-local inputs only display the local
    // "YYYY-MM-DDTHH:mm" form, so convert stored ISO timestamps first.
    const toLocalInputValue = (iso: string | null | undefined) => {
      if (!iso) return '';
      const dt = new Date(iso);
      if (Number.isNaN(dt.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    };
    const keepDates = task.status === 'draft' || task.status === 'cancelled';
    setSchedStart(keepDates ? toLocalInputValue(task.plannedStart) : '');
    setSchedEnd(keepDates ? toLocalInputValue(task.plannedEnd) : '');
    setSchedAssignee(task.assigneeId ?? '');
    setModal('reschedule');
  };

  const runAction = async (path: string, body: Record<string, unknown> = {}, action: string) => {
    setBusy(action);
    try {
      await api(`/api/tasks/${task.id}/${path}`, { method: 'POST', body });
      push('success', t('common.success'));
      setModal(null);
      onChanged();
    } catch (err) {
      push('error', t((err as ApiErrorLike)?.code ?? 'errors.serverError'));
    } finally {
      setBusy(null);
    }
  };

  const guardCancel = async (fn: () => Promise<void>) => {
    setBusy('cancel');
    try { await fn(); } finally { setBusy(null); }
  };

  const confirmDelete = async () => {
    const ok = await confirmAction.confirm({
      title: t('task.action.delete'),
      message: t('task.deleteConfirm', { title: task.title }),
      danger: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await api(`/api/tasks/${task.id}`, { method: 'DELETE', body: {} });
      push('success', t('task.deleted'));
      onChanged();
    } catch (err) {
      push('error', t((err as ApiErrorLike)?.code ?? 'errors.serverError'));
    } finally {
      setBusy(null);
    }
  };

  const buttons: ReactNode[] = [];

  // Worker: start / report / progress / comment / attach
  if (isAssignee && (task.status === 'scheduled' || task.status === 'overdue')) {
    buttons.push(
      <Button key="start" onClick={() => void guardCancel(() => runAction('start', {}, 'start'))} loading={busy === 'start'}>
        <Icon name="play" size={15} />{t('task.action.start')}
      </Button>,
    );
  }
  if (isAssignee && (task.status === 'in_progress' || task.status === 'overdue')) {
    buttons.push(
      <Button key="report" onClick={() => void guardCancel(async () => {
        const ok = await confirmAction.confirm({ title: t('task.action.reportDone'), message: t('task.reportDoneHint'), confirmLabel: t('task.action.reportDone') });
        if (!ok) return;
        await runAction('report', {}, 'report');
      })} loading={busy === 'report'}>
        <Icon name="check" size={15} />{t('task.action.reportDone')}
      </Button>,
      <Button key="progress" variant="ghost" onClick={() => { setProgress(task.progress); setModal('progress'); }}>{t('task.action.setProgress')}</Button>,
    );
  }
  if (isAssignee && (task.status === 'scheduled' || task.status === 'in_progress' || task.status === 'overdue' || task.status === 'worker_reported_done' || task.status === 'awaiting_supervisor_review')) {
    buttons.push(
      <Button key="comment" variant="ghost" onClick={() => { setText(''); setModal('comment'); }}>{t('task.action.comment')}</Button>,
    );
  }

  // Supervisor: review flow
  if (canManage && task.status === 'worker_reported_done') {
    buttons.push(
      <Button key="review" onClick={() => void guardCancel(() => runAction('begin-review', {}, 'review'))} loading={busy === 'review'}>
        <Icon name="flag" size={15} />{t('task.action.beginReview')}
      </Button>,
      <Button key="approve" onClick={() => { setRating(4); setComment(''); setModal('approve'); }}>
        <Icon name="check" size={15} />{t('task.action.approve')}
      </Button>,
      <Button key="return" variant="ghost" onClick={() => { setReason(''); setModal('return'); }}>
        <Icon name="return" size={15} />{t('task.action.return')}
      </Button>,
    );
  }
  if (canManage && task.status === 'awaiting_supervisor_review') {
    buttons.push(
      <Button key="approve2" onClick={() => { setRating(4); setComment(''); setModal('approve'); }}>
        <Icon name="check" size={15} />{t('task.action.approve')}
      </Button>,
      <Button key="return2" variant="ghost" onClick={() => { setReason(''); setModal('return'); }}>
        <Icon name="return" size={15} />{t('task.action.return')}
      </Button>,
    );
  }
  if (canManage && task.status === 'draft') {
    buttons.push(
      <Button key="schedule" onClick={openScheduleModal}>
        <Icon name="clock" size={15} />{t('task.action.schedule')}
      </Button>,
    );
  }
  // (Re)assign while the work has not started yet — draft or scheduled.
  if (canManage && (task.status === 'draft' || task.status === 'scheduled')) {
    buttons.push(
      <Button key="assign" variant="ghost" onClick={() => { setSchedAssignee(task.assigneeId ?? ''); setModal('assign'); }}>
        <Icon name="workers" size={15} />{t('task.action.assign')}
      </Button>,
    );
  }
  if (canManage && task.status === 'overdue') {
    buttons.push(
      <Button key="resched" onClick={openScheduleModal}>
        <Icon name="clock" size={15} />{t('task.action.reschedule')}
      </Button>,
    );
  }
  // Revive a cancelled task back to "scheduled" (allowed by the state machine).
  if (canManage && task.status === 'cancelled') {
    buttons.push(
      <Button key="revive" onClick={openScheduleModal}>
        <Icon name="clock" size={15} />{t('task.action.reschedule')}
      </Button>,
    );
  }
  if (canManage && ['draft', 'scheduled', 'in_progress', 'worker_reported_done', 'awaiting_supervisor_review', 'overdue', 'cancelled', 'approved'].includes(task.status)) {
    buttons.push(
      <Button key="cancel" variant="danger" onClick={() => { setReason(''); setModal('cancel'); }}>
        <Icon name="cancel" size={15} />{t('task.action.cancel')}
      </Button>,
    );
  }
  // Hard delete: supervisor or platform manager, any state, with a strong
  // confirmation — wipes the task with its attachments and notifications.
  if (canManage) {
    buttons.push(
      <Button key="delete" variant="ghost" style={{ color: 'var(--st-overdue)' }} onClick={() => void confirmDelete()}>
        <Icon name="trash" size={15} />{t('task.action.delete')}
      </Button>,
    );
  }
  // Delivery: an approved task can be handed to the workshop delivery workers
  // (supervisor / platform manager), with customer details and a delivery fee.
  // The requester may target ONE delivery worker or leave the offer open to all.
  if (canManage && task.status === 'completed_approved' && !task.delivery) {
    const openDeliveryModal = () => {
      setDeliveryForm({ customerName: '', customerPhone: '', deliveryAddress: '', deliveryFee: '' });
      setDlvTarget('');
      void api<{ items: { userId: string; name: string; role: string; status: string }[] }>(`/api/workshops/${task.workshopId}/members`)
        .then((res) => setDlvWorkers(res.items.filter((m) => m.role === 'delivery_worker' && m.status === 'active').map((m) => ({ id: m.userId, name: m.name }))))
        .catch(() => setDlvWorkers([]));
      setModal('delivery');
    };
    buttons.push(
      <Button key="delivery" onClick={openDeliveryModal}>
        <Icon name="pin" size={15} />{t('task.requestDelivery')}
      </Button>,
    );
  }
  // Delivery worker: claim a pending delivery, then close it once delivered.
  if (isDeliveryWorker && task.delivery?.status === 'pending') {
    buttons.push(
      <Button key="accept-delivery" onClick={() => void runAction('delivery/accept', {}, 'acceptDelivery')} loading={busy === 'acceptDelivery'}>
        <Icon name="check" size={15} />{t('task.acceptDelivery')}
      </Button>,
    );
  }
  if (isDeliveryWorker && task.delivery?.status === 'accepted' && task.delivery.workerId === user?.id) {
    buttons.push(
      <Button key="complete-delivery" onClick={() => void runAction('delivery/complete', {}, 'markDelivered')} loading={busy === 'markDelivered'}>
        <Icon name="check" size={15} />{t('task.markDelivered')}
      </Button>,
    );
  }

  const submitDeliveryRequest = async () => {
    setBusy('delivery');
    try {
      await api(`/api/tasks/${task.id}/delivery/request`, {
        method: 'POST',
        body: {
          customerName: deliveryForm.customerName.trim(),
          customerPhone: deliveryForm.customerPhone.trim(),
          deliveryAddress: deliveryForm.deliveryAddress.trim(),
          deliveryFee: Number(deliveryForm.deliveryFee),
          ...(dlvTarget ? { deliveryWorkerId: dlvTarget } : {}),
        },
      });
      push('success', t('task.deliveryRequestedToast'));
      setModal(null);
      onChanged();
    } catch (err) {
      push('error', t((err as ApiErrorLike)?.code ?? 'errors.serverError'));
    } finally {
      setBusy(null);
    }
  };

  if (buttons.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">{buttons}</div>

      {/* Approve modal */}
      <Modal open={modal === 'approve'} onClose={() => setModal(null)} title={t('task.action.approve')}>
        <p className="mb-3 text-sm muted">{t('task.reviewIntro')}</p>
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-bold">{t('task.ratingLabel')}</p>
            <Rating value={rating} onChange={setRating} />
          </div>
          <label className="block text-sm font-bold" htmlFor="approve-comment">{t('task.approveComment')}</label>
          <Textarea id="approve-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('task.commentPlaceholder')} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setModal(null)}>{t('common.cancel')}</Button>
            <Button
              onClick={() => void runAction('approve', { rating, comment }, 'approve')}
              loading={busy === 'approve'}
            >
              {t('task.action.approve')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Return modal */}
      <Modal open={modal === 'return'} onClose={() => setModal(null)} title={t('task.action.return')}>
        <p className="mb-3 text-sm muted">{t('task.confirmReturn')}</p>
        <label className="block text-sm font-bold" htmlFor="return-reason">{t('task.returnReason')}</label>
        <Textarea id="return-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('task.returnReasonPlaceholder')} className="mt-1.5" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setModal(null)}>{t('common.cancel')}</Button>
          <Button
            disabled={reason.trim().length < 3}
            onClick={() => void runAction('return', { reason }, 'return')}
            loading={busy === 'return'}
          >
            {t('task.action.return')}
          </Button>
        </div>
      </Modal>

      {/* Cancel modal */}
      <Modal open={modal === 'cancel'} onClose={() => setModal(null)} title={t('task.action.cancel')}>
        <p className="mb-3 text-sm muted">{t('task.confirmCancel')}</p>
        <label className="block text-sm font-bold" htmlFor="cancel-reason">{t('task.cancelReason')}</label>
        <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setModal(null)}>{t('common.cancel')}</Button>
          <Button
            variant="danger"
            onClick={() => void runAction('cancel', { reason }, 'cancel')}
            loading={busy === 'cancel'}
          >
            {t('task.action.cancel')}
          </Button>
        </div>
      </Modal>

      {/* Delivery request modal — customer details + delivery fee */}
      <Modal open={modal === 'delivery'} onClose={() => setModal(null)} title={t('task.requestDelivery')}>
        <p className="mb-3 text-sm muted">{t('task.deliveryIntro')}</p>
        <div className="space-y-3">
          <label className="block text-sm font-bold" htmlFor="dlv-target">{t('task.deliveryWorkerOptional')}</label>
          <select
            id="dlv-target"
            className="input-base"
            value={dlvTarget}
            onChange={(e) => setDlvTarget(e.target.value)}
          >
            <option value="">{t('task.deliveryAllWorkers')}</option>
            {dlvWorkers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <p className="text-xs faint">{t('task.deliveryWorkerHint')}</p>
          <label className="block text-sm font-bold" htmlFor="dlv-customer">{t('task.deliveryCustomer')} *</label>
          <input id="dlv-customer" className="input-base" dir="auto" maxLength={80} value={deliveryForm.customerName} onChange={(e) => setDeliveryForm({ ...deliveryForm, customerName: e.target.value })} />
          <label className="block text-sm font-bold" htmlFor="dlv-phone">{t('task.deliveryPhone')} *</label>
          <input id="dlv-phone" className="input-base" type="tel" inputMode="tel" maxLength={25} value={deliveryForm.customerPhone} onChange={(e) => setDeliveryForm({ ...deliveryForm, customerPhone: e.target.value })} />
          <label className="block text-sm font-bold" htmlFor="dlv-address">{t('task.deliveryAddress')} *</label>
          <textarea id="dlv-address" className="input-base min-h-20" dir="auto" maxLength={300} value={deliveryForm.deliveryAddress} onChange={(e) => setDeliveryForm({ ...deliveryForm, deliveryAddress: e.target.value })} />
          <label className="block text-sm font-bold" htmlFor="dlv-fee">{t('task.deliveryFee')} *</label>
          <input id="dlv-fee" className="input-base" type="number" min={0} step="1" value={deliveryForm.deliveryFee} onChange={(e) => setDeliveryForm({ ...deliveryForm, deliveryFee: e.target.value })} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModal(null)}>{t('common.cancel')}</Button>
            <Button
              loading={busy === 'delivery'}
              disabled={deliveryForm.customerName.trim().length < 2 || deliveryForm.customerPhone.trim().length < 6 || deliveryForm.deliveryAddress.trim().length < 3 || !(Number(deliveryForm.deliveryFee) >= 0) || deliveryForm.deliveryFee === ''}
              onClick={() => void submitDeliveryRequest()}
            >
              {t('task.requestDelivery')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Schedule (draft) / Reschedule modal */}
      <Modal open={modal === 'reschedule'} onClose={() => setModal(null)} title={task.status === 'draft' ? t('task.scheduleTitle') : t('task.rescheduleTitle')}>
        <div className="space-y-3">
          <label className="block text-sm font-bold" htmlFor="sched-assignee">{t('task.assignee')}</label>
          <select
            id="sched-assignee"
            className="input-base"
            value={schedAssignee}
            onChange={(e) => setSchedAssignee(e.target.value)}
            disabled={schedLoadingWorkers}
          >
            <option value="">{schedLoadingWorkers ? t('common.loading') : t('common.select')}</option>
            {schedWorkers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <label className="block text-sm font-bold" htmlFor="sched-start">{t('task.plannedStart')}</label>
          <Input id="sched-start" type="datetime-local" value={schedStart} onChange={(e) => setSchedStart(e.target.value)} />
          <label className="block text-sm font-bold" htmlFor="sched-end">{t('task.plannedEnd')}</label>
          <Input id="sched-end" type="datetime-local" value={schedEnd} onChange={(e) => setSchedEnd(e.target.value)} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setModal(null)}>{t('common.cancel')}</Button>
            <Button
              disabled={!schedStart || !schedEnd || schedEnd <= schedStart || !schedAssignee}
              onClick={() => void runAction(task.status === 'draft' ? 'schedule' : 'reschedule', {
                plannedStart: fromLocalInput(schedStart), plannedEnd: fromLocalInput(schedEnd), assigneeId: schedAssignee,
              }, 'reschedule')}
              loading={busy === 'reschedule'}
            >
              {task.status === 'draft' ? t('task.action.schedule') : t('task.action.reschedule')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Assign modal */}
      <Modal open={modal === 'assign'} onClose={() => setModal(null)} title={t('task.assignTitle')}>
        <p className="mb-3 text-sm muted">{t('task.assignHint')}</p>
        <div className="space-y-3">
          <label className="block text-sm font-bold" htmlFor="assign-worker">{t('task.assignee')}</label>
          <select
            id="assign-worker"
            className="input-base"
            value={schedAssignee}
            onChange={(e) => setSchedAssignee(e.target.value)}
            disabled={schedLoadingWorkers}
          >
            <option value="">{schedLoadingWorkers ? t('common.loading') : t('common.select')}</option>
            {schedWorkers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setModal(null)}>{t('common.cancel')}</Button>
            <Button
              disabled={!schedAssignee}
              onClick={() => void runAction('assign', { assigneeId: schedAssignee }, 'assign')}
              loading={busy === 'assign'}
            >
              {t('task.action.assign')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Progress modal */}
      <Modal open={modal === 'progress'} onClose={() => setModal(null)} title={t('task.action.setProgress')}>
        <label className="block text-sm font-bold" htmlFor="progress-val">{t('task.progressHint')}</label>
        <Input id="progress-val" type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(Math.max(0, Math.min(100, Number(e.target.value))))} className="mt-1.5" />
        <div className="mt-2"><ProgressBar value={progress} label={t('task.progress')} /></div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setModal(null)}>{t('common.cancel')}</Button>
          <Button onClick={() => void runAction('progress', { progress }, 'progress')} loading={busy === 'progress'}>
            {t('common.save')}
          </Button>
        </div>
      </Modal>

      {/* Comment modal */}
      <Modal open={modal === 'comment'} onClose={() => setModal(null)} title={t('task.action.comment')}>
        <label className="block text-sm font-bold" htmlFor="comment-text">{t('task.commentPlaceholder')}</label>
        <Textarea id="comment-text" value={text} onChange={(e) => setText(e.target.value)} className="mt-1.5" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setModal(null)}>{t('common.cancel')}</Button>
          <Button disabled={!text.trim()} onClick={() => void runAction('comment', { text }, 'comment')} loading={busy === 'comment'}>
            {t('common.save')}
          </Button>
        </div>
      </Modal>
    </>
  );
}

/* ---------------- Comments section (task detail page) ---------------- */

/** Dedicated discussion card: every comment in the task's change log as a
 * readable thread, plus an inline composer. Available to the supervisor, the
 * assignee and the creator while the task is still open. */
export function TaskComments({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const { t, locale } = useLocale();
  const { user, isSupervisor } = useAuth();
  const { push } = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const comments = task.changeLog.filter((c) => c.action === 'comment');
  const active = task.status !== 'completed_approved' && task.status !== 'cancelled';
  const canComment = active && (isSupervisor || user?.id === task.assigneeId || user?.id === task.createdById);

  const send = async () => {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    try {
      await api(`/api/tasks/${task.id}/comment`, { method: 'POST', body: { text: value } });
      push('success', t('task.commentPosted'));
      setText('');
      onChanged();
    } catch (err) {
      push('error', t((err as ApiErrorLike)?.code ?? 'errors.serverError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <p className="text-sm faint">{t('task.commentsEmpty')}</p>
      ) : (
        <ul className="space-y-2.5">
          {comments.map((c, i) => (
            <li key={`${c.at}-${i}`} className="comment-bubble">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <span className="inline-flex items-center gap-2 text-sm font-extrabold" style={{ color: 'var(--text-1)' }}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.62rem] font-black text-white" style={{ background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-brand-700))' }} aria-hidden="true">
                    {(c.byName ?? '?').trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="break-words">{c.byName || '—'}</span>
                </span>
                <span className="text-[0.7rem] faint">{formatDateTime(c.at, locale)}</span>
              </div>
              <p dir="auto" className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{c.note}</p>
            </li>
          ))}
        </ul>
      )}

      {canComment ? (
        <div className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <Textarea
            aria-label={t('task.commentPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('task.commentPlaceholder')}
            className="min-h-16"
            maxLength={2000}
          />
          <div className="flex justify-end">
            <Button size="sm" loading={busy} disabled={!text.trim()} onClick={() => void send()}>
              <Icon name="check" size={14} />{t('task.commentSend')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
