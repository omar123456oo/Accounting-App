export const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'checkbox', 'currency', 'reference'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const FIELD_ROLES = ['title', 'number', 'person', 'identification', 'issue_date', 'expiry_date', 'start_date', 'end_date', 'renewal_date', 'amount', 'issuer'] as const;
export type FieldRole = (typeof FIELD_ROLES)[number];

export const DOC_STATUSES = ['uploaded', 'processing', 'extraction_failed', 'pending_review', 'approved', 'active', 'expiring_soon', 'expired', 'renewal_in_progress', 'renewed', 'archived'] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];
export type ExtractionStatus = 'none' | 'queued' | 'running' | 'succeeded' | 'text_only' | 'needs_ocr' | 'failed';
export type ReminderStatus = 'none' | 'scheduled' | 'partially_sent' | 'completed' | 'cancelled';
export const UNITS = ['minutes', 'hours', 'days', 'weeks', 'months'] as const;
export type Unit = (typeof UNITS)[number];

export interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number } }

export interface DocField {
  key: string; label: string; labelAr: string | null; type: FieldType; required: boolean; active: boolean; order: number;
  options: string[]; sensitive: boolean; role: FieldRole | null; referenceKind: 'employee' | 'department' | 'user' | null; aiHint: string | null; format: 'national_id' | null;
}
export interface DocTypeDef {
  key: string; label: string; labelAr: string | null; category: string; keywords: string[]; expiringSoonDays: number; active: boolean; builtin: boolean; fields: DocField[];
}

export interface Money { amount: number; currency: string | null }
export type FieldValue = string | number | boolean | Money | null;

export interface SmartDoc {
  id: string; title: string; number: string | null; typeKey: string; typeLabel?: string; typeChosen: boolean; status: DocStatus; extractionStatus: ExtractionStatus; reminderStatus: ReminderStatus;
  visibility: 'office' | 'restricted'; ownerId: string | null; ownerName?: string | null; employeeId: string | null; departmentId: string | null; reviewerId: string | null;
  related: { kind: string; id: string } | null; values: Record<string, FieldValue>;
  expiryDate: string | null; startDate: string | null; endDate: string | null; renewalDate: string | null; currentVersion: number; approvedAt: string | null; createdAt: string; updatedAt: string;
}

export interface ListParams {
  page?: number; pageSize?: number; q?: string; status?: DocStatus | ''; typeKey?: string; ownerId?: string; departmentId?: string; employeeId?: string; reviewerId?: string;
  expiryFrom?: string; expiryTo?: string; createdFrom?: string; createdTo?: string; expiring?: boolean; sort?: string; dir?: 'asc' | 'desc';
}

export interface UploadInput {
  file: File; title?: string; typeKey?: string; ownerId?: string; employeeId?: string; departmentId?: string; reviewerId?: string; visibility?: 'office' | 'restricted'; allowDuplicate?: boolean;
}
export interface UploadProgress { kind: 'progress'; percent: number }
export interface UploadDone { kind: 'done'; doc: SmartDoc }

export interface ExtractedField {
  key: string; state: 'extracted' | 'not_found' | 'invalid'; rawValue?: unknown; normalizedValue?: FieldValue; confidence?: number; page?: number; sourceText?: string;
  bbox?: { x: number; y: number; width: number; height: number }; issues: string[]; masked?: boolean;
}
export interface ExtractionStep { name: string; status: 'ok' | 'skipped' | 'failed'; detail?: string; at: string; ms: number }
export interface ReviewDecision { decision: 'accepted' | 'rejected' | 'edited'; value?: FieldValue }
export interface Extraction {
  id: string; status: ExtractionStatus; versionNumber: number; provider: { text: string; ocr: string; ai: string; model: string }; steps: ExtractionStep[]; notes: string[]; error: string | null;
  detectedType: { key: string | null; confidence: number; method: 'user' | 'ai' | 'keywords' | 'none' }; pages: Array<{ page: number; method: 'embedded' | 'ocr' | 'none'; chars: number }>;
  createdAt: string; fields: ExtractedField[]; draft: Record<string, ReviewDecision>; draftSavedAt: string | null; approvedAt: string | null;
}

export interface VersionRow { version: number; fileName: string; sizeBytes: number; sha256: string; pageCount: number | null; uploadedBy: { id: string; name: string | null } | null; uploadedAt: string; reason: string | null; current: boolean }
export interface HistoryEvent { action: string; at: string; actor: string | null; before: unknown; after: unknown }
export interface History { events: HistoryEvent[]; extractions: Array<{ id: string; status: ExtractionStatus; version: number; provider: Extraction['provider']; steps: ExtractionStep[]; notes: string[]; error: string | null; at: string }> }

export interface Offset { amount: number; unit: Unit; direction: 'before' | 'after' }
export interface ReminderRule {
  id: string; scope: 'global' | 'type' | 'document'; typeKey: string | null; documentId: string | null; mode: 'add' | 'override'; name: string; description: string | null; dateField: string;
  offsets: Offset[]; recurring: { every: number; unit: Unit; max: number | null } | null; time: string; timezone: string;
  recipients: { users: string[]; roles: string[]; owner: boolean; manager: boolean }; channels: { inApp: boolean; email: boolean };
  escalation: { afterHours: number; users: string[]; roles: string[]; manager: boolean } | null; subject: string | null; message: string | null; active: boolean; updatedAt: string;
}
export type ReminderRuleInput = Omit<ReminderRule, 'id' | 'updatedAt' | 'description' | 'subject' | 'message' | 'typeKey' | 'documentId'> & { description?: string | null; subject?: string | null; message?: string | null; typeKey?: string | null; documentId?: string | null };

export interface ReminderJob {
  id: string; documentId: string; documentTitle: string; ruleId: string; kind: 'reminder' | 'escalation'; label: string | null; targetDate: string; dueAt: string;
  status: 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled' | 'skipped'; attempts: number; lastError: string | null; reason: string | null; sentAt: string | null; acknowledgedAt: string | null;
}
export interface Delivery {
  id: string; documentId: string | null; documentTitle: string; userId: string; userName: string; channel: 'in_app' | 'email'; status: 'submitted' | 'failed' | 'skipped';
  subject: string | null; to: string | null; error: string | null; attempts: number; at: string;
}

export interface Dashboard {
  totals: { total: number; awaitingReview: number; processing: number; expiringSoon: number; expired: number; failedExtraction: number; upcomingReminders: number; failedReminders: number };
  upcomingExpiries: Array<{ id: string; title: string; expiryDate: string; status: DocStatus; typeKey: string; daysLeft: number }>;
  recentActivity: Array<{ documentId: string; title: string; action: string; at: string; actor: string | null }>;
  today: string; reminderDays: number;
}
export interface DashboardParams { typeKey?: string; status?: DocStatus | ''; ownerId?: string; departmentId?: string; reviewerId?: string; from?: string; to?: string; reminderDays?: number }

export interface SmartConfig {
  ai: { provider: string; model: string | null; configured: boolean }; ocr: { provider: string; configured: boolean }; mail: { configured: boolean; host: string | null };
  scheduler: { inProcess: boolean; tickSeconds: number }; storage: { kind: string }; limits: { maxUploadMb: number; maxPages: number }; timezone: string; aiRedactsSensitive: boolean;
}
export interface Lookups { users: Array<{ id: string; name: string }>; departments: Array<{ id: string; name: string; code?: string }>; employees: Array<{ id: string; name: string; code: string | null }>; roles: string[] }

export type DocPatch = Partial<Pick<SmartDoc, 'title' | 'ownerId' | 'reviewerId' | 'employeeId' | 'departmentId' | 'visibility'>> & { values?: Record<string, FieldValue> };
