import { InferSchemaType, Schema, model } from 'mongoose';

const schema = new Schema({
  name: { type: String, required: true, trim: true },
  timezone: { type: String, default: 'Africa/Cairo' },
  locale: { type: String, default: 'ar', maxlength: 5 },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
}, { timestamps: true });

export type OrganizationDoc = InferSchemaType<typeof schema>;
export const Organization = model('Organization', schema);
