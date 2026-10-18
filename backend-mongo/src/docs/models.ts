import { Schema, model } from 'mongoose';

const org = { type: Schema.Types.ObjectId, ref: 'Organization', required: true };
const ref = (to: string) => ({ type: Schema.Types.ObjectId, ref: to });

export const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'checkbox', 'currency', 'reference'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
/** What a field means to the system. Reminders and the lifecycle read dates through these roles, not through field names. */
export const FIELD_ROLES = ['title', 'number', 'person', 'identification', 'issue_date', 'expiry_date', 'start_date', 'end_date', 'renewal_date', 'amount', 'issuer'] as const;
export type FieldRole = (typeof FIELD_ROLES)[number];

export const DOC_STATUSES = ['uploaded', 'processing', 'extraction_failed', 'pending_review', 'approved', 'active', 'expiring_soon', 'expired', 'renewal_in_progress', 'renewed', 'archived'] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];
export const EXTRACTION_STATUSES = ['none', 'queued', 'running', 'succeeded', 'text_only', 'needs_ocr', 'failed'] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];
export const REMINDER_STATUSES = ['none', 'scheduled', 'partially_sent', 'completed', 'cancelled'] as const;

export interface DocFieldDef {
  key: string; label: string; labelAr?: string; type: FieldType; required: boolean; active: boolean; order: number;
  options: string[]; sensitive: boolean; role?: FieldRole; referenceKind?: 'employee' | 'department' | 'user'; aiHint?: string; format?: 'national_id';
}
const fieldDef = new Schema({
  key: { type: String, required: true }, label: { type: String, required: true }, labelAr: String,
  type: { type: String, enum: FIELD_TYPES, required: true }, required: { type: Boolean, default: false }, active: { type: Boolean, default: true },
  order: { type: Number, default: 0 }, options: { type: [String], default: [] }, sensitive: { type: Boolean, default: false },
  role: { type: String, enum: FIELD_ROLES }, referenceKind: { type: String, enum: ['employee', 'department', 'user'] }, aiHint: String, format: { type: String, enum: ['national_id'] },
}, { _id: false });

const docType = new Schema({
  organizationId: org, key: { type: String, required: true }, label: { type: String, required: true }, labelAr: String, category: { type: String, default: 'other' },
  fields: [fieldDef], keywords: { type: [String], default: [] },
  /** Days before the expiry date at which a document counts as "expiring soon". */
  expiringSoonDays: { type: Number, default: 30 },
  active: { type: Boolean, default: true }, builtin: { type: Boolean, default: false },
}, { timestamps: true });
docType.index({ organizationId: 1, key: 1 }, { unique: true });

const document = new Schema({
  organizationId: org, typeKey: { type: String, required: true }, typeChosen: { type: Boolean, default: false }, title: { type: String, required: true }, number: String,
  status: { type: String, enum: DOC_STATUSES, default: 'uploaded' },
  extractionStatus: { type: String, enum: EXTRACTION_STATUSES, default: 'none' },
  reminderStatus: { type: String, enum: REMINDER_STATUSES, default: 'none' },
  /** 'restricted': only the creator, owner, reviewer and people who manage documents can open it. */
  visibility: { type: String, enum: ['office', 'restricted'], default: 'office' },
  ownerId: ref('User'), employeeId: ref('Employee'), departmentId: ref('Department'), reviewerId: ref('User'),
  related: { kind: String, id: String },
  /** Approved values by field key. Only a person writes here (approve or edit); extraction never does. */
  values: { type: Schema.Types.Mixed, default: {} },
  /** Dates lifted out of `values` through field roles, for querying. YYYY-MM-DD. */
  expiryDate: String, startDate: String, endDate: String, renewalDate: String,
  currentVersion: { type: Number, default: 1 }, contentHash: { type: String, required: true },
  approvedAt: Date, approvedBy: ref('User'), renewalStartedAt: Date, archivedAt: Date, deletedAt: Date,
  createdBy: ref('User'),
}, { timestamps: true });
document.index({ organizationId: 1, status: 1, createdAt: -1 });
document.index({ organizationId: 1, deletedAt: 1, typeKey: 1 });
document.index({ organizationId: 1, expiryDate: 1 });
document.index({ organizationId: 1, contentHash: 1 });
document.index({ organizationId: 1, employeeId: 1 });
document.index({ organizationId: 1, departmentId: 1 });
document.index({ organizationId: 1, ownerId: 1 });
document.index({ organizationId: 1, title: 'text', number: 'text' });

const version = new Schema({
  organizationId: org, documentId: { ...ref('DocDocument'), required: true }, version: { type: Number, required: true },
  storageKey: { type: String, required: true }, fileName: { type: String, required: true }, mimeType: { type: String, default: 'application/pdf' },
  sizeBytes: { type: Number, required: true }, sha256: { type: String, required: true }, pageCount: Number,
  uploadedBy: ref('User'), reason: String,
}, { timestamps: { createdAt: true, updatedAt: false } });
version.index({ organizationId: 1, documentId: 1, version: 1 }, { unique: true });

const step = new Schema({ name: String, status: { type: String, enum: ['ok', 'skipped', 'failed'] }, detail: String, at: Date, ms: Number }, { _id: false });
const page = new Schema({ page: Number, text: String, method: { type: String, enum: ['embedded', 'ocr', 'none'] }, chars: Number }, { _id: false });
const extField = new Schema({
  key: { type: String, required: true },
  state: { type: String, enum: ['extracted', 'not_found', 'invalid'], required: true },
  rawValue: Schema.Types.Mixed, normalizedValue: Schema.Types.Mixed, confidence: Number,
  page: Number, sourceText: String, bbox: { x: Number, y: Number, width: Number, height: Number },
  issues: { type: [String], default: [] },
}, { _id: false });
const extraction = new Schema({
  organizationId: org, documentId: { ...ref('DocDocument'), required: true }, versionId: ref('DocVersion'), versionNumber: Number,
  status: { type: String, enum: EXTRACTION_STATUSES, default: 'queued' },
  provider: { text: String, ocr: String, ai: String, model: String },
  steps: [step], pages: [page],
  detectedType: { key: String, confidence: Number, method: { type: String, enum: ['user', 'ai', 'keywords', 'none'] } },
  fields: [extField], notes: { type: [String], default: [] }, error: String,
  /** The reviewer's work in progress: { [fieldKey]: { decision, value } }. Resumed until approval; never copied to the document by itself. */
  draft: { type: Schema.Types.Mixed, default: {} }, draftSavedAt: Date, draftBy: ref('User'),
  /** Person's corrections at approval: what the AI proposed and what was approved. */
  corrections: [new Schema({ key: String, proposed: Schema.Types.Mixed, approved: Schema.Types.Mixed, by: ref('User'), at: Date }, { _id: false })],
  approvedAt: Date,
}, { timestamps: true });
extraction.index({ organizationId: 1, documentId: 1, createdAt: -1 });

const job = new Schema({
  organizationId: org, kind: { type: String, enum: ['extract'], default: 'extract' }, documentId: ref('DocDocument'), versionId: ref('DocVersion'),
  status: { type: String, enum: ['queued', 'running', 'succeeded', 'failed'], default: 'queued' },
  attempts: { type: Number, default: 0 }, maxAttempts: { type: Number, default: 3 }, runAfter: { type: Date, default: Date.now },
  lockedUntil: Date, lastError: String, finishedAt: Date,
}, { timestamps: true });
job.index({ status: 1, runAfter: 1 });
job.index({ organizationId: 1, documentId: 1 });

export const UNITS = ['minutes', 'hours', 'days', 'weeks', 'months'] as const;
export type Unit = (typeof UNITS)[number];
const offset = new Schema({ amount: { type: Number, required: true }, unit: { type: String, enum: UNITS, required: true }, direction: { type: String, enum: ['before', 'after'], default: 'before' } }, { _id: false });
const recipients = new Schema({ users: [String], roles: [String], owner: { type: Boolean, default: false }, manager: { type: Boolean, default: false } }, { _id: false });
const reminderRule = new Schema({
  organizationId: org, scope: { type: String, enum: ['global', 'type', 'document'], required: true }, typeKey: String, documentId: ref('DocDocument'),
  /** 'override' replaces the rules of wider scopes for the documents it covers. */
  mode: { type: String, enum: ['add', 'override'], default: 'add' },
  name: { type: String, required: true }, description: String,
  /** A field key (or a field role) holding the target date. */
  dateField: { type: String, required: true },
  offsets: { type: [offset], default: [] },
  recurring: { every: Number, unit: { type: String, enum: UNITS }, max: Number },
  time: { type: String, default: '09:00' }, timezone: { type: String, default: 'Africa/Cairo' },
  recipients: { type: recipients, default: () => ({}) },
  channels: { inApp: { type: Boolean, default: true }, email: { type: Boolean, default: false } },
  escalation: { afterHours: Number, users: [String], roles: [String], manager: { type: Boolean, default: false } },
  subject: String, message: String,
  active: { type: Boolean, default: true }, createdBy: ref('User'),
}, { timestamps: true });
reminderRule.index({ organizationId: 1, scope: 1, typeKey: 1 });
reminderRule.index({ organizationId: 1, documentId: 1 });

const reminderJob = new Schema({
  organizationId: org, documentId: { ...ref('DocDocument'), required: true }, ruleId: { ...ref('DocReminderRule'), required: true },
  kind: { type: String, enum: ['reminder', 'escalation'], default: 'reminder' },
  targetDate: { type: String, required: true }, label: String, dueAt: { type: Date, required: true },
  status: { type: String, enum: ['scheduled', 'processing', 'sent', 'failed', 'cancelled', 'skipped'], default: 'scheduled' },
  attempts: { type: Number, default: 0 }, maxAttempts: { type: Number, default: 5 }, lockedUntil: Date, lastError: String, reason: String,
  sentAt: Date, acknowledgedAt: Date, acknowledgedBy: ref('User'), parentJobId: ref('DocReminderJob'),
  idempotencyKey: { type: String, required: true },
}, { timestamps: true });
reminderJob.index({ idempotencyKey: 1 }, { unique: true });
reminderJob.index({ status: 1, dueAt: 1 });
reminderJob.index({ organizationId: 1, documentId: 1, status: 1 });
reminderJob.index({ organizationId: 1, status: 1, dueAt: 1 });

const delivery = new Schema({
  organizationId: org, jobId: ref('DocReminderJob'), documentId: ref('DocDocument'), userId: { ...ref('User'), required: true },
  channel: { type: String, enum: ['in_app', 'email'], required: true },
  /** `submitted` means the mail server accepted the message. It is not proof of inbox delivery. */
  status: { type: String, enum: ['submitted', 'failed', 'skipped'], required: true },
  providerMessageId: String, to: String, subject: String, error: String, attempts: { type: Number, default: 1 },
  idempotencyKey: { type: String, required: true },
}, { timestamps: true });
delivery.index({ idempotencyKey: 1 }, { unique: true });
delivery.index({ organizationId: 1, createdAt: -1 });
delivery.index({ organizationId: 1, userId: 1, createdAt: -1 });

export const SmartDocType = model('SmartDocType', docType);
export const DocDocument = model('DocDocument', document);
export const DocVersion = model('DocVersion', version);
export const DocExtraction = model('DocExtraction', extraction);
export const DocJob = model('DocJob', job);
export const DocReminderRule = model('DocReminderRule', reminderRule);
export const DocReminderJob = model('DocReminderJob', reminderJob);
export const DocDelivery = model('DocDelivery', delivery);
