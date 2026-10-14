import { Schema, model } from 'mongoose';

/** Roles exist per organization; permissions are the global names in db/permissions.ts. */
const schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  name: { type: String, required: true },
  permissions: { type: [String], default: [] },
}, { timestamps: true });
schema.index({ organizationId: 1, name: 1 }, { unique: true });

export const Role = model('Role', schema);
