import { Schema, model } from 'mongoose';

const schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: Schema.Types.ObjectId, required: true }, // the clients collection arrives in Phase 2
  roleOnClient: String,
  startsOn: { type: Date, required: true },
  endsOn: Date,
}, { timestamps: true });
schema.index({ organizationId: 1, userId: 1 });

export const ClientAssignment = model('ClientAssignment', schema);
