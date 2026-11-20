import mongoose, { Types } from 'mongoose';
import { Readable } from 'node:stream';
import { env, maxUploadBytes } from '../config/env';
import { ALLOWED_UPLOAD_MIMES } from '../config/constants';
import { ApiError } from '../middleware/errors';
import { Task } from '../db/models/Task';

let bucket: mongoose.mongo.GridFSBucket | null = null;

function getBucket(): mongoose.mongo.GridFSBucket {
  if (!bucket) {
    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: 'attachments',
      chunkSizeBytes: 255 * 1024,
    });
  }
  return bucket;
}

export interface UploadResult {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
}

/** Validate + stream a file into GridFS and attach it to the task metadata. */
export async function uploadAttachment(req: {
  file?: { buffer: Buffer; mimetype: string; originalname: string; size: number };
  auth: { userId: string };
  user: { name: string };
  params: { taskId: string };
}): Promise<UploadResult> {
  const file = req.file;
  if (!file) throw new ApiError(400, 'errors.noFile');
  if (!ALLOWED_UPLOAD_MIMES.has(file.mimetype)) throw new ApiError(400, 'errors.fileNotAllowed');
  if (file.size > maxUploadBytes) throw new ApiError(400, 'errors.fileTooLarge');

  const task = await Task.findById(req.params.taskId);
  if (!task) throw new ApiError(404, 'errors.taskNotFound');
  if (task.attachments.length >= env.MAX_FILES_PER_TASK) throw new ApiError(400, 'errors.tooManyFiles');

  // strip control chars (NUL) and path separators without control-regex literals
  const safeName = file.originalname.split('\u0000').join('_').replace(/[\r\n\\/]/g, '_').slice(0, 200);
  const uploadStream = getBucket().openUploadStream(safeName, {
    contentType: file.mimetype,
    metadata: { uploadedBy: req.auth.userId, taskId: req.params.taskId },
  });
  await new Promise<void>((resolve, reject) => {
    uploadStream.end(file.buffer, (err?: Error | null) => (err ? reject(err) : resolve()));
  });

  const result: UploadResult = {
    fileId: uploadStream.id.toString(),
    filename: safeName,
    mimeType: file.mimetype,
    size: file.size,
    uploadedBy: req.auth.userId,
    uploadedByName: req.user?.name ?? '',
    uploadedAt: new Date().toISOString(),
  };
  task.attachments.push(result);
  task.changeLog.push({
    at: result.uploadedAt,
    byUserId: req.auth.userId,
    byName: req.user?.name ?? '',
    action: 'attach',
    note: safeName,
  });
  await task.save();
  return result;
}

export async function openAttachmentStream(fileId: string, range?: { start?: number; end?: number }): Promise<{
  stream: Readable; filename: string; mimeType: string; length: number;
} | null> {
  if (!Types.ObjectId.isValid(fileId)) return null;
  const files = await getBucket().find({ _id: new Types.ObjectId(fileId) }).limit(1).toArray();
  const meta = files[0];
  if (!meta) return null;
  const stream = getBucket().openDownloadStream(new Types.ObjectId(fileId), range);
  return {
    stream,
    filename: (meta.filename ?? 'attachment').toString(),
    mimeType: (meta.contentType ?? 'application/octet-stream').toString(),
    length: meta.length ?? 0,
  };
}

export async function deleteAttachment(taskId: string, fileId: string, userId: string, userName: string): Promise<void> {
  const task = await Task.findById(taskId);
  if (!task) throw new ApiError(404, 'errors.taskNotFound');
  const idx = task.attachments.findIndex((a) => a.fileId === fileId);
  if (idx === -1) throw new ApiError(404, 'errors.notFound');
  const removed = task.attachments[idx]!;
  task.attachments.splice(idx, 1);
  await task.save();
  task.changeLog.push({
    at: new Date().toISOString(),
    byUserId: userId,
    byName: userName,
    action: 'attach',
    note: `removed:${removed.filename}`,
  });
  try {
    await getBucket().delete(new Types.ObjectId(fileId));
  } catch (err) {
    console.error('[attachments] gridfs delete failed:', (err as Error).message);
  }
  await task.save();
}

/** Cleanup plan for deleted tasks (called by admin task deletion if ever enabled). */
export async function deleteTaskAttachments(task: ITaskLike): Promise<void> {
  for (const att of task.attachments) {
    try {
      await getBucket().delete(new Types.ObjectId(att.fileId));
    } catch {
      /* already gone */
    }
  }
}

interface ITaskLike {
  attachments: { fileId: string }[];
}
