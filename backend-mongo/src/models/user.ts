import { InferSchemaType, Schema, model } from 'mongoose';

const schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  // Globally unique and lower-case: login finds the user before the tenant is known.
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  emailVerifiedAt: Date,
  passwordHash: { type: String, required: true, select: false },
  type: { type: String, enum: ['staff', 'client'], required: true },
  roles: { type: [String], default: [] },
  clientId: { type: Schema.Types.ObjectId }, // used from Phase 2
  lockedUntil: Date,
  failedLogins: { type: Number, default: 0 },
  mfaSecret: { type: String, select: false }, // encrypt at the application layer before saving
  mfaEnabled: { type: Boolean, default: false },
}, { timestamps: true });

export type UserDoc = InferSchemaType<typeof schema>;
export const User = model('User', schema);
