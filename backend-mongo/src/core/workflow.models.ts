import { Schema, model } from 'mongoose';
import { OPS } from './workflow-rules.js';

const org = { type: Schema.Types.ObjectId, ref: 'Organization', required: true };

const state = new Schema({ name: { type: String, required: true }, label: { type: String, required: true }, editable: { type: Boolean, default: false } }, { _id: false });
const transition = new Schema({
  from: { type: String, required: true }, to: { type: String, required: true }, action: { type: String, required: true }, label: { type: String, required: true },
  allowedRoles: [String], allowedUsers: [String],
  approvals: { type: Number, default: 1 }, requireComment: { type: Boolean, default: false }, preventSelfApproval: { type: Boolean, default: false },
  conditions: [new Schema({ field: String, op: { type: String, enum: OPS }, value: Schema.Types.Mixed }, { _id: false })],
}, { _id: false });
const escalation = new Schema({ state: { type: String, required: true }, afterHours: { type: Number, required: true }, notifyRoles: [String], notifyUsers: [String], remindApprovers: { type: Boolean, default: false } }, { _id: false });

/** One workflow per document type and organization. */
const workflow = new Schema({
  organizationId: org, doctype: { type: String, required: true }, name: { type: String, required: true }, active: { type: Boolean, default: true },
  states: [state], initialState: { type: String, required: true }, transitions: [transition], escalations: [escalation],
}, { timestamps: true });
workflow.index({ organizationId: 1, doctype: 1 }, { unique: true });

/** Lets `toUserId` act with `fromUserId`'s eligibility between two dates (inclusive, YYYY-MM-DD). */
const delegation = new Schema({
  organizationId: org, fromUserId: { type: Schema.Types.ObjectId, required: true }, toUserId: { type: Schema.Types.ObjectId, required: true },
  startDate: { type: String, required: true }, endDate: { type: String, required: true },
}, { timestamps: true });
delegation.index({ organizationId: 1, toUserId: 1 });
delegation.index({ organizationId: 1, fromUserId: 1 });

const notification = new Schema({
  organizationId: org, userId: { type: Schema.Types.ObjectId, required: true }, kind: { type: String, enum: ['workflow', 'escalation'], required: true },
  title: { type: String, required: true }, body: String, link: String, readAt: Date,
}, { timestamps: true });
notification.index({ organizationId: 1, userId: 1, createdAt: -1 });

export const Workflow = model('Workflow', workflow);
export const Delegation = model('Delegation', delegation);
export const Notification = model('Notification', notification);
