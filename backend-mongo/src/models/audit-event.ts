import { Schema, model } from 'mongoose';

/** Append-only, per-organization hash chain; see db/audit-chain.ts. seq, prevHash and hash are set there, never by callers. */
const eventSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  seq: { type: Number, required: true },
  actorId: Schema.Types.ObjectId,
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: String,
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  ip: String,
  occurredAt: { type: Date, required: true },
  prevHash: { type: String, required: true },
  hash: { type: String, required: true },
}, { versionKey: false });
eventSchema.index({ organizationId: 1, seq: 1 }, { unique: true });
eventSchema.index({ organizationId: 1, entityType: 1, entityId: 1 });

const blocked = (): never => { throw new Error('audit_events is append-only'); };
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
  eventSchema.pre(op, blocked);
}
eventSchema.pre('save', function () { if (!this.isNew) blocked(); });

const headSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, unique: true },
  lastSeq: { type: Number, default: 0 },
  lastHash: { type: String, default: '0'.repeat(64) },
}, { versionKey: false });

export const AuditEvent = model('AuditEvent', eventSchema);
export const AuditChainHead = model('AuditChainHead', headSchema);
