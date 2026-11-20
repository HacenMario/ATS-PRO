import { Router, Request, Response } from 'express';
import { taskQuerySchema, createTaskSchema, scheduleSchema, assignSchema, updateTaskSchema, progressSchema, reportDoneSchema, approveSchema, returnTaskSchema, cancelTaskSchema, commentSchema, requestDeliverySchema } from '@ats/shared';
import { ApiError, asyncHandler } from '../middleware/errors';
import { requireAuth } from '../middleware/auth';
import * as tasksService from '../services/tasks';
import { uploadLimiter } from '../middleware/rate';
import { uploadAttachment, openAttachmentStream, deleteAttachment } from '../services/attachments';
import multer from 'multer';
import { env } from '../config/env';
import { Types } from 'mongoose';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});

/** GET /api/tasks — role-scoped, filterable, paginated list. */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const q = taskQuerySchema.parse(req.query);
  const result = await tasksService.listTasks(req, { ...q, workshopId: typeof req.query.workshopId === 'string' ? req.query.workshopId : undefined });
  res.json(result);
}));

/** GET /api/tasks/stats — dashboard aggregates. */
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const workshopId = typeof req.query.workshopId === 'string' && Types.ObjectId.isValid(req.query.workshopId) ? req.query.workshopId : undefined;
  res.json(await tasksService.taskStats(req, workshopId));
}));

/** POST /api/tasks — supervisor creates (draft or scheduled). */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const workshopId = typeof body.workshopId === 'string' ? body.workshopId : undefined;
  const { workshopId: _omit, ...rest } = body;
  if (!workshopId || !Types.ObjectId.isValid(workshopId)) throw new ApiError(400, 'errors.workshopRequired');
  const input = createTaskSchema.parse(rest);
  const task = await tasksService.createTask(req, workshopId, input);
  res.status(201).json({ task });
}));

/** GET /api/tasks/:id */
router.get('/:taskId', asyncHandler(async (req: Request, res: Response) => {
  res.json({ task: await tasksService.getTask(req, String(req.params.taskId)) });
}));

/** PATCH /api/tasks/:id — supervisor edits details. */
router.patch('/:taskId', asyncHandler(async (req: Request, res: Response) => {
  const input = updateTaskSchema.parse(req.body);
  res.json({ task: await tasksService.updateTaskDetails(req, String(req.params.taskId), input) });
}));

/** POST /api/tasks/:id/schedule — draft/overdue/cancelled -> scheduled. */
router.post('/:taskId/schedule', asyncHandler(async (req: Request, res: Response) => {
  const input = scheduleSchema.parse(req.body);
  res.json({ task: await tasksService.scheduleTask(req, String(req.params.taskId), input, false) });
}));

/** POST /api/tasks/:id/assign — (re)assign to another member, draft/scheduled only. */
router.post('/:taskId/assign', asyncHandler(async (req: Request, res: Response) => {
  const input = assignSchema.parse(req.body);
  res.json({ task: await tasksService.assignTask(req, String(req.params.taskId), input) });
}));

/** POST /api/tasks/:id/reschedule */
router.post('/:taskId/reschedule', asyncHandler(async (req: Request, res: Response) => {
  const input = scheduleSchema.parse(req.body);
  res.json({ task: await tasksService.scheduleTask(req, String(req.params.taskId), input, true) });
}));

/** POST /api/tasks/:id/start — assigned worker (or supervisor) starts. */
router.post('/:taskId/start', asyncHandler(async (req: Request, res: Response) => {
  res.json({ task: await tasksService.startTask(req, String(req.params.taskId)) });
}));

/** POST /api/tasks/:id/progress */
router.post('/:taskId/progress', asyncHandler(async (req: Request, res: Response) => {
  const input = progressSchema.parse(req.body);
  res.json({ task: await tasksService.setProgress(req, String(req.params.taskId), input.progress) });
}));

/** POST /api/tasks/:id/report — worker reports completion (NEVER the supervisor). */
router.post('/:taskId/report', asyncHandler(async (req: Request, res: Response) => {
  const input = reportDoneSchema.parse(req.body ?? {});
  res.json({ task: await tasksService.reportDone(req, String(req.params.taskId), input.note) });
}));

/** POST /api/tasks/:id/begin-review — supervisor starts the on-site inspection. */
router.post('/:taskId/begin-review', asyncHandler(async (req: Request, res: Response) => {
  res.json({ task: await tasksService.beginReview(req, String(req.params.taskId)) });
}));

/** POST /api/tasks/:id/approve — supervisor confirms completion with rating. */
router.post('/:taskId/approve', asyncHandler(async (req: Request, res: Response) => {
  const input = approveSchema.parse(req.body);
  res.json({ task: await tasksService.approveTask(req, String(req.params.taskId), input) });
}));

/** POST /api/tasks/:id/return — supervisor returns with a reason. */
router.post('/:taskId/return', asyncHandler(async (req: Request, res: Response) => {
  const input = returnTaskSchema.parse(req.body);
  res.json({ task: await tasksService.returnTask(req, String(req.params.taskId), input.reason) });
}));

/** POST /api/tasks/:id/cancel */
router.post('/:taskId/cancel', asyncHandler(async (req: Request, res: Response) => {
  const input = cancelTaskSchema.parse(req.body ?? {});
  res.json({ task: await tasksService.cancelTask(req, String(req.params.taskId), input.reason) });
}));

/** DELETE /api/tasks/:id — hard-delete with full cascade (attachments,
 * notifications). Supervisors of the workshop and the platform manager only. */
router.delete('/:taskId', asyncHandler(async (req: Request, res: Response) => {
  await tasksService.deleteTask(req, String(req.params.taskId));
  res.json({ ok: true });
}));

/** POST /api/tasks/:id/delivery/request — supervisor / platform manager sends an
 * approved task to the workshop delivery workers (customer details + fee). */
router.post('/:taskId/delivery/request', asyncHandler(async (req: Request, res: Response) => {
  const input = requestDeliverySchema.parse(req.body ?? {});
  res.json({ task: await tasksService.requestDelivery(req, String(req.params.taskId), input) });
}));

/** POST /api/tasks/:id/delivery/accept — delivery worker claims the delivery. */
router.post('/:taskId/delivery/accept', asyncHandler(async (req: Request, res: Response) => {
  res.json({ task: await tasksService.acceptDelivery(req, String(req.params.taskId)) });
}));

/** POST /api/tasks/:id/delivery/complete — delivery worker marks it delivered. */
router.post('/:taskId/delivery/complete', asyncHandler(async (req: Request, res: Response) => {
  res.json({ task: await tasksService.completeDelivery(req, String(req.params.taskId)) });
}));

/** POST /api/tasks/:id/comment */
router.post('/:taskId/comment', asyncHandler(async (req: Request, res: Response) => {
  const input = commentSchema.parse(req.body);
  res.json({ task: await tasksService.addComment(req, String(req.params.taskId), input.text) });
}));

/** POST /api/tasks/:id/attachments — GridFS upload (never routed via Vercel). */
router.post('/:taskId/attachments', uploadLimiter, upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  const result = await uploadAttachment(req as never);
  res.status(201).json({ attachment: result });
}));

/** DELETE /api/tasks/:taskId/attachments/:fileId */
router.delete('/:taskId/attachments/:fileId', asyncHandler(async (req: Request, res: Response) => {
  await deleteAttachment(String(req.params.taskId), String(req.params.fileId), req.auth!.userId, req.user?.name ?? '');
  res.json({ ok: true });
}));

/** GET /api/tasks/:taskId/attachments/:fileId — authorized stream.
 * Images/videos are served inline (so <img>/<video> can preview them, with
 * HTTP Range support for video seeking); everything else — and any request
 * with ?dl=1 — downloads as a file. */
router.get('/:taskId/attachments/:fileId', asyncHandler(async (req: Request, res: Response) => {
  // Authorization: caller must be able to read the parent task.
  await tasksService.getTask(req, String(req.params.taskId));
  const fileId = String(req.params.fileId);
  const opened = await openAttachmentStream(fileId);
  if (!opened) throw new ApiError(404, 'errors.notFound');

  const forceDownload = req.query.dl === '1';
  const isMedia = /^(image|video)\//.test(opened.mimeType);
  const inline = isMedia && !forceDownload;

  // helmet sets CORP: same-origin globally, which blocks <img>/<video> tags on
  // the web origin (different port) from embedding these files. The attachment
  // route is authorized by cookie, so allowing cross-origin embedding here is safe.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', opened.mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(opened.filename)}"`);

  const range = inline ? /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? '')) : null;
  if (range && opened.length > 0) {
    const start = range[1] === '' ? 0 : Number(range[1]);
    const end = range[2] === '' ? opened.length - 1 : Math.min(Number(range[2]), opened.length - 1);
    if (start > end || start >= opened.length) {
      res.status(416).setHeader('Content-Range', `bytes */${opened.length}`);
      return res.end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${opened.length}`);
    res.setHeader('Content-Length', String(end - start + 1));
    const partial = await openAttachmentStream(fileId, { start, end });
    if (partial) {
      partial.stream.pipe(res);
      partial.stream.on('error', () => res.end());
    } else {
      res.end();
    }
    return;
  }
  if (opened.length > 0 && inline) res.setHeader('Content-Length', String(opened.length));
  opened.stream.pipe(res);
  opened.stream.on('error', () => {
    if (!res.headersSent) res.status(404).json({ error: { code: 'errors.notFound' } });
    else res.end();
  });
}));

export default router;
