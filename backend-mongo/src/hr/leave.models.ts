import { Schema, model } from 'mongoose';

const org = { type: Schema.Types.ObjectId, ref: 'Organization', required: true };
const employee = { type: Schema.Types.ObjectId, ref: 'Employee', required: true };

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

const leaveType = new Schema({
  organizationId: org, nameAr: { type: String, required: true }, nameEn: { type: String, required: true },
  /** Days per year; null means no limit (for example unpaid leave). */
  entitlementDays: { type: Number, default: null }, paid: { type: Boolean, default: true }, active: { type: Boolean, default: true },
}, { timestamps: true });
leaveType.index({ organizationId: 1, nameEn: 1 }, { unique: true });

/** One document per organization: weekends (0 = Sunday), public holidays and the unpaid-leave divisor are office policy, not code. */
const hrSettings = new Schema({
  organizationId: { ...org, unique: true },
  weekendDays: { type: [Number], default: [5, 6] }, holidays: { type: [String], default: [] }, unpaidLeaveDivisor: { type: Number, default: 30 },
}, { timestamps: true });

const leaveRequest = new Schema({
  organizationId: org, employeeId: employee, typeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  from: { type: String, required: true }, to: { type: String, required: true }, days: { type: Number, required: true }, reason: { type: String, default: '' },
  status: { type: String, enum: LEAVE_STATUSES, default: 'pending', required: true },
  decidedBy: String, decidedById: Schema.Types.ObjectId, decidedAt: Date, note: String,
  createdById: Schema.Types.ObjectId,
}, { timestamps: true });
leaveRequest.index({ organizationId: 1, employeeId: 1, status: 1, from: 1 });
leaveRequest.index({ organizationId: 1, status: 1, from: -1 });

/** Cached balance per employee, leave type and year. Always changed together with a ledger row, in one transaction. */
const balanceHead = new Schema({
  organizationId: org, employeeId: employee, typeId: { type: Schema.Types.ObjectId, required: true }, year: { type: Number, required: true },
  used: { type: Number, default: 0 }, pending: { type: Number, default: 0 }, adjustment: { type: Number, default: 0 },
}, { versionKey: false });
balanceHead.index({ organizationId: 1, employeeId: 1, typeId: 1, year: 1 }, { unique: true });

/** The audit trail of every day moved. A request can produce each kind at most once, which is what prevents a double deduction. */
export const LEDGER_KINDS = ['hold', 'hold_release', 'use', 'use_reverse', 'adjust'] as const;
const leaveLedger = new Schema({
  organizationId: org, employeeId: employee, typeId: { type: Schema.Types.ObjectId, required: true }, year: { type: Number, required: true },
  kind: { type: String, enum: LEDGER_KINDS, required: true }, days: { type: Number, required: true },
  requestId: Schema.Types.ObjectId, reason: String, actorId: Schema.Types.ObjectId, at: { type: Date, default: Date.now },
}, { versionKey: false });
leaveLedger.index({ organizationId: 1, requestId: 1, kind: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'objectId' } } });
leaveLedger.index({ organizationId: 1, employeeId: 1, typeId: 1, year: 1 });

/** Touched at the start of every leave change so changes for one employee run one after another. */
const leaveLock = new Schema({ organizationId: org, employeeId: employee, n: { type: Number, default: 0 } }, { versionKey: false });
leaveLock.index({ organizationId: 1, employeeId: 1 }, { unique: true });

export const LeaveType = model('LeaveType', leaveType);
export const HrSettings = model('HrSettings', hrSettings);
export const LeaveRequest = model('LeaveRequest', leaveRequest);
export const LeaveBalanceHead = model('LeaveBalanceHead', balanceHead);
export const LeaveLedger = model('LeaveLedger', leaveLedger);
export const LeaveLock = model('LeaveLock', leaveLock);
