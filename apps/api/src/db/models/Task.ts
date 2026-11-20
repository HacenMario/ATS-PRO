import mongoose, { Schema, model, Document, Model, Types } from 'mongoose';
import type { TaskStatus, TaskPriority, TaskAttachment, TaskChangeLogEntry, TaskDelivery } from '@ats/shared';

export interface ITask extends Document {
  workshopId: Types.ObjectId;
  title: string;
  description: string;
  assigneeId: Types.ObjectId | null;
  createdById: Types.ObjectId;
  status: TaskStatus;
  previousStatus: TaskStatus | null;
  priority: TaskPriority;
  progress: number;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  reportedAt: Date | null;
  reviewStartedAt: Date | null;
  approvedAt: Date | null;
  plannedDurationMs: number | null;
  actualDurationMs: number | null;
  location: string;
  safetyNotes: string;
  attachments: TaskAttachment[];
  supervisorComment: string;
  supervisorRating: number | null;
  returnReason: string;
  dueSoonNotifiedAt: Date | null;
  overdueNotifiedAt: Date | null;
  changeLog: (TaskChangeLogEntry & { note?: string })[];
  delivery: TaskDelivery | null;
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema<TaskAttachment>(
  {
    fileId: { type: String, required: true },
    filename: { type: String, required: true, maxlength: 200 },
    mimeType: { type: String, required: true, maxlength: 120 },
    size: { type: Number, required: true, min: 0 },
    uploadedBy: { type: String, required: true },
    uploadedByName: { type: String, default: '' },
    uploadedAt: { type: String, required: true },
  },
  { _id: false },
);

const ChangeLogSchema = new Schema<TaskChangeLogEntry>(
  {
    at: { type: String, required: true },
    byUserId: { type: String, required: true },
    byName: { type: String, default: '' },
    action: { type: String, required: true },
    from: { type: String, default: null },
    to: { type: String, default: null },
    field: { type: String },
    note: { type: String, maxlength: 2000 },
  },
  { _id: false },
);

const DeliverySchema = new Schema<TaskDelivery>(
  {
    status: { type: String, enum: ['pending', 'accepted', 'delivered'], required: true },
    customerName: { type: String, required: true, maxlength: 80 },
    customerPhone: { type: String, required: true, maxlength: 25 },
    address: { type: String, required: true, maxlength: 300 },
    fee: { type: Number, required: true, min: 0 },
    workerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    workerName: { type: String, default: null },
    requestedAt: { type: String, required: true },
    deliveredAt: { type: String, default: null },
  },
  { _id: false },
);

const TaskSchema = new Schema<ITask>(
  {
    workshopId: { type: Schema.Types.ObjectId, ref: 'Workshop', required: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, maxlength: 5000 },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, required: true, index: true },
    previousStatus: { type: String, default: null },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium', index: true },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    plannedStart: { type: Date, default: null },
    plannedEnd: { type: Date, default: null },
    actualStart: { type: Date, default: null },
    reportedAt: { type: Date, default: null },
    reviewStartedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    plannedDurationMs: { type: Number, default: null },
    actualDurationMs: { type: Number, default: null },
    location: { type: String, default: '', maxlength: 200 },
    safetyNotes: { type: String, default: '', maxlength: 2000 },
    attachments: { type: [AttachmentSchema], default: [] },
    supervisorComment: { type: String, default: '', maxlength: 2000 },
    supervisorRating: { type: Number, default: null, min: 1, max: 5 },
    returnReason: { type: String, default: '', maxlength: 1000 },
    dueSoonNotifiedAt: { type: Date, default: null },
    overdueNotifiedAt: { type: Date, default: null },
    changeLog: { type: [ChangeLogSchema], default: [] },
    delivery: { type: DeliverySchema, default: null },
  },
  { timestamps: true },
);

TaskSchema.index({ workshopId: 1, status: 1, plannedEnd: 1 });
TaskSchema.index({ workshopId: 1, assigneeId: 1, status: 1 });
TaskSchema.index({ workshopId: 1, createdAt: -1 });
TaskSchema.index(
  { title: 'text', description: 'text' },
  { name: 'task_text_search', weights: { title: 3, description: 1 } },
);

export const Task = (mongoose.models.Task as Model<ITask>) || model<ITask>('Task', TaskSchema);
