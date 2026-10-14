import { Schema, model } from 'mongoose';

const schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  userId: { type: Schema.Types.ObjectId, required: true },
  key: { type: String, required: true, maxlength: 128 },
  route: { type: String, required: true },
  requestHash: { type: String, required: true, maxlength: 64 },
  statusCode: Number,
  responseBody: String,
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 }, // TTL: keys expire after 24 h
});
schema.index({ organizationId: 1, userId: 1, key: 1, route: 1 }, { unique: true });

export const IdempotencyKey = model('IdempotencyKey', schema);
