import { Account } from '../../features/accounting/accounting.models';
import { FsAccountAmount, FsCheck, FsLineKey, FsRow, FsSection, StatementKind, StatementView } from '../../features/reports-fs/fs.models';
import { abs, add, isZero, mulDiv, neg, sub, sum } from '../money/money';
import { addDays } from './mock-clock';
import { FS_LINES, lineOf } from './mock-fs-lines';
import { LedgerCtx, isPosted } from './mock-ledger-store';

/** Journals of this source move balances between result accounts and retained earnings only. */
export const CLOSING_SOURCE = 'year_end_closing';

export interface FlatLine {
  date: string;
  accountId: string;
  /** Debit minus credit. */
  net: string;
  closing: boolean;
}

export interface FsScope {
  includeUnposted: boolean;
  branch?: string;
  costCenter?: string;
}

/** Every line of the ledger that counts for the chosen basis (posted only, or a preview with unposted entries). */
export function flatten(ctx: LedgerCtx, scope: FsScope): FlatLine[] {
  const out: FlatLine[] = [];
  for (const j of ctx.store.journals) {
    if (j.ledgerEntityId !== ctx.entity.id || (!scope.includeUnposted && !isPosted(j))) continue;
    for (const l of j.lines) {
      if ((scope.branch && l.branch !== scope.branch) || (scope.costCenter && l.costCenter !== scope.costCenter)) continue;
      out.push({ date: j.postingDate, accountId: l.accountId, net: sub(l.debit, l.credit), closing: j.sourceType === CLOSING_SOURCE });
    }
  }
  return out;
}

type Agg = Map<string, { value: string; accounts: FsAccountAmount[] }>;

const entryOf = (a: Account, amount: string): FsAccountAmount => ({ accountId: a.id, code: a.code, nameAr: a.nameAr, nameEn: a.nameEn, amount });

function put(agg: Agg, key: string, a: Account, amount: string): void {
  const cur = agg.get(key) ?? { value: '0', accounts: [] };
  cur.value = add(cur.value, amount);
  if (!isZero(amount)) cur.accounts.push(entryOf(a, amount));
  agg.set(key, cur);
}

export class FsData {
  readonly accounts: Account[];
  private readonly map: Record<string, FsLineKey>;

  constructor(
    private readonly ctx: LedgerCtx,
    private readonly lines: FlatLine[],
  ) {
    this.accounts = ctx.store.accountsOf(ctx.entity.id).map((a) => ({ ...a, hasPostings: false })).sort((x, y) => x.code.localeCompare(y.code));
    this.map = ctx.store.compliance.fsMappingOf(ctx.entity.id).map;
  }

  private sumFor(accountId: string, pick: (l: FlatLine) => boolean): string {
    return sum(this.lines.filter((l) => l.accountId === accountId && pick(l)).map((l) => l.net));
  }

  /** Natural-side balance of balance-sheet lines at a date, by statement line, plus the not-yet-closed result. */
  balance(asOf: string): Agg {
    const agg: Agg = new Map();
    for (const a of this.accounts) {
      const bal = this.sumFor(a.id, (l) => l.date <= asOf);
      if (a.category === 'revenue' || a.category === 'expense') {
        put(agg, 'bs.unclosed_result', a, neg(bal));
      } else {
        put(agg, lineOf(a, this.map).key, a, a.category === 'asset' ? bal : neg(bal));
      }
    }
    return agg;
  }

  /** Result-account movements of a range by statement line (closing entries excluded), shown on their natural side. */
  income(from: string, to: string): Agg {
    const agg: Agg = new Map();
    for (const a of this.accounts) {
      if (a.category !== 'revenue' && a.category !== 'expense') continue;
      const m = this.sumFor(a.id, (l) => !l.closing && l.date >= from && l.date <= to);
      put(agg, lineOf(a, this.map).key, a, a.category === 'revenue' ? neg(m) : m);
    }
    return agg;
  }

  defaulted(): number {
    return this.accounts.filter((a) => a.isPostable && lineOf(a, this.map).fromTemplate).length;
  }
}

const v = (agg: Agg, key: string): string => agg.get(key)?.value ?? '0';

interface RowDef {
  key: string;
  ar: string;
  en: string;
  kind: 'line' | 'subtotal' | 'total';
  of?: ReadonlyArray<readonly ['+' | '-', string]>;
}
interface SecDef {
  key: string;
  ar: string;
  en: string;
  rows: RowDef[];
}

const lineLabel = (key: string): { ar: string; en: string } => {
  const l = FS_LINES.find((x) => x.key === key);
  return l ? { ar: l.labelAr, en: l.labelEn } : { ar: 'النتيجة غير المقفلة على الأرباح المحتجزة', en: 'Result not yet closed to retained earnings' };
};
const line = (key: string): RowDef => ({ key, ...lineLabel(key), kind: 'line' });
const sub_ = (key: string, ar: string, en: string, of: RowDef['of'], kind: 'subtotal' | 'total' = 'subtotal'): RowDef => ({ key, ar, en, kind, of });

const INCOME: SecDef[] = [
  { key: 'revenue', ar: 'الإيرادات', en: 'Revenue', rows: [line('is.revenue'), line('is.cost_of_revenue'), sub_('gross', 'مجمل الربح', 'Gross profit', [['+', 'is.revenue'], ['-', 'is.cost_of_revenue']])] },
  { key: 'operating', ar: 'التشغيل', en: 'Operations', rows: [line('is.operating_expenses'), line('is.depreciation'), sub_('operating', 'ربح التشغيل', 'Operating profit', [['+', 'gross'], ['-', 'is.operating_expenses'], ['-', 'is.depreciation']])] },
  { key: 'other', ar: 'بنود أخرى', en: 'Other items', rows: [line('is.other_income'), line('is.other_expenses'), sub_('net', 'صافي النتيجة', 'Net result', [['+', 'operating'], ['+', 'is.other_income'], ['-', 'is.other_expenses']], 'total')] },
];

const BALANCE: SecDef[] = [
  { key: 'assets', ar: 'الأصول', en: 'Assets', rows: [line('bs.cash'), line('bs.receivables'), line('bs.other_current_assets'), sub_('current_assets', 'إجمالي الأصول المتداولة', 'Total current assets', [['+', 'bs.cash'], ['+', 'bs.receivables'], ['+', 'bs.other_current_assets']]), line('bs.fixed_assets'), sub_('total_assets', 'إجمالي الأصول', 'Total assets', [['+', 'current_assets'], ['+', 'bs.fixed_assets']], 'total')] },
  { key: 'liabilities', ar: 'الالتزامات', en: 'Liabilities', rows: [line('bs.payables'), line('bs.other_current_liabilities'), line('bs.long_term_liabilities'), sub_('total_liabilities', 'إجمالي الالتزامات', 'Total liabilities', [['+', 'bs.payables'], ['+', 'bs.other_current_liabilities'], ['+', 'bs.long_term_liabilities']])] },
  { key: 'equity', ar: 'حقوق الملكية', en: 'Equity', rows: [line('bs.capital'), line('bs.retained_earnings'), line('bs.other_equity'), line('bs.unclosed_result'), sub_('total_equity', 'إجمالي حقوق الملكية', 'Total equity', [['+', 'bs.capital'], ['+', 'bs.retained_earnings'], ['+', 'bs.other_equity'], ['+', 'bs.unclosed_result']]), sub_('total_le', 'إجمالي الالتزامات وحقوق الملكية', 'Total liabilities and equity', [['+', 'total_liabilities'], ['+', 'total_equity']], 'total')] },
];

const CASHFLOW: SecDef[] = [
  {
    key: 'operating',
    ar: 'الأنشطة التشغيلية',
    en: 'Operating activities',
    rows: [
      { key: 'cf.profit', ar: 'صافي نتيجة الفترة', en: 'Net result for the period', kind: 'line' },
      { key: 'cf.dep', ar: 'إضافة: الإهلاك (بند غير نقدي)', en: 'Add back: depreciation (non-cash)', kind: 'line' },
      { key: 'cf.receivables', ar: 'التغير في المدينين', en: 'Change in receivables', kind: 'line' },
      { key: 'cf.other_ca', ar: 'التغير في الأصول المتداولة الأخرى', en: 'Change in other current assets', kind: 'line' },
      { key: 'cf.payables', ar: 'التغير في الدائنين', en: 'Change in payables', kind: 'line' },
      { key: 'cf.other_cl', ar: 'التغير في الالتزامات المتداولة الأخرى', en: 'Change in other current liabilities', kind: 'line' },
      sub_('cfo', 'صافي التدفق من الأنشطة التشغيلية', 'Net cash from operating activities', [['+', 'cf.profit'], ['+', 'cf.dep'], ['+', 'cf.receivables'], ['+', 'cf.other_ca'], ['+', 'cf.payables'], ['+', 'cf.other_cl']]),
    ],
  },
  { key: 'investing', ar: 'الأنشطة الاستثمارية', en: 'Investing activities', rows: [{ key: 'cf.capex', ar: 'شراء الأصول الثابتة (بالصافي)', en: 'Purchase of fixed assets (net)', kind: 'line' }, sub_('cfi', 'صافي التدفق من الأنشطة الاستثمارية', 'Net cash from investing activities', [['+', 'cf.capex']])] },
  {
    key: 'financing',
    ar: 'الأنشطة التمويلية',
    en: 'Financing activities',
    rows: [
      { key: 'cf.ltl', ar: 'التغير في الالتزامات طويلة الأجل', en: 'Change in long-term liabilities', kind: 'line' },
      { key: 'cf.capital', ar: 'التغير في رأس المال', en: 'Change in capital', kind: 'line' },
      { key: 'cf.other_equity', ar: 'حركات حقوق الملكية الأخرى', en: 'Other equity movements', kind: 'line' },
      sub_('cff', 'صافي التدفق من الأنشطة التمويلية', 'Net cash from financing activities', [['+', 'cf.ltl'], ['+', 'cf.capital'], ['+', 'cf.other_equity']]),
    ],
  },
  { key: 'cash', ar: 'النقدية', en: 'Cash', rows: [sub_('net_change', 'صافي التغير في النقدية', 'Net change in cash', [['+', 'cfo'], ['+', 'cfi'], ['+', 'cff']], 'total'), { key: 'cf.opening', ar: 'النقدية أول الفترة', en: 'Cash at start of period', kind: 'line' }, sub_('cf.closing', 'النقدية آخر الفترة (حسب القائمة)', 'Cash at end of period (per statement)', [['+', 'cf.opening'], ['+', 'net_change']], 'total'), { key: 'cf.ledger_move', ar: 'حركة النقدية حسب الدفتر', en: 'Cash movement per ledger', kind: 'line' }] },
];

const EQUITY_COLS = [
  { key: 'capital', labelAr: 'رأس المال', labelEn: 'Capital' },
  { key: 'retained', labelAr: 'الأرباح المحتجزة والنتيجة', labelEn: 'Retained earnings and result' },
  { key: 'other', labelAr: 'أخرى', labelEn: 'Other' },
  { key: 'total', labelAr: 'الإجمالي', labelEn: 'Total' },
];

export interface BuiltRows {
  sections: FsSection[];
  check: FsCheck;
}

const column = (cols: number, values: string[]): string[] => (values.length === cols ? values : Array.from({ length: cols }, (_, i) => values[i] ?? '0'));

/** Lays out a statement from per-key values (one value per column) and computes its subtotals with the money module. */
function layout(defs: SecDef[], base: Map<string, { values: string[]; accounts?: FsAccountAmount[] }>, cols: number): FsSection[] {
  const values = new Map<string, string[]>();
  return defs.map((s) => ({
    key: s.key,
    labelAr: s.ar,
    labelEn: s.en,
    rows: s.rows.map((r): FsRow => {
      let vals: string[];
      let accounts: FsAccountAmount[] | undefined;
      if (r.of) {
        vals = Array.from({ length: cols }, (_, c) => r.of!.reduce((t, [sign, key]) => (sign === '+' ? add(t, values.get(key)?.[c] ?? '0') : sub(t, values.get(key)?.[c] ?? '0')), '0'));
      } else {
        const b = base.get(r.key);
        vals = column(cols, b?.values ?? []);
        accounts = b?.accounts;
      }
      values.set(r.key, vals);
      return { key: r.key, kind: r.kind, labelAr: r.ar, labelEn: r.en, values: vals, ...(accounts && accounts.length > 0 ? { accounts } : {}) };
    }),
  }));
}

const single = (agg: Agg): Map<string, { values: string[]; accounts?: FsAccountAmount[] }> => new Map([...agg].map(([k, x]) => [k, { values: [x.value], accounts: x.accounts }]));

function deltaAccounts(close: Agg, open: Agg, key: string, sign: 1 | -1): { value: string; accounts: FsAccountAmount[] } {
  const byId = new Map<string, FsAccountAmount>();
  for (const a of close.get(key)?.accounts ?? []) byId.set(a.accountId, { ...a });
  for (const a of open.get(key)?.accounts ?? []) {
    const cur = byId.get(a.accountId);
    if (cur) cur.amount = sub(cur.amount, a.amount);
    else byId.set(a.accountId, { ...a, amount: neg(a.amount) });
  }
  const accounts = [...byId.values()].map((a) => ({ ...a, amount: sign === 1 ? a.amount : neg(a.amount) })).filter((a) => !isZero(a.amount));
  const delta = sub(v(close, key), v(open, key));
  return { value: sign === 1 ? delta : neg(delta), accounts };
}

/** The rows and reconciliation check of one statement kind for one range (`to` is the balance date for the balance sheet). */
export function buildRows(kind: StatementKind, data: FsData, from: string, to: string): BuiltRows {
  const opening = addDays(from, -1);
  switch (kind) {
    case 'income': {
      const inc = data.income(from, to);
      return { sections: layout(INCOME, single(inc), 1), check: { kind: 'none', reconciled: true, difference: '0' } };
    }
    case 'balance': {
      const bal = data.balance(to);
      const sections = layout(BALANCE, single(bal), 1);
      const total = (k: string): string => sections.flatMap((s) => s.rows).find((r) => r.key === k)!.values[0];
      const diff = sub(total('total_assets'), total('total_le'));
      return { sections, check: { kind: 'balance_equation', reconciled: isZero(diff), difference: abs(diff) } };
    }
    case 'cashflow': {
      const open = data.balance(opening);
      const close = data.balance(to);
      const inc = data.income(from, to);
      const profit = resultOf(inc);
      const dep = v(inc, 'is.depreciation');
      const dFixed = deltaAccounts(close, open, 'bs.fixed_assets', 1);
      const dRe = sub(v(close, 'bs.retained_earnings'), v(open, 'bs.retained_earnings'));
      const dUnclosed = sub(v(close, 'bs.unclosed_result'), v(open, 'bs.unclosed_result'));
      const otherEquity = deltaAccounts(close, open, 'bs.other_equity', 1);
      const base = new Map<string, { values: string[]; accounts?: FsAccountAmount[] }>();
      const set = (key: string, value: string, accounts?: FsAccountAmount[]): void => void base.set(key, { values: [value], accounts });
      set('cf.profit', profit);
      set('cf.dep', dep);
      const rec = deltaAccounts(close, open, 'bs.receivables', -1);
      set('cf.receivables', rec.value, rec.accounts);
      const oca = deltaAccounts(close, open, 'bs.other_current_assets', -1);
      set('cf.other_ca', oca.value, oca.accounts);
      const pay = deltaAccounts(close, open, 'bs.payables', 1);
      set('cf.payables', pay.value, pay.accounts);
      const ocl = deltaAccounts(close, open, 'bs.other_current_liabilities', 1);
      set('cf.other_cl', ocl.value, ocl.accounts);
      set('cf.capex', neg(add(dFixed.value, dep)), dFixed.accounts.map((a) => ({ ...a, amount: neg(a.amount) })));
      const ltl = deltaAccounts(close, open, 'bs.long_term_liabilities', 1);
      set('cf.ltl', ltl.value, ltl.accounts);
      const cap = deltaAccounts(close, open, 'bs.capital', 1);
      set('cf.capital', cap.value, cap.accounts);
      set('cf.other_equity', add(otherEquity.value, sub(add(dRe, dUnclosed), profit)), otherEquity.accounts);
      const cashOpen = v(open, 'bs.cash');
      const cashMove = sub(v(close, 'bs.cash'), cashOpen);
      set('cf.opening', cashOpen, open.get('bs.cash')?.accounts);
      set('cf.ledger_move', cashMove, deltaAccounts(close, open, 'bs.cash', 1).accounts);
      const sections = layout(CASHFLOW, base, 1);
      const row = (k: string): string => sections.flatMap((s) => s.rows).find((r) => r.key === k)!.values[0];
      const diff = sub(row('net_change'), cashMove);
      return { sections, check: { kind: 'cash_reconciliation', reconciled: isZero(diff), difference: abs(diff) } };
    }
    default: {
      const open = data.balance(opening);
      const close = data.balance(to);
      const profit = resultOf(data.income(from, to));
      const comp = (b: Agg): string[] => {
        const capital = v(b, 'bs.capital');
        const retained = add(v(b, 'bs.retained_earnings'), v(b, 'bs.unclosed_result'));
        const other = v(b, 'bs.other_equity');
        return [capital, retained, other, add(add(capital, retained), other)];
      };
      const o = comp(open);
      const c = comp(close);
      const result = ['0', profit, '0', profit];
      const moves = c.map((x, i) => sub(sub(x, o[i]), result[i]));
      const base = new Map<string, { values: string[]; accounts?: FsAccountAmount[] }>([
        ['eq.opening', { values: o }],
        ['eq.result', { values: result }],
        ['eq.other', { values: moves }],
        ['eq.closing', { values: c }],
      ]);
      const defs: SecDef[] = [
        {
          key: 'equity',
          ar: 'حقوق الملكية',
          en: 'Equity',
          rows: [
            { key: 'eq.opening', ar: 'الرصيد في بداية الفترة', en: 'Balance at start of period', kind: 'line' },
            { key: 'eq.result', ar: 'صافي نتيجة الفترة', en: 'Net result for the period', kind: 'line' },
            { key: 'eq.other', ar: 'حركات أخرى (رأس المال، توزيعات، تسويات)', en: 'Other movements (capital, distributions, adjustments)', kind: 'line' },
            { key: 'eq.closing', ar: 'الرصيد في نهاية الفترة', en: 'Balance at end of period', kind: 'total' },
          ],
        },
      ];
      const sections = layout(defs, base, 4);
      // The closing equity must equal assets minus liabilities of the balance sheet at the same date.
      const bal = buildRows('balance', data, from, to).sections.flatMap((s) => s.rows);
      const get = (k: string): string => bal.find((r) => r.key === k)!.values[0];
      const diff = sub(c[3], sub(get('total_assets'), get('total_liabilities')));
      return { sections, check: { kind: 'equity_reconciliation', reconciled: isZero(diff), difference: abs(diff) } };
    }
  }
}

/** Net result of the income aggregation: revenue + other income - all expenses. */
export function resultOf(inc: Agg): string {
  return sub(add(v(inc, 'is.revenue'), v(inc, 'is.other_income')), sum([v(inc, 'is.cost_of_revenue'), v(inc, 'is.operating_expenses'), v(inc, 'is.depreciation'), v(inc, 'is.other_expenses')]));
}

export function columnsOf(kind: StatementKind): StatementView['columns'] {
  return kind === 'equity' ? EQUITY_COLS : [{ key: 'amount', labelAr: 'المبلغ', labelEn: 'Amount' }];
}

/** Adds the comparative column and the variance (amount, and percent when the comparative value is not zero) to each row. */
export function withComparison(rows: FsSection[], other: FsSection[]): FsSection[] {
  const prior = new Map(other.flatMap((s) => s.rows).map((r) => [r.key, r.values]));
  return rows.map((s) => ({
    ...s,
    rows: s.rows.map((r) => {
      const p = prior.get(r.key) ?? r.values.map(() => '0');
      const variance = r.values.map((x, i) => sub(x, p[i]));
      return { ...r, compare: p, variance, variancePct: variance.map((d, i) => (isZero(p[i]) ? null : mulDiv(d, '100', abs(p[i]), 2))) };
    }),
  }));
}

/** Net result (profit or loss) of the posted books for a range: what the income statement shows as its last line. */
export function periodResult(ctx: LedgerCtx, from: string, to: string): string {
  return resultOf(new FsData(ctx, flatten(ctx, { includeUnposted: false })).income(from, to));
}
