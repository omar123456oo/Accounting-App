import { Schema, model } from 'mongoose';

const org = { type: Schema.Types.ObjectId, ref: 'Organization', required: true };

export const SERVER_EVENTS = ['before_save', 'after_save', 'before_delete', 'before_action', 'after_action'] as const;
export type ServerEvent = (typeof SERVER_EVENTS)[number];
export const SCRIPT_KINDS = ['server', 'client'] as const;

/**
 * Code a developer attached to a document type. `server` scripts run in the sandbox on the server at one event; `client`
 * scripts are delivered to the browser, which runs them in its own sandbox and registers its handlers from inside the code.
 */
const script = new Schema({
  organizationId: org,
  doctype: { type: String, required: true },
  kind: { type: String, enum: SCRIPT_KINDS, required: true },
  name: { type: String, required: true },
  event: { type: String, enum: [...SERVER_EVENTS, null] },
  code: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  order: { type: Number, default: 100 },
  description: String,
  /** Moves when the code or event changes. The audit trail keeps every earlier version. */
  version: { type: Number, default: 1 },
  createdBy: Schema.Types.ObjectId,
  updatedBy: Schema.Types.ObjectId,
}, { timestamps: true });
script.index({ organizationId: 1, doctype: 1, kind: 1, name: 1 }, { unique: true });
script.index({ organizationId: 1, doctype: 1, kind: 1, event: 1, enabled: 1 });

const LOG_DAYS = 14;
/** One row per run of a server script, for the developer who has to debug it. Expires by itself. */
const scriptLog = new Schema({
  organizationId: org, scriptId: { type: Schema.Types.ObjectId, required: true }, name: String, doctype: String, event: String, record: String,
  userId: Schema.Types.ObjectId, ok: { type: Boolean, required: true }, kind: String, message: String, durationMs: Number, logs: [String], messages: [String],
  createdAt: { type: Date, default: Date.now, expires: LOG_DAYS * 86400 },
}, { versionKey: false });
scriptLog.index({ organizationId: 1, scriptId: 1, createdAt: -1 });

export const Script = model('Script', script);
export const ScriptLog = model('ScriptLog', scriptLog);
