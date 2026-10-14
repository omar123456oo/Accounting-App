import { TaxApproval } from '../commercial/commercial.models';

/**
 * Contracts of the tax API. Everything rule-like (obligation types, filing calendar rules, rates) is DATA entered
 * and verified by a qualified specialist; nothing here is a legal fact. Amounts are decimal strings.
 */
export type ObligationKind = 'vat' | 'withholding' | 'income_tax' | 'other';
export const OBLIGATION_KINDS: readonly ObligationKind[] = ['vat', 'withholding', 'income_tax', 'other'];
export type Recurrence = 'monthly' | 'quarterly' | 'annual';
export const RECURRENCES: readonly Recurrence[] = ['monthly', 'quarterly', 'annual'];

/** What every rule carries: where it comes from, when it applies and whether anyone qualified has verified it. */
export interface RuleMeta {
  legalSource: string;
  effectiveFrom: string;
  effectiveTo?: string;
  approvalStatus: TaxApproval;
  lastVerifiedAt?: string;
  /** Increases whenever the values or dates change. */
  version: number;
  /** True for the clearly marked demo values the mock ships with. */
  isDemo: boolean;
}

export interface ObligationType {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  kind: ObligationKind;
  isDemo: boolean;
}

export interface CalendarRule extends RuleMeta {
  id: string;
  obligationTypeId: string;
  recurrence: Recurrence;
  /** Days after the end of the period. */
  dueDayOffset: number;
}

export type RuleSetKind = 'income_tax_rate' | 'other';
export interface RuleSet extends RuleMeta {
  id: string;
  code: string;
  name: string;
  kind: RuleSetKind;
  /** Percent, for example "10". Entered by a specialist; never a seeded fact. */
  percent: string;
}

export interface TaxSettings {
  obligationTypes: ObligationType[];
  calendarRules: CalendarRule[];
  ruleSets: RuleSet[];
  /** True while any rule is demo or not professionally verified: the visible warning banner depends on it. */
  unverified: boolean;
}

export interface RuleInput {
  legalSource: string;
  effectiveFrom: string;
  effectiveTo?: string;
  approvalStatus: TaxApproval;
  lastVerifiedAt?: string;
}
export type CalendarRuleInput = RuleInput & { obligationTypeId: string; recurrence: Recurrence; dueDayOffset: number };
export type RuleSetInput = RuleInput & { code: string; name: string; kind: RuleSetKind; percent: string };
export type ObligationTypeInput = Pick<ObligationType, 'code' | 'nameAr' | 'nameEn' | 'kind'>;

export interface ProfileObligation {
  obligationTypeId: string;
  responsibleUserId: string;
  active: boolean;
}
export interface TaxIdentifier {
  label: string;
  value: string;
}
export interface TaxProfile {
  ledgerEntityId: string;
  clientId?: string;
  clientName?: string;
  registrationNo: string;
  regimeLabel: string;
  identifiers: TaxIdentifier[];
  obligations: ProfileObligation[];
  updatedAt?: string;
  updatedBy?: string;
}
export type TaxProfileInput = Pick<TaxProfile, 'registrationNo' | 'regimeLabel' | 'identifiers' | 'obligations'>;

export interface DeadlineReminder {
  at: string;
  actor: string;
  /** Mock only: nothing is sent, the reminder is just logged. */
  delivery: 'logged_only';
  note?: string;
}
export type DeadlineStatus = 'upcoming' | 'due_soon' | 'overdue' | 'done';
export interface Deadline {
  id: string;
  obligationTypeId: string;
  obligationKind: ObligationKind;
  nameAr: string;
  nameEn: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  daysToDue: number;
  status: DeadlineStatus;
  responsibleUserId: string;
  responsibleName: string;
  ruleId: string;
  ruleVersion: number;
  ruleIsDemo: boolean;
  returnId?: string;
  reminders: DeadlineReminder[];
}

export const RETURN_KINDS = ['vat', 'withholding', 'income_tax'] as const;
export type ReturnKind = (typeof RETURN_KINDS)[number];
export const RETURN_STATES = ['prepared', 'reviewed', 'approved', 'ready_for_submission'] as const;
export type ReturnState = (typeof RETURN_STATES)[number];

export type TaxClass = 'taxed' | 'zero_rated' | 'exempt';
export interface VatTransaction {
  source: 'invoice' | 'credit_note' | 'bill' | 'supplier_credit';
  docId: string;
  reference: string;
  date: string;
  partyName: string;
  taxClass: TaxClass;
  taxCode?: string;
  percent?: string;
  net: string;
  tax: string;
  journalId?: string;
}
export interface VatReconciliationRow {
  returnAmount: string;
  ledgerAmount: string;
  difference: string;
  reconciled: boolean;
  /** The tax control account mapping is missing, so there is nothing to compare with. */
  unmapped: boolean;
  accountId?: string;
}
export interface VatCalc {
  kind: 'vat';
  outputNet: string;
  outputTax: string;
  zeroRatedNet: string;
  exemptNet: string;
  creditNoteTax: string;
  inputNet: string;
  inputTax: string;
  supplierCreditTax: string;
  /** Output tax minus input tax; negative means the return shows a refund or a carry-forward. */
  netTax: string;
  transactions: VatTransaction[];
  reconciliation: { output: VatReconciliationRow; input: VatReconciliationRow; reconciled: boolean };
  unverifiedRates: boolean;
  rates: Array<{ code: string; percent: string; version: number; approvalStatus: TaxApproval }>;
}

export type WithholdingDirection = 'deducted_by_us' | 'deducted_by_customer';
export interface WithholdingRecord {
  id: string;
  ledgerEntityId: string;
  date: string;
  direction: WithholdingDirection;
  counterparty: string;
  paymentId?: string;
  paymentNumber?: string;
  baseAmount: string;
  ratePercent: string;
  amount: string;
  certificateNo?: string;
  note?: string;
  createdByName: string;
}
export interface WithholdingInput {
  date: string;
  direction: WithholdingDirection;
  counterparty: string;
  paymentId?: string;
  baseAmount: string;
  ratePercent: string;
  certificateNo?: string;
  note?: string;
}
export interface WithholdingTotals {
  deductedByUs: string;
  deductedByCustomer: string;
  count: number;
}
export interface WithholdingCalc {
  kind: 'withholding';
  records: WithholdingRecord[];
  totals: WithholdingTotals;
}

export interface Adjustment {
  id: string;
  label: string;
  direction: 'add' | 'deduct';
  amount: string;
}
export interface RuleSnapshot {
  ruleId: string;
  code: string;
  percent: string;
  version: number;
  approvalStatus: TaxApproval;
  legalSource: string;
  effectiveFrom: string;
  effectiveTo?: string;
  isDemo: boolean;
}
export interface IncomeTaxCalc {
  kind: 'income_tax';
  profit: string;
  adjustments: Adjustment[];
  adjustmentsAdd: string;
  adjustmentsDeduct: string;
  taxableBase: string;
  rule: RuleSnapshot | null;
  /** Null while no rule applies. */
  taxAmount: string | null;
}
export type ReturnCalc = VatCalc | WithholdingCalc | IncomeTaxCalc;

export interface ReturnEvent {
  action: string;
  actor: string;
  actorId: string;
  at: string;
  outcome?: string;
}
export interface Attachment {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string;
  uploadedBy: string;
  uploadedAt: string;
}

/** An official portal record is only ever set by the ETA adapter from a real response; see mock-eta.ts. */
export interface OfficialRecord {
  status: 'submitted' | 'accepted' | 'rejected';
  reference: string;
  rawResponse: string;
  receivedAt: string;
}
export interface ManualRecord {
  outcome: 'accepted' | 'rejected';
  referenceNo: string;
  evidence: Attachment;
  recordedByName: string;
  recordedBy: string;
  recordedAt: string;
  note?: string;
}
export interface Submission {
  status: 'not_submitted' | 'recorded_manually' | 'submitted' | 'accepted' | 'rejected';
  manual?: ManualRecord;
  official?: OfficialRecord;
}

export interface TaxReturn {
  id: string;
  ledgerEntityId: string;
  kind: ReturnKind;
  periodStart: string;
  periodEnd: string;
  version: number;
  amendsReturnId?: string;
  supersededById?: string;
  state: ReturnState;
  /** True once approved: the calculation below is the frozen snapshot and later changes never touch it. */
  locked: boolean;
  preparedBy: string;
  preparedByName: string;
  reviewedByName?: string;
  approvedByName?: string;
  calc: ReturnCalc;
  attachments: Attachment[];
  submission: Submission;
  /** Why submission is disabled: the ETA adapter is the null client. */
  submitBlocked: 'etaNotConfigured' | null;
  history: ReturnEvent[];
}

export interface ReturnListParams {
  kind?: string;
  state?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateReturnInput {
  kind: ReturnKind;
  periodStart: string;
  periodEnd: string;
}

export interface RecordOutcomeInput {
  outcome: 'accepted' | 'rejected';
  referenceNo: string;
  recordedByName: string;
  note?: string;
  evidence: File;
}

export interface ComplianceSummary {
  deadlines7: number;
  deadlines30: number;
  overdue: number;
  returnsAwaitingReview: number;
  periodsReadyToClose: number;
  ledgers: Array<{ ledgerEntityId: string; name: string; type: 'firm' | 'client'; deadlines7: number; deadlines30: number; overdue: number; returnsAwaitingReview: number; periodsReadyToClose: number }>;
}
