/** Contracts of the ledger API. Every amount is a decimal string (up to four decimal places); dates are YYYY-MM-DD. */

export interface LedgerEntity {
  id: string;
  type: 'firm' | 'client';
  clientId?: string;
  name: string;
  functionalCurrency: 'EGP';
}

export const ACCOUNT_CATEGORIES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;
export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];
export type NormalBalance = 'debit' | 'credit';

export interface Account {
  id: string;
  ledgerEntityId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  category: AccountCategory;
  parentId?: string;
  isPostable: boolean;
  isActive: boolean;
  normalBalance: NormalBalance;
  /** True once a posted journal line uses the account (the server then refuses structural changes). */
  hasPostings: boolean;
}

export type AccountInput = Partial<Omit<Account, 'id' | 'ledgerEntityId' | 'hasPostings'>>;

export type PeriodStatus = 'open' | 'closed' | 'locked';

export interface PeriodEvent {
  actor: string;
  action: 'created' | 'closed' | 'locked' | 'reopened';
  at: string;
  reason?: string;
}

export interface AccountingPeriod {
  id: string;
  ledgerEntityId: string;
  fiscalYearId: string;
  number: number;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  history: PeriodEvent[];
}

export interface FiscalYear {
  id: string;
  ledgerEntityId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'closed';
}

export const JOURNAL_STATUSES = ['draft', 'pending_approval', 'approved', 'posted', 'reversed'] as const;
export type JournalStatus = (typeof JOURNAL_STATUSES)[number];
export type JournalType = 'standard' | 'opening';

export interface JournalLine {
  accountId: string;
  debit: string;
  credit: string;
  description?: string;
  costCenter?: string;
  project?: string;
  branch?: string;
  accountCode?: string;
  accountNameAr?: string;
  accountNameEn?: string;
}

export interface JournalEvent {
  actor: string;
  actorId: string;
  action: 'created' | 'updated' | 'submitted' | 'approved' | 'rejected' | 'posted' | 'reversed' | 'reversal_created' | 'created_from_template';
  at: string;
  /** Reason or comment, or the outcome (for example the assigned number). */
  outcome?: string;
}

export interface JournalEntry {
  id: string;
  ledgerEntityId: string;
  /** Assigned only at posting; gapless per ledger and fiscal year. */
  number?: string;
  /** The number once posted, otherwise the DRAFT-… reference. */
  reference: string;
  entryType: JournalType;
  postingDate: string;
  description: string;
  status: JournalStatus;
  lines: JournalLine[];
  totalDebit: string;
  sourceType?: string;
  sourceId?: string;
  createdBy: string;
  createdByName: string;
  approvedBy?: string;
  postedBy?: string;
  reversalOfId?: string;
  reversedById?: string;
  history: JournalEvent[];
}

export interface JournalInput {
  entryType: JournalType;
  postingDate: string;
  description: string;
  lines: Array<Pick<JournalLine, 'accountId' | 'debit' | 'credit'> & Partial<JournalLine>>;
}

export interface JournalListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  from?: string;
  to?: string;
  accountId?: string;
  q?: string;
}

export interface RecurringTemplate {
  id: string;
  ledgerEntityId: string;
  name: string;
  description: string;
  lines: JournalLine[];
}

export interface ReportBase {
  /** True when drafts, pending and approved entries were requested: the numbers are a preview. */
  includesUnposted: boolean;
}

export interface GlRow {
  date: string;
  journalId: string;
  reference: string;
  description: string;
  status: JournalStatus;
  debit: string;
  credit: string;
  /** Running balance, debit positive. */
  balance: string;
}

export interface GeneralLedgerReport extends ReportBase {
  account: Pick<Account, 'id' | 'code' | 'nameAr' | 'nameEn' | 'normalBalance'>;
  openingBalance: string;
  rows: GlRow[];
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
}

export interface TbRow {
  accountId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  /** Balance before the range, debit positive. */
  opening: string;
  debit: string;
  credit: string;
  closingDebit: string;
  closingCredit: string;
}

export interface TrialBalanceReport extends ReportBase {
  rows: TbRow[];
  totals: { debit: string; credit: string; closingDebit: string; closingCredit: string };
  balanced: boolean;
  difference: string;
}

export interface RegisterRow {
  id: string;
  reference: string;
  postingDate: string;
  description: string;
  status: JournalStatus;
  entryType: JournalType;
  totalDebit: string;
  createdByName: string;
}

export interface JournalRegisterReport extends ReportBase {
  rows: RegisterRow[];
  total: string;
}

export interface LedgerSummary {
  awaitingApproval: number;
  openPeriods: number;
  ledgers: Array<{ ledgerEntityId: string; type: 'firm' | 'client'; name: string; awaitingApproval: number; openPeriods: number }>;
}
