import { AccountCategory } from '../accounting/accounting.models';

/** Contracts of the financial statements API. Amounts are decimal strings; presentation signs are applied by the server. */
export type StatementKind = 'income' | 'balance' | 'cashflow' | 'equity';
export const STATEMENT_KINDS: readonly StatementKind[] = ['income', 'balance', 'cashflow', 'equity'];

/** The fixed catalogue of statement lines an account can be mapped to. */
export const FS_LINE_KEYS = [
  'is.revenue',
  'is.cost_of_revenue',
  'is.operating_expenses',
  'is.depreciation',
  'is.other_income',
  'is.other_expenses',
  'bs.cash',
  'bs.receivables',
  'bs.other_current_assets',
  'bs.fixed_assets',
  'bs.payables',
  'bs.other_current_liabilities',
  'bs.long_term_liabilities',
  'bs.capital',
  'bs.retained_earnings',
  'bs.other_equity',
] as const;
export type FsLineKey = (typeof FS_LINE_KEYS)[number];

/** Which statement lines an account of a category may be mapped to. */
export const LINES_BY_CATEGORY: Record<AccountCategory, readonly FsLineKey[]> = {
  asset: ['bs.cash', 'bs.receivables', 'bs.other_current_assets', 'bs.fixed_assets'],
  liability: ['bs.payables', 'bs.other_current_liabilities', 'bs.long_term_liabilities'],
  equity: ['bs.capital', 'bs.retained_earnings', 'bs.other_equity'],
  revenue: ['is.revenue', 'is.other_income'],
  expense: ['is.cost_of_revenue', 'is.operating_expenses', 'is.depreciation', 'is.other_expenses'],
};

export interface FsAccountAmount {
  accountId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  amount: string;
}

export interface FsRow {
  key: string;
  kind: 'line' | 'subtotal' | 'total';
  labelAr: string;
  labelEn: string;
  /** One value per column. */
  values: string[];
  compare?: string[];
  variance?: string[];
  /** Percent change per column; null when the comparative value is zero. */
  variancePct?: Array<string | null>;
  /** The ledger accounts behind a line (drill-down to the general ledger). */
  accounts?: FsAccountAmount[];
}

export interface FsSection {
  key: string;
  labelAr: string;
  labelEn: string;
  rows: FsRow[];
}

export interface FsCheck {
  kind: 'balance_equation' | 'cash_reconciliation' | 'equity_reconciliation' | 'none';
  reconciled: boolean;
  /** Absolute difference, shown as text when not reconciled. */
  difference: string;
}

export interface StatementView {
  kind: StatementKind;
  ledgerEntityId: string;
  from: string;
  to: string;
  compare?: { from: string; to: string };
  includesUnposted: boolean;
  /** True when every period of the range is locked. */
  finalized: boolean;
  compareFinalized?: boolean;
  columns: Array<{ key: string; labelAr: string; labelEn: string }>;
  sections: FsSection[];
  check: FsCheck;
  /** Accounts that use the starter mapping because nobody mapped them explicitly. */
  defaultedAccounts: number;
  /** A branch or cost-centre filter is applied, so the statement is a slice and does not reconcile with the whole trial balance. */
  dimensionFiltered: boolean;
  templateConfirmed: boolean;
}

export interface StatementParams {
  from?: string;
  to?: string;
  compareFrom?: string;
  compareTo?: string;
  includeUnposted?: boolean;
  branch?: string;
  costCenter?: string;
}

export interface FsLineDef {
  key: FsLineKey;
  labelAr: string;
  labelEn: string;
}

export interface FsMappingAccount {
  accountId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  category: AccountCategory;
  lineKey: FsLineKey;
  /** True when the line comes from the starter template, not from a saved choice. */
  fromTemplate: boolean;
}

export interface FsMapping {
  lines: FsLineDef[];
  accounts: FsMappingAccount[];
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface FsOptions {
  branches: string[];
  costCenters: string[];
}
