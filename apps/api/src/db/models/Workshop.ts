import mongoose, { Schema, model, Document, Model } from 'mongoose';

export interface IWorkshop extends Document {
  name: string;
  description: string;
  address: string;
  contactPhone: string;
  contactEmail: string;
  timezone: string;
  status: 'active' | 'suspended';
  createdById: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WorkshopSchema = new Schema<IWorkshop>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 2000 },
    address: { type: String, default: '', maxlength: 300 },
    contactPhone: { type: String, default: '', maxlength: 40 },
    contactEmail: { type: String, default: '', maxlength: 200 },
    timezone: { type: String, default: 'Africa/Algiers', maxlength: 64 },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const Workshop = (mongoose.models.Workshop as Model<IWorkshop>) || model<IWorkshop>('Workshop', WorkshopSchema);
