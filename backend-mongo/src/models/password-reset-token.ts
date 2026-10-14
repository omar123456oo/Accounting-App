import { Schema, model } from 'mongoose';

const schema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  tokenHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 }, // TTL: 1 h
});

export const PasswordResetToken = model('PasswordResetToken', schema);
