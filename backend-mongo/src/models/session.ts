import { Schema, model } from 'mongoose';

/** Server-side session. Only the SHA-256 of the cookie value is stored, so a database leak does not yield usable sessions. */
const schema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, required: true },
  ip: String,
  userAgent: String,
  lastActivityAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL on the absolute expiry
});

export const Session = model('Session', schema);
