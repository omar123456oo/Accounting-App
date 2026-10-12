/**
 * Contracts of the commercial API (receivables, payables, expenses). Amounts are decimal strings with at most
 * four decimal places; percentages are decimal strings ("14" is fourteen percent); dates are YYYY-MM-DD.
 */

export type Side = 'ar' | 'ap';
export type Recognition = 'on_issue' | 'deferred_over_period';
export const RECOGNITIONS: readonly Recognition[] = ['on_issue', 'deferred_over_period'];

export type TaxApproval = 'draft' | 'professionally_verified' | 'retired';
export const TAX_APPROVALS: readonly TaxApproval[] = ['draft', 'professionally_verified', 'retired'];

export interface TaxRateVersion {
  version: number;
  rate: string;
  effectiveFrom: string;
  effectiveTo?: string;
  approvalStatus: TaxApproval;
  changedAt: string;
  changedBy: string;
}

export interface TaxRate {
  id: string;
  code: string;
  name: string;
  /** Percent, for example "14". Never a hardcoded legal fact: specialists enter and verify the real values. */
  rate: string;
  effectiveFrom: string;
  effectiveTo?: string;
  jurisdiction: 'EG';
  legalSource: string;
  approvalStatus: TaxApproval;
  lastVerifiedAt?: string;
  /** Increases whenever the rate or its effective dates change. */
  version: number;
  history: TaxRateVersion[];
  /** True for the clearly marked DEMO values the mock ships with. */
  isDemo: boolean;
}

export interface TaxRateInput {
  code: string;
  name: string;
  rate: string;
  effectiveFrom: string;
  effectiveTo?: string;
  legalSource: string;
  approvalStatus: TaxApproval;
  lastVerifiedAt?: string;
}

/** What a document keeps of the rate it used, so later edits to the rate never change it. */
export interface TaxSnapshot {
  rateId: string;
  code: string;
  percent: string;
  version: number;
  approvalStatus: TaxApproval;
}

export interface ServiceType {
  id: string;
  ledgerEntityId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  recognition: Recognition;
  /** A reimbursement type is what re-billed client expenses are invoiced under. */
  kind: 'standard' | 'reimbursement';
}
export type ServiceTypeInput = Pick<ServiceType, 'code' | 'nameAr' | 'nameEn' | 'recognition' | 'kind'>;

export interface ExpenseCategory {
  id: string;
  ledgerEntityId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  /** Monthly budget, or absent when the category is not budgeted. */
  monthlyBudget?: string;
}
export type ExpenseCategoryInput = Pick<ExpenseCategory, 'code' | 'nameAr' | 'nameEn'> & { monthlyBudget?: string };

export const MAPPING_KEYS = ['arControl', 'apControl', 'vatOutput', 'vatInput', 'deferredRevenue', 'customerCredit', 'supplierPrepayment', 'receivableFromClient', 'employeePayable'] as const;
export type MappingKey = (typeof MAPPING_KEYS)[number];

/** Which ledger accounts commercial documents post to. Configurable per ledger; nothing is hardcoded. */
export interface AccountMappings {
  ledgerEntityId: string;
  arControl?: string;
  apControl?: string;
  vatOutput?: string;
  vatInput?: string;
  deferredRevenue?: string;
  customerCredit?: string;
  supplierPrepayment?: string;
  receivableFromClient?: string;
  employeePayable?: string;
  revenueByService: Record<string, string>;
  expenseByCategory: Record<string, string>;
  /** Bank and cash accounts a payment may be received into or paid from. */
  paymentAccounts: string[];
}
export type MappingsInput = Partial<Omit<AccountMappings, 'ledgerEntityId'>>;

export interface CommercialSettings {
  ledgerEntityId: string;
  /** Allow issuing documents with tax rates that are still in draft (not professionally verified). */
  allowDraftRates: boolean;
  /** The server's business date (YYYY-MM-DD): the default date of new documents and the reference of "overdue". */
  today: string;
}

export interface Party {
  id: string;
  ledgerEntityId: string;
  kind: 'customer' | 'supplier';
  name: string;
  email?: string;
  phone?: string;
  taxRegistrationNo?: string;
  /** A customer of the firm ledger may be one of the firm's clients. */
  clientId?: string;
  clientName?: string;
  paymentTermsDays: number;
  archived: boolean;
  /** Customer credit (unapplied receipts) or supplier prepayment, not yet allocated. */
  creditBalance: string;
  /** Open receivable (customer) or payable (supplier). */
  openBalance: string;
}
export type PartyInput = Partial<Pick<Party, 'name' | 'email' | 'phone' | 'taxRegistrationNo' | 'clientId' | 'paymentTermsDays' | 'archived'>>;

export const INVOICE_STATUSES = ['draft', 'pending_approval', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled', 'credited'] as const;
export const BILL_STATUSES = ['draft', 'pending_approval', 'approved', 'partially_paid', 'paid', 'overdue', 'cancelled', 'credited'] as const;
export type DocStatus = (typeof INVOICE_STATUSES)[number] | (typeof BILL_STATUSES)[number];

export type TermsKind = 'net15' | 'net30' | 'net60' | 'custom';
export const TERMS_KINDS: readonly TermsKind[] = ['net15', 'net30', 'net60', 'custom'];
export const TERMS_DAYS: Record<Exclude<TermsKind, 'custom'>, number> = { net15: 15, net30: 30, net60: 60 };

export interface DocLineInput {
  description: string;
  serviceTypeId?: string;
  categoryId?: string;
  qty: string;
  unitPrice: string;
  /** Percent of the gross line amount. */
  discount: string;
  taxRateId?: string;
}

export interface DocLine extends DocLineInput {
  tax?: TaxSnapshot;
  gross: string;
  discountAmount: string;
  net: string;
  taxAmount: string;
  total: string;
  recognition?: Recognition;
  /** Deferred revenue not yet recognized. */
  deferredRemaining?: string;
  /** Running totals of credit notes applied to this line (gross and its tax part). */
  creditedTotal?: string;
  creditedTax?: string;
}

export interface DocEvent {
  action: string;
  actor: string;
  actorId: string;
  at: string;
  outcome?: string;
}

export interface LinkedJournal {
  journalId: string;
  number?: string;
  kind: string;
  date: string;
}

export interface Reminder {
  at: string;
  actor: string;
  /** Mock only: the reminder is recorded in the history, nothing is sent. */
  delivery: 'logged_only';
  note?: string;
}

export interface RecognitionRow {
  n: number;
  date: string;
  amount: string;
  status: 'recognized' | 'pending';
  journalId?: string;
}

export interface DocBase {
  id: string;
  ledgerEntityId: string;
  /** Assigned only when the document is issued or approved; gapless per ledger, year and type. */
  number?: string;
  /** The number once assigned, otherwise the DRAFT-... reference. */
  reference: string;
  partyId: string;
  partyName: string;
  date: string;
  dueDate: string;
  termsKind: TermsKind;
  termsDays: number;
  status: DocStatus;
  lines: DocLine[];
  net: string;
  taxTotal: string;
  total: string;
  paid: string;
  credited: string;
  /** What is still open: total - paid - credited, for an issued document. */
  balance: string;
  currency: 'EGP';
  /** True when a line uses a tax rate that is not professionally verified. */
  usesUnverifiedRate: boolean;
  /** True when the total reaches the approval threshold. */
  requiresApproval: boolean;
  journals: LinkedJournal[];
  notes?: string;
  createdBy: string;
  createdByName: string;
  approvedBy?: string;
  history: DocEvent[];
}

export interface Invoice extends DocBase {
  servicePeriodStart?: string;
  servicePeriodMonths?: number;
  schedule: RecognitionRow[];
  reminders: Reminder[];
  sourceQuotationId?: string;
  sourceBillId?: string;
}

export type Bearer = 'firm' | 'client_reimbursable';

export interface Bill extends DocBase {
  supplierInvoiceNo?: string;
  bearer: Bearer;
  clientId?: string;
  clientName?: string;
  rebilledInvoiceId?: string;
}

export interface InvoiceInput {
  partyId: string;
  date: string;
  termsKind: TermsKind;
  termsDays?: number;
  lines: DocLineInput[];
  notes?: string;
  servicePeriodStart?: string;
  servicePeriodMonths?: number;
}

export interface BillInput {
  partyId: string;
  date: string;
  termsKind: TermsKind;
  termsDays?: number;
  lines: DocLineInput[];
  notes?: string;
  supplierInvoiceNo?: string;
  bearer: Bearer;
  clientId?: string;
}

export interface DocListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  partyId?: string;
  q?: string;
}

export const QUOTATION_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'converted'] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export interface Quotation {
  id: string;
  ledgerEntityId: string;
  number?: string;
  reference: string;
  partyId: string;
  partyName: string;
  date: string;
  validUntil: string;
  status: QuotationStatus;
  lines: DocLine[];
  net: string;
  taxTotal: string;
  total: string;
  usesUnverifiedRate: boolean;
  convertedInvoiceId?: string;
  notes?: string;
  createdByName: string;
}
export interface QuotationInput {
  partyId: string;
  date: string;
  validUntil: string;
  lines: DocLineInput[];
  notes?: string;
}

export interface CreditBreakdown {
  description: string;
  net: string;
  tax: string;
}

export interface CreditNote {
  id: string;
  ledgerEntityId: string;
  side: Side;
  number: string;
  docId: string;
  docReference: string;
  partyId: string;
  partyName: string;
  date: string;
  reason: string;
  amount: string;
  lines: CreditBreakdown[];
  journalId: string;
  createdByName: string;
}
export interface CreditNoteInput {
  docId: string;
  date: string;
  reason: string;
  amount: string;
}

export interface Allocation {
  docId: string;
  docReference: string;
  amount: string;
  date: string;
  journalId: string;
}

export interface PaymentEvent {
  type: 'refund';
  amount: string;
  date: string;
  journalId: string;
  accountId: string;
}

export interface Payment {
  id: string;
  ledgerEntityId: string;
  side: Side;
  /** Receipt number (customers) or payment voucher number (suppliers), gapless per ledger and year. */
  number: string;
  partyId: string;
  partyName: string;
  date: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  amount: string;
  reference?: string;
  allocations: Allocation[];
  refunds: PaymentEvent[];
  /** Not allocated to any document: a customer credit or a supplier prepayment. */
  unapplied: string;
  journalId: string;
  createdByName: string;
}
export interface AllocationInput {
  docId: string;
  amount: string;
}
export interface PaymentInput {
  partyId: string;
  date: string;
  accountId: string;
  amount: string;
  reference?: string;
  allocations: AllocationInput[];
}

export interface RecurringDoc {
  id: string;
  ledgerEntityId: string;
  side: Side;
  name: string;
  partyId: string;
  partyName: string;
  termsKind: TermsKind;
  termsDays: number;
  lines: DocLineInput[];
  bearer?: Bearer;
}

export const CLAIM_STATUSES = ['submitted', 'approved', 'rejected', 'paid'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** Only a reference to the uploaded receipt is kept; the file itself belongs to the documents module. */
export interface ReceiptRef {
  name: string;
  size: number;
  type: string;
}

export interface ExpenseClaim {
  id: string;
  ledgerEntityId: string;
  reference: string;
  claimantId: string;
  claimantName: string;
  date: string;
  description: string;
  categoryId: string;
  amount: string;
  bearer: Bearer;
  clientId?: string;
  receipt: ReceiptRef;
  status: ClaimStatus;
  decidedBy?: string;
  decisionNote?: string;
  journals: LinkedJournal[];
  history: DocEvent[];
}
export interface ClaimInput {
  date: string;
  description: string;
  categoryId: string;
  amount: string;
  bearer: Bearer;
  clientId?: string;
  receipt: ReceiptRef;
}

export interface AgingBuckets {
  current: string;
  d1_30: string;
  d31_60: string;
  d61_90: string;
  d90_plus: string;
  total: string;
}
export const AGING_BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export interface AgingItem {
  docId: string;
  reference: string;
  date: string;
  dueDate: string;
  daysPastDue: number;
  bucket: AgingBucket;
  balance: string;
}
export interface AgingRow extends AgingBuckets {
  partyId: string;
  partyName: string;
  items: AgingItem[];
}
export interface AgingReport {
  side: Side;
  asOf: string;
  rows: AgingRow[];
  totals: AgingBuckets;
}

export interface StatementLine {
  date: string;
  kind: 'invoice' | 'bill' | 'payment' | 'credit_note' | 'refund';
  reference: string;
  description: string;
  debit: string;
  credit: string;
  balance: string;
}
export interface Statement {
  side: Side;
  party: { id: string; name: string; taxRegistrationNo?: string };
  from: string;
  to: string;
  openingBalance: string;
  lines: StatementLine[];
  closingBalance: string;
  /** Part of the closing balance that is an unapplied credit or prepayment. */
  unapplied: string;
}

export type RevenueBy = 'client' | 'service' | 'month';
export interface RevenueRow {
  key: string;
  label: string;
  labelAr?: string;
  amount: string;
}
export interface RevenueReport {
  by: RevenueBy;
  from: string;
  to: string;
  rows: RevenueRow[];
  total: string;
}

export interface ReconciliationRow {
  key: 'ar' | 'ap' | 'customerCredit' | 'supplierPrepayment' | 'deferredRevenue';
  mapping: MappingKey;
  accountId?: string;
  accountCode?: string;
  /** Sum of the open documents. */
  subledger: string;
  /** Balance of the mapped control account, shown on its normal side. */
  control: string;
  difference: string;
  reconciled: boolean;
  /** The mapping is not configured, so there is no control account to compare with. */
  unmapped: boolean;
}
export interface ReconciliationReport {
  asOf: string;
  rows: ReconciliationRow[];
  reconciled: boolean;
}

export interface BudgetRow {
  categoryId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  budget?: string;
  actual: string;
  remaining?: string;
  over: boolean;
}
export interface BudgetReport {
  month: string;
  rows: BudgetRow[];
}

export interface ScheduleItem {
  docId: string;
  reference: string;
  supplierId: string;
  partyName: string;
  dueDate: string;
  balance: string;
  bucket: 'overdue' | 'this_week' | 'later';
}

export interface CommercialSummary {
  ledgers: Array<{
    ledgerEntityId: string;
    type: 'firm' | 'client';
    name: string;
    outstandingReceivables?: string;
    overdueInvoices?: number;
    billsDueSoon?: number;
    billsDueSoonAmount?: string;
  }>;
  overdueInvoices?: number;
  billsDueSoon?: number;
}
