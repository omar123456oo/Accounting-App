import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { FsRow, StatementView } from '../../features/reports-fs/fs.models';
import { add, cmp, isZero, neg, sub, sum } from '../money/money';
import { mockHttpProviders, signInDemo } from '../../testing/test-utils';

const BASE = '/api/v1/staff/ledger';
const LEDGERS = ['le-firm', 'le-c-001', 'le-c-009'];
const RANGE = 'from=2026-01-01&to=2026-12-31';

interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

describe('mock financial statements API', () => {
  let http: HttpClient;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: mockHttpProviders() });
    http = TestBed.inject(HttpClient);
  });

  async function call(method: string, path: string, body?: unknown): Promise<Res> {
    try {
      const res = await firstValueFrom(http.request(method, `${BASE}/${path}`, { body, observe: 'response' }));
      return { status: res.status, body: res.body };
    } catch (e) {
      const err = e as HttpErrorResponse;
      return { status: err.status, body: err.error };
    }
  }
  const stmt = async (ledger: string, kind: string, extra = RANGE): Promise<StatementView> => (await call('GET', `${ledger}/statements/${kind}?${extra}`)).body.data;
  const rows = (s: StatementView): FsRow[] => s.sections.flatMap((x) => x.rows);
  const val = (s: StatementView, key: string, col = 0): string => rows(s).find((r) => r.key === key)!.values[col];

  /** Independent expectation from the trial balance: signed closing balance by account category. */
  async function tbByCategory(ledger: string, extra = RANGE) {
    const tb = (await call('GET', `${ledger}/reports/trial-balance?${extra}`)).body.data;
    const accounts = (await call('GET', `${ledger}/accounts`)).body.data as Array<{ id: string; category: string }>;
    const cat = new Map(accounts.map((a) => [a.id, a.category]));
    const by: Record<string, string> = { asset: '0', liability: '0', equity: '0', revenue: '0', expense: '0', movement: '0' };
    for (const r of tb.rows) {
      by[cat.get(r.accountId)!] = add(by[cat.get(r.accountId)!], sub(r.closingDebit, r.closingCredit));
      // Movement of the range itself on result accounts: what the income statement of that range must show.
      if (['revenue', 'expense'].includes(cat.get(r.accountId)!)) by['movement'] = add(by['movement'], sub(r.debit, r.credit));
    }
    return by;
  }

  async function expectReconciled(ledger: string, extra = RANGE) {
    const by = await tbByCategory(ledger, extra);
    const bs = await stmt(ledger, 'balance', extra);
    expect(bs.check).toEqual({ kind: 'balance_equation', reconciled: true, difference: '0' });
    expect(val(bs, 'total_assets')).toBe(by['asset']);
    expect(val(bs, 'total_liabilities')).toBe(neg(by['liability']));
    // Equity on the sheet = equity accounts + the result that is not closed yet = -(equity + revenue + expense) from the TB.
    expect(val(bs, 'total_equity')).toBe(neg(add(by['equity'], add(by['revenue'], by['expense']))));
    const is = await stmt(ledger, 'income', extra);
    expect(val(is, 'net')).toBe(neg(by['movement']));
    expect(val(bs, 'bs.unclosed_result')).toBe(neg(add(by['revenue'], by['expense'])));
    const cf = await stmt(ledger, 'cashflow', extra);
    expect(cf.check.reconciled).toBe(true);
    expect(val(cf, 'net_change')).toBe(val(cf, 'cf.ledger_move'));
    const eq = await stmt(ledger, 'equity', extra);
    expect(eq.check.reconciled).toBe(true);
    expect(val(eq, 'eq.closing', 3)).toBe(val(bs, 'total_equity'));
  }

  it('reconciles with the trial balance on every seed ledger', async () => {
    await signInDemo('owner@demo.test');
    for (const ledger of LEDGERS) {
      await expectReconciled(ledger);
      const is = await stmt(ledger, 'income');
      expect(is.includesUnposted).toBe(false);
      expect(cmp(val(is, 'is.revenue'), '0')).toBeGreaterThanOrEqual(0);
    }
    await expectReconciled('le-firm', 'from=2026-04-01&to=2026-06-30');
  });

  it('keeps reconciling after random posted operations, with exact money', async () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const codes = ['5100', '5900', '4100', '1110', '1120', '2200', '3200', '1510', '2400', '1590', '5500', '4900'];
    for (let i = 0; i < 12; i++) {
      await signInDemo('accountant@demo.test');
      const a = codes[rand(codes.length)];
      let b = codes[rand(codes.length)];
      if (a === b) b = codes[(codes.indexOf(a) + 1) % codes.length];
      const amount = `${1 + rand(9000)}.${String(rand(10000)).padStart(4, '0')}`;
      const debitFirst = rand(2) === 0;
      const lines = [
        { accountId: `a-c-001-${a}`, debit: debitFirst ? amount : '0', credit: debitFirst ? '0' : amount },
        { accountId: `a-c-001-${b}`, debit: debitFirst ? '0' : amount, credit: debitFirst ? amount : '0' },
      ];
      const created = await call('POST', 'le-c-001/journals', { entryType: 'standard', postingDate: `2026-10-${String(1 + rand(12)).padStart(2, '0')}`, description: 'DEMO random', lines });
      const id = created.body.data.id as string;
      await call('POST', `le-c-001/journals/${id}/submit`);
      await signInDemo('chief@demo.test');
      await call('POST', `le-c-001/journals/${id}/approve`);
      expect((await call('POST', `le-c-001/journals/${id}/post`)).status).toBe(200);
    }
    await signInDemo('owner@demo.test');
    await expectReconciled('le-c-001');
    await expectReconciled('le-c-001', 'from=2026-10-01&to=2026-10-31');
  });

  it('marks a preview that includes unposted entries and changes the numbers', async () => {
    await signInDemo('owner@demo.test');
    const posted = await stmt('le-c-001', 'income', 'from=2026-10-01&to=2026-10-31');
    const preview = await stmt('le-c-001', 'income', 'from=2026-10-01&to=2026-10-31&includeUnposted=true');
    expect(posted.includesUnposted).toBe(false);
    expect(preview.includesUnposted).toBe(true);
    expect(val(preview, 'net')).not.toBe(val(posted, 'net'));
  });

  it('gives a comparative column with an exact variance and percent', async () => {
    await signInDemo('owner@demo.test');
    const s = await stmt('le-c-009', 'income', 'from=2026-05-01&to=2026-05-31&compareFrom=2026-04-01&compareTo=2026-04-30');
    const revenue = rows(s).find((r) => r.key === 'is.revenue')!;
    expect(revenue.values[0]).toBe('20000');
    expect(revenue.compare).toEqual(['0']);
    expect(revenue.variance).toEqual(['20000']);
    expect(revenue.variancePct).toEqual([null]);
    const b = await stmt('le-c-009', 'income', 'from=2026-07-01&to=2026-07-31&compareFrom=2026-05-01&compareTo=2026-05-31');
    const opex = rows(b).find((r) => r.key === 'is.operating_expenses')!;
    expect(opex.variance).toEqual(['18000']);
    expect(rows(b).find((r) => r.key === 'is.revenue')!.variancePct).toEqual(['-100.00']);
  });

  it('marks a range as finalized only when every period is locked', async () => {
    await signInDemo('owner@demo.test');
    expect((await stmt('le-firm', 'income', 'from=2026-01-01&to=2026-01-31')).finalized).toBe(true);
    expect((await stmt('le-firm', 'income', 'from=2026-01-01&to=2026-02-28')).finalized).toBe(false);
    expect((await stmt('le-firm', 'income')).finalized).toBe(false);
  });

  it('drills down from each line to its accounts, which add up to the line', async () => {
    await signInDemo('owner@demo.test');
    const bs = await stmt('le-firm', 'balance');
    for (const r of rows(bs).filter((x) => x.kind === 'line' && x.accounts)) {
      expect(sum(r.accounts!.map((a) => a.amount))).toBe(r.values[0]);
    }
  });

  it('uses the saved mapping, refuses unsuitable lines, and needs mappings.manage', async () => {
    await signInDemo('chief@demo.test');
    const before = await stmt('le-c-009', 'income');
    expect(val(before, 'is.other_income')).toBe('0');
    expect(before.templateConfirmed).toBe(false);
    expect((await call('PUT', 'le-c-009/statements/mapping', { mapping: { 'a-c-009-4200': 'bs.cash' } })).status).toBe(422);
    const saved = await call('PUT', 'le-c-009/statements/mapping', { mapping: { 'a-c-009-4200': 'is.other_income' } });
    expect(saved.status).toBe(200);
    const after = await stmt('le-c-009', 'income');
    expect(val(after, 'is.other_income')).toBe('20000');
    expect(val(after, 'is.revenue')).toBe('0');
    expect(after.templateConfirmed).toBe(true);
    await expectReconciled('le-c-009');
    await signInDemo('accountant@demo.test');
    expect((await call('PUT', 'le-c-001/statements/mapping', { mapping: {} })).status).toBe(403);
  });

  it('hides ledgers the user may not see (404) and statements from users without reports.view (403)', async () => {
    await signInDemo('accountant@demo.test');
    expect((await call('GET', `le-firm/statements/income?${RANGE}`)).status).toBe(404);
    expect((await call('GET', `le-c-001/statements/income?${RANGE}`)).status).toBe(200);
    await signInDemo('owner@demo.test');
    expect((await call('GET', `le-c-001/statements/nope?${RANGE}`)).status).toBe(404);
  });

  it('filters by branch, reports a slice as filtered, and lists the dimension values', async () => {
    await signInDemo('accountant@demo.test');
    const created = await call('POST', 'le-c-001/journals', {
      entryType: 'standard',
      postingDate: '2026-10-06',
      description: 'DEMO branch cost',
      lines: [
        { accountId: 'a-c-001-5900', debit: '700', credit: '0', branch: 'ALEX' },
        { accountId: 'a-c-001-1110', debit: '0', credit: '700' },
      ],
    });
    const id = created.body.data.id as string;
    await call('POST', `le-c-001/journals/${id}/submit`);
    await signInDemo('chief@demo.test');
    await call('POST', `le-c-001/journals/${id}/approve`);
    await call('POST', `le-c-001/journals/${id}/post`);
    expect((await call('GET', 'le-c-001/statements/options')).body.data.branches).toEqual(['ALEX']);
    const all = await stmt('le-c-001', 'income', 'from=2026-10-01&to=2026-10-31');
    const alex = await stmt('le-c-001', 'income', 'from=2026-10-01&to=2026-10-31&branch=ALEX');
    expect(alex.dimensionFiltered).toBe(true);
    expect(all.dimensionFiltered).toBe(false);
    expect(val(alex, 'is.operating_expenses')).toBe('0');
    expect(val(alex, 'is.other_expenses')).toBe('700');
    expect(isZero(sub(val(all, 'is.other_expenses'), '700'))).toBe(true);
  });
});
