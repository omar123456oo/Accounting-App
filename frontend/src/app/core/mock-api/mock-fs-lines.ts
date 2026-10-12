import { AccountCategory } from '../../features/accounting/accounting.models';
import { FS_LINE_KEYS, FsLineDef, FsLineKey, LINES_BY_CATEGORY } from '../../features/reports-fs/fs.models';

/**
 * The catalogue of statement lines and the STARTER mapping from account codes to lines. The starter is a
 * convenience only: it is NOT a legal certification of any statement format and needs accountant review.
 */
export const FS_LINES: readonly FsLineDef[] = [
  { key: 'is.revenue', labelAr: 'الإيرادات', labelEn: 'Revenue' },
  { key: 'is.cost_of_revenue', labelAr: 'تكلفة الإيرادات', labelEn: 'Cost of revenue' },
  { key: 'is.operating_expenses', labelAr: 'مصروفات التشغيل', labelEn: 'Operating expenses' },
  { key: 'is.depreciation', labelAr: 'الإهلاك', labelEn: 'Depreciation' },
  { key: 'is.other_income', labelAr: 'إيرادات أخرى', labelEn: 'Other income' },
  { key: 'is.other_expenses', labelAr: 'مصروفات أخرى', labelEn: 'Other expenses' },
  { key: 'bs.cash', labelAr: 'النقدية وما في حكمها', labelEn: 'Cash and equivalents' },
  { key: 'bs.receivables', labelAr: 'المدينون', labelEn: 'Receivables' },
  { key: 'bs.other_current_assets', labelAr: 'أصول متداولة أخرى', labelEn: 'Other current assets' },
  { key: 'bs.fixed_assets', labelAr: 'الأصول الثابتة (بالصافي)', labelEn: 'Fixed assets (net)' },
  { key: 'bs.payables', labelAr: 'الدائنون', labelEn: 'Payables' },
  { key: 'bs.other_current_liabilities', labelAr: 'التزامات متداولة أخرى', labelEn: 'Other current liabilities' },
  { key: 'bs.long_term_liabilities', labelAr: 'التزامات طويلة الأجل', labelEn: 'Long-term liabilities' },
  { key: 'bs.capital', labelAr: 'رأس المال', labelEn: 'Capital' },
  { key: 'bs.retained_earnings', labelAr: 'الأرباح المحتجزة', labelEn: 'Retained earnings' },
  { key: 'bs.other_equity', labelAr: 'حقوق ملكية أخرى', labelEn: 'Other equity' },
];

/** First matching prefix wins; the longest prefixes come first. */
const STARTER: ReadonlyArray<[string, FsLineKey]> = [
  ['11', 'bs.cash'],
  ['12', 'bs.receivables'],
  ['15', 'bs.fixed_assets'],
  ['24', 'bs.long_term_liabilities'],
  ['21', 'bs.payables'],
  ['31', 'bs.capital'],
  ['32', 'bs.retained_earnings'],
  ['49', 'is.other_income'],
  ['55', 'is.depreciation'],
  ['59', 'is.other_expenses'],
];

const FALLBACK: Record<AccountCategory, FsLineKey> = {
  asset: 'bs.other_current_assets',
  liability: 'bs.other_current_liabilities',
  equity: 'bs.other_equity',
  revenue: 'is.revenue',
  expense: 'is.operating_expenses',
};

export const isLineKey = (v: unknown): v is FsLineKey => typeof v === 'string' && (FS_LINE_KEYS as readonly string[]).includes(v);

export function starterLine(code: string, category: AccountCategory): FsLineKey {
  const hit = STARTER.find(([prefix, key]) => code.startsWith(prefix) && LINES_BY_CATEGORY[category].includes(key));
  return hit?.[1] ?? FALLBACK[category];
}

/** The line an account lands on: the saved choice when it still suits the account's category, else the starter template. */
export function lineOf(account: { code: string; category: AccountCategory; id: string }, map: Record<string, FsLineKey>): { key: FsLineKey; fromTemplate: boolean } {
  const chosen = map[account.id];
  if (chosen && LINES_BY_CATEGORY[account.category].includes(chosen)) return { key: chosen, fromTemplate: false };
  return { key: starterLine(account.code, account.category), fromTemplate: true };
}
