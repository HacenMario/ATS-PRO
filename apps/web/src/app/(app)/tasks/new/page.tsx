'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { useLocale } from '@/providers/locale';
import { useToast } from '@/providers/toast';
import { Button, Card, Field, Input, Select, Textarea, Segmented, ErrorState } from '@/components/ui';
import { fromLocalInput } from '@/lib/format';
import type { WorkerOption } from '@/components/tasks';
import { TASK_PRIORITIES } from '@ats/shared';

export default function NewTaskPage() {
  const { isSupervisor, isSuperAdmin } = useAuth();
  const { t } = useLocale();
  const { push } = useToast();
  const router = useRouter();

  const [workshops, setWorkshops] = useState<{ id: string; name: string }[]>([]);
  const [members, setMembers] = useState<WorkerOption[]>([]);
  const [workshopId, setWorkshopId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [location, setLocation] = useState('');
  const [safetyNotes, setSafetyNotes] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => { document.title = t('pageTitles.newTask'); }, [t]);

  // Load supervised workshops (supervisor) or all (super admin).
  useEffect(() => {
    if (!(isSupervisor || isSuperAdmin)) return;
    (async () => {
      try {
        const ws = await api<{ items: { id: string; name: string; membershipRole?: string }[] }>('/api/workshops');
        const usable = isSuperAdmin ? ws.items : ws.items.filter((w) => (w as { membershipRole?: string }).membershipRole === 'supervisor');
        setWorkshops(usable);
        if (usable.length > 0) setWorkshopId(usable[0]!.id);
      } catch { /* ignore */ }
    })();
  }, [isSupervisor, isSuperAdmin]);

  // Active members of the selected workshop (the ONLY valid assignees).
  const loadMembers = useCallback(async (wsId: string) => {
    if (!wsId) return;
    try {
      const res = await api<{ items: { userId: string; name: string; role: string; status: string }[] }>(`/api/workshops/${wsId}/members`);
      setMembers(res.items
        .filter((m) => m.status === 'active')
        .map((m) => ({ id: m.userId, name: m.name })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadMembers(workshopId); }, [workshopId, loadMembers]);

  if (!isSupervisor && !isSuperAdmin) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <ErrorState message={t('errors.forbidden')} />
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const body = {
        workshopId,
        title: title.trim(),
        description: description.trim(),
        assigneeId: assigneeId || undefined,
        priority,
        location: location.trim(),
        safetyNotes: safetyNotes.trim(),
        plannedStart: plannedStart ? fromLocalInput(plannedStart) : undefined,
        plannedEnd: plannedEnd ? fromLocalInput(plannedEnd) : undefined,
        publish,
      };
      const res = await api<{ task: { id: string } }>('/api/tasks', { method: 'POST', body });
      push('success', t('task.created'));
      router.replace(`/tasks/${res.task.id}`);
    } catch (err) {
      const errFields = (err as { fields?: Record<string, string> })?.fields;
      if (errFields) setFields(errFields);
      setError(t((err as { code?: string })?.code ?? 'errors.serverError'));
    } finally {
      setBusy(false);
    }
  };

  const canPublish = Boolean(assigneeId && plannedStart && plannedEnd && plannedEnd > plannedStart);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>{t('task.newTitle')}</h1>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <Card className="space-y-4">
          <Field label={t('task.workshop')} required>
            <Select value={workshopId} onChange={(e) => { setWorkshopId(e.target.value); setAssigneeId(''); }}>
              {workshops.length === 0 ? <option value="">{t('workshop.selectWorkshop')}</option> : null}
              {workshops.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </Select>
          </Field>

          <Field label={t('task.titleLabel')} required error={fields.title ? t(fields.title) : undefined}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={150} />
          </Field>

          <Field label={t('task.description')} required error={fields.description ? t(fields.description) : undefined}>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={4} />
          </Field>

          <Field label={t('task.assignee')} required={publish} hint={publish ? t('errors.assigneeRequired') : undefined} error={fields.assigneeId ? t(fields.assigneeId) : undefined}>
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">{t('common.select')}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('task.plannedStart')} required={publish}>
              <Input type="datetime-local" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
            </Field>
            <Field label={t('task.plannedEnd')} required={publish} error={plannedStart && plannedEnd && plannedEnd <= plannedStart ? t('errors.endBeforeStart') : undefined}>
              <Input type="datetime-local" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
            </Field>
          </div>

          <Field label={t('common.priority')}>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>{t(`priority.${p}`)}</option>
              ))}
            </Select>
          </Field>

          <Field label={t('task.location')} hint={t('common.optional')}>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
          </Field>

          <Field label={t('task.safetyNotes')} hint={t('common.optional')}>
            <Textarea value={safetyNotes} onChange={(e) => setSafetyNotes(e.target.value)} rows={3} maxLength={2000} />
          </Field>
        </Card>

        <Card>
          <p className="mb-2 text-sm font-bold">{t('common.status')}</p>
          <Segmented
            value={publish ? 'scheduled' : 'draft'}
            onChange={(v) => setPublish(v === 'scheduled')}
            ariaLabel={t('common.status')}
            options={[
              { value: 'draft', label: t('status.draft') },
              { value: 'scheduled', label: t('status.scheduled') },
            ]}
          />
          {!canPublish && publish ? (
            <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--st-overdue)' }}>{t('errors.scheduleRequiredFields')}</p>
          ) : null}
        </Card>

        {error ? <ErrorState message={error} /> : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>{t('common.cancel')}</Button>
          <Button type="submit" loading={busy} disabled={!workshopId || !title || !description || (publish && !canPublish)}>
            {publish ? t('status.scheduled') : t('status.draft')} — {t('common.create')}
          </Button>
        </div>
      </form>
    </div>
  );
}
