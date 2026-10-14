import { Schema, model } from 'mongoose';

const org = { type: Schema.Types.ObjectId, ref: 'Organization', required: true };
const ref = (to: string) => ({ type: Schema.Types.ObjectId, ref: to });

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'intern'] as const;
export const EMPLOYEE_STATUSES = ['active', 'inactive', 'terminated', 'archived'] as const;
export const CONTRACT_STATUSES = ['draft', 'active', 'renewed', 'expired', 'terminated'] as const;

const common = { organizationId: org, active: { type: Boolean, default: true } };

const branch = new Schema({ ...common, code: { type: String, required: true }, name: { type: String, required: true }, nameAr: String, address: String }, { timestamps: true });
branch.index({ organizationId: 1, code: 1 }, { unique: true });

const department = new Schema({
  ...common, code: { type: String, required: true }, name: { type: String, required: true }, nameAr: String,
  parentId: ref('Department'), managerId: ref('Employee'), costCenter: String,
}, { timestamps: true });
department.index({ organizationId: 1, code: 1 }, { unique: true });
department.index({ organizationId: 1, parentId: 1 });

const grade = new Schema({ ...common, code: { type: String, required: true }, name: { type: String, required: true }, level: { type: Number, required: true } }, { timestamps: true });
grade.index({ organizationId: 1, code: 1 }, { unique: true });

const position = new Schema({
  ...common, code: { type: String, required: true }, title: { type: String, required: true }, titleAr: String,
  departmentId: ref('Department'), gradeId: ref('Grade'), description: String,
}, { timestamps: true });
position.index({ organizationId: 1, code: 1 }, { unique: true });

const employee = new Schema({
  organizationId: org,
  employeeNo: { type: String, required: true },
  userId: ref('User'), // optional: an employee need not have a login
  firstName: { type: String, required: true }, lastName: { type: String, required: true }, nameAr: String,
  email: { type: String, lowercase: true, trim: true }, phone: String, dateOfBirth: String, gender: { type: String, enum: ['female', 'male'] },
  nationalId: { type: String, select: false },
  address: String,
  emergencyContacts: [{ _id: false, name: { type: String, required: true }, relation: String, phone: { type: String, required: true } }],
  departmentId: ref('Department'), branchId: ref('Branch'), positionId: ref('Position'), gradeId: ref('Grade'), managerId: ref('Employee'),
  workLocation: String,
  employmentType: { type: String, enum: EMPLOYMENT_TYPES, required: true },
  status: { type: String, enum: EMPLOYEE_STATUSES, default: 'active', required: true },
  hireDate: { type: String, required: true }, probationEndDate: String, confirmationDate: String,
  education: [{ _id: false, degree: String, institution: String, year: Number }],
  certifications: [{ _id: false, name: String, issuer: String, issuedOn: String, expiresOn: String }],
  skills: [String],
  previousEmployment: [{ _id: false, employer: String, title: String, from: String, to: String }],
  bank: { type: { _id: false, bankName: String, accountName: String, iban: String }, select: false },
  notes: { type: String, select: false }, // HR-only remarks
  exit: { type: { _id: false, date: String, reason: String, rehireEligible: { type: Boolean, default: true } } },
  archivedAt: Date,
}, { timestamps: true });
employee.index({ organizationId: 1, employeeNo: 1 }, { unique: true });
employee.index({ organizationId: 1, userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } });
employee.index({ organizationId: 1, status: 1, departmentId: 1 });
employee.index({ organizationId: 1, managerId: 1 });

/** Append-only history of what changed, when it took effect and who did it. */
const employeeEvent = new Schema({
  organizationId: org, employeeId: { ...ref('Employee'), required: true },
  kind: { type: String, required: true }, effectiveFrom: { type: String, required: true },
  changes: Schema.Types.Mixed, note: String, actorId: ref('User'), at: { type: Date, default: Date.now },
}, { versionKey: false });
employeeEvent.index({ organizationId: 1, employeeId: 1, at: -1 });

const contract = new Schema({
  organizationId: org, employeeId: { ...ref('Employee'), required: true },
  number: { type: String, required: true }, version: { type: Number, default: 1 },
  type: { type: String, required: true },
  status: { type: String, enum: CONTRACT_STATUSES, default: 'draft', required: true },
  startDate: { type: String, required: true }, endDate: String,
  probationMonths: Number, renewalTerms: String,
  alertDays: { type: Number, default: 60 },
  previousContractId: ref('Contract'),
  attachments: [{ _id: false, name: String, documentId: String }],
  amendments: [{ _id: false, at: Date, by: ref('User'), reason: String, changes: Schema.Types.Mixed }],
  termination: { type: { _id: false, date: String, reason: String, by: ref('User') } },
  createdBy: ref('User'),
}, { timestamps: true });
contract.index({ organizationId: 1, number: 1 }, { unique: true });
contract.index({ organizationId: 1, employeeId: 1, status: 1 });
contract.index({ organizationId: 1, status: 1, endDate: 1 });

const counter = new Schema({ organizationId: org, key: { type: String, required: true }, seq: { type: Number, default: 0 } });
counter.index({ organizationId: 1, key: 1 }, { unique: true });

export const Branch = model('Branch', branch);
export const Department = model('Department', department);
export const Grade = model('Grade', grade);
export const Position = model('Position', position);
export const Employee = model('Employee', employee);
export const EmployeeEvent = model('EmployeeEvent', employeeEvent);
export const Contract = model('Contract', contract);
export const Counter = model('Counter', counter);
