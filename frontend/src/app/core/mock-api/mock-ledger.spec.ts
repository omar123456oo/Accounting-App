import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { cmp } from '../money/money';
import { mockHttpProviders, signInDemo } from '../../testing/test-utils';
import { STARTER_CHART } from './mock-ledger-template';
import { DEMO_USERS } from './mock-users';

const OWNER = 'owner@demo.test';
const ACCOUNTANT = 'accountant@demo.test';
const CHIEF = 'chief@demo.test';
const C1 = 'le-c-001';
const BASE = '/api/v1/staff/ledger';

interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

describe('mock ledger API', () => {
  let http: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: mockHttpProviders() });
    http = TestBed.inject(HttpClient);
  });

  async function call(method: string, path: string, body?: unknown, key?: string): Promise<Res> {
    const headers = key ? new HttpHeaders({ 'Idempotency-Key': key }) : undefined;
    try {
      const res = await firstValueFrom(http.request(method, `${BASE}/${path}`, { body, headers, observe: 'response' }));
      return { status: res.status, body: res.body };
    } catch (e) {
      const err = e as HttpErrorResponse;
      return { status: err.status, body: err.error };
    }
  }

  const acct = (ledger: string, code: string) => `a-${ledger.replace('le-', '')}-${code}`;
  const draft = (ledger: string, amount = '100.10', date = '2026-10-12') => ({
    entryType: 'standard',
    postingDate: date,
    description: 'DEMO test entry',
    lines: [
      { accountId: acct(ledger, '5900'), debit: amount, credit: '0' },
      { accountId: acct(ledger, '1110'), debit: '0', credit: amount },
    ],
  });

  /** Creates, submits as one user, approves and posts as another. Returns the posted entry. */
  async function postEntry(ledger = C1, amount = '100.10', date = '2026-10-12', creator = ACCOUNTANT, approver = CHIEF) {
    await signInDemo(creator);
    const created = await call('POST', `${ledger}/journals`, draft(ledger, amount, date));
    const id = created.body.data.id as string;
    expect((await call('POST', `${ledger}/journals/${id}/submit`)).status).toBe(200);
    await signInDemo(approver);
    expect((await call('POST', `${ledger}/journals/${id}/approve`)).status).toBe(200);
    return { id, post: () => call('POST', `${ledger}/journals/${id}/post`) };
  }

  async function trialBalance(ledger: string, extra = '') {
    return (await call('GET', `${ledger}/reports/trial-balance${extra}`)).body.data;
  }

  it('keeps every seeded trial balance balanced and non-trivial', async () => {
    await signInDemo(OWNER);
    const entities = (await call('GET', 'entities')).body.data as Array<{ id: string }>;
    expect(entities.map((e) => e.id)).toEqual(['le-firm', 'le-c-001', 'le-c-009']);
    for (const e of entities) {
      const tb = await trialBalance(e.id);
      expect(tb.rows.length).toBeGreaterThan(5);
      expect(tb.balanced).toBe(true);
      expect(cmp(tb.totals.debit, tb.totals.credit)).toBe(0);
      expect(cmp(tb.totals.debit, '0')).toBe(1);
      expect(tb.includesUnposted).toBe(false);
    }
  });

  it('refuses to leave draft when out of balance (422), with too few lines, or with a group account', async () => {
    await signInDemo(ACCOUNTANT);
    const bad = draft(C1);
    bad.lines[1].credit = '99.99';
    const id = (await call('POST', `${C1}/journals`, bad)).body.data.id;
    const res = await call('POST', `${C1}/journals/${id}/submit`);
    expect(res.status).toBe(422);
    expect(res.body.errors.lines).toBeTruthy();
    const group = await call('POST', `${C1}/journals`, { ...draft(C1), lines: [{ accountId: acct(C1, '1000'), debit: '5', credit: '0' }, { accountId: acct(C1, '1110'), debit: '0', credit: '5' }] });
    expect((await call('POST', `${C1}/journals/${group.body.data.id}/submit`)).status).toBe(422);
  });

  it('rejects lines with both or neither side, unknown accounts and too many decimals when saving', async () => {
    await signInDemo(ACCOUNTANT);
    for (const line of [
      { accountId: acct(C1, '5900'), debit: '5', credit: '5' },
      { accountId: acct(C1, '5900'), debit: '0', credit: '0' },
      { accountId: 'nope', debit: '5', credit: '0' },
      { accountId: acct(C1, '5900'), debit: '5.12345', credit: '0' },
    ]) {
      expect((await call('POST', `${C1}/journals`, { ...draft(C1), lines: [line] })).status).toBe(422);
    }
  });

  it('adds decimals exactly when balancing (0.1 + 0.2 against 0.3)', async () => {
    await signInDemo(ACCOUNTANT);
    const entry = {
      ...draft(C1),
      lines: [
        { accountId: acct(C1, '5900'), debit: '0.1', credit: '0' },
        { accountId: acct(C1, '5300'), debit: '0.2', credit: '0' },
        { accountId: acct(C1, '1110'), debit: '0', credit: '0.3' },
      ],
    };
    const id = (await call('POST', `${C1}/journals`, entry)).body.data.id;
    expect((await call('POST', `${C1}/journals/${id}/submit`)).status).toBe(200);
  });

  it('rejects posting into a closed or locked period for everyone, owner included', async () => {
    const locked = await postEntry(C1, '10', '2026-01-15');
    expect((await locked.post()).status).toBe(422);
    const closed = await postEntry('le-firm', '10', '2026-02-10', CHIEF, OWNER);
    await signInDemo(OWNER);
    const res = await call('POST', `le-firm/journals/${closed.id}/post`);
    expect(res.status).toBe(422);
    expect(res.body.errors.postingDate[0]).toBeTruthy();
    const missing = await postEntry(C1, '10', '2030-05-05');
    expect((await missing.post()).status).toBe(422);
  });

  it('makes posted entries immutable (409) while drafts can be edited and deleted', async () => {
    const entry = await postEntry();
    expect((await entry.post()).status).toBe(200);
    expect((await call('PATCH', `${C1}/journals/${entry.id}`, { description: 'changed' })).status).toBe(409);
    expect((await call('DELETE', `${C1}/journals/${entry.id}`)).status).toBe(409);
    await signInDemo(ACCOUNTANT);
    const id = (await call('POST', `${C1}/journals`, draft(C1))).body.data.id;
    expect((await call('PATCH', `${C1}/journals/${id}`, { description: 'edited' })).body.data.description).toBe('edited');
    expect((await call('DELETE', `${C1}/journals/${id}`)).status).toBe(204);
    expect((await call('GET', `${C1}/journals/${id}`)).status).toBe(404);
  });

  it('enforces four-eyes: the creator cannot approve, and the accountant has no approve permission', async () => {
    await signInDemo(CHIEF);
    const id = (await call('POST', `le-firm/journals`, draft('le-firm'))).body.data.id;
    await call('POST', `le-firm/journals/${id}/submit`);
    const own = await call('POST', `le-firm/journals/${id}/approve`);
    expect(own.status).toBe(403);
    await signInDemo(ACCOUNTANT);
    const mine = (await call('POST', `${C1}/journals`, draft(C1))).body.data.id;
    await call('POST', `${C1}/journals/${mine}/submit`);
    expect((await call('POST', `${C1}/journals/${mine}/approve`)).status).toBe(403);
    expect((await call('POST', `le-firm/journals/${id}/approve`)).status).toBe(404);
    await signInDemo(OWNER);
    expect((await call('POST', `le-firm/journals/${id}/approve`)).status).toBe(200);
  });

  it('needs journals.approve_high from the approver for entries of 50,000 or more', async () => {
    await signInDemo(ACCOUNTANT);
    const high = (await call('POST', `${C1}/journals`, draft(C1, '50000'))).body.data.id;
    const below = (await call('POST', `${C1}/journals`, draft(C1, '49999.9999'))).body.data.id;
    await call('POST', `${C1}/journals/${high}/submit`);
    await call('POST', `${C1}/journals/${below}/submit`);
    await signInDemo(CHIEF);
    const permissions = DEMO_USERS.find((u) => u.email === CHIEF)!.profile.permissions;
    const at = permissions.indexOf('journals.approve_high');
    permissions.splice(at, 1);
    try {
      expect((await call('POST', `${C1}/journals/${high}/approve`)).status).toBe(403);
      expect((await call('POST', `${C1}/journals/${below}/approve`)).status).toBe(200);
    } finally {
      permissions.splice(at, 0, 'journals.approve_high');
    }
    expect((await call('POST', `${C1}/journals/${high}/approve`)).status).toBe(200);
  });

  it('assigns gapless numbers only at posting, across many sequential postings and failures', async () => {
    const numbers: string[] = [];
    const first = await postEntry();
    expect((await call('GET', `${C1}/journals/${first.id}`)).body.data.number).toBeUndefined();
    const failing = await postEntry(C1, '5', '2026-01-20');
    expect((await failing.post()).status).toBe(422);
    numbers.push((await first.post()).body.data.number);
    for (let i = 0; i < 5; i++) {
      numbers.push(((await (await postEntry(C1, `${i + 1}`)).post()).body.data.number) as string);
    }
    const sequence = numbers.map((n) => Number(n.split('-')[2]));
    expect(sequence.slice(1).every((n, i) => n === sequence[i] + 1)).toBe(true);
    expect(numbers[0]).toMatch(/^JE-2026-\d{6}$/);
    expect((await call('GET', `${C1}/journals/${failing.id}`)).body.data.reference).toMatch(/^DRAFT-/);
  });

  it('reverses with a reason, links both ways, swaps lines and keeps the trial balance balanced', async () => {
    const entry = await postEntry(C1, '250.75');
    await entry.post();
    const before = await trialBalance(C1);
    expect((await call('POST', `${C1}/journals/${entry.id}/reverse`, { reason: '  ' })).status).toBe(422);
    const res = await call('POST', `${C1}/journals/${entry.id}/reverse`, { reason: 'Wrong account', createReplacement: true });
    expect(res.status).toBe(200);
    const { original, reversal, replacement } = res.body.data;
    expect(original.status).toBe('reversed');
    expect(original.reversedById).toBe(reversal.id);
    expect(reversal.reversalOfId).toBe(original.id);
    expect(reversal.status).toBe('posted');
    expect(reversal.lines[0].credit).toBe(original.lines[0].debit);
    expect(replacement.status).toBe('draft');
    expect((await call('POST', `${C1}/journals/${entry.id}/reverse`, { reason: 'again' })).status).toBe(409);
    const after = await trialBalance(C1);
    expect(after.balanced).toBe(true);
    expect(after.totals.closingDebit).toBe(before.totals.closingDebit);
    const reversalInPeriod = await call('POST', `${C1}/journals/${reversal.id}/reverse`, { reason: 'x' });
    expect(reversalInPeriod.status).toBe(409);
  });

  it('refuses to reverse into a closed period', async () => {
    const entry = await postEntry();
    await entry.post();
    const res = await call('POST', `${C1}/journals/${entry.id}/reverse`, { reason: 'x', postingDate: '2026-01-31' });
    expect(res.status).toBe(422);
    expect((await call('GET', `${C1}/journals/${entry.id}`)).body.data.status).toBe('posted');
  });

  it('replays the stored response for the same Idempotency-Key and refuses a different body with 422', async () => {
    const entry = await postEntry();
    const first = await call('POST', `${C1}/journals/${entry.id}/post`, {}, 'key-1');
    const replay = await call('POST', `${C1}/journals/${entry.id}/post`, {}, 'key-1');
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect((await call('POST', `${C1}/journals/${entry.id}/post`, {})).status).toBe(409);
    const reversed = await call('POST', `${C1}/journals/${entry.id}/reverse`, { reason: 'a' }, 'key-2');
    expect(reversed.status).toBe(200);
    expect((await call('POST', `${C1}/journals/${entry.id}/reverse`, { reason: 'a' }, 'key-2')).body).toEqual(reversed.body);
    const conflict = await call('POST', `${C1}/journals/${entry.id}/reverse`, { reason: 'different' }, 'key-2');
    expect(conflict.status).toBe(422);
    const all = (await call('GET', `${C1}/journals?q=Reversal&pageSize=100`)).body.data as unknown[];
    expect(all).toHaveLength(1);
  });

  it('hides ledgers outside the caller scope with 404 and rejects missing permissions with 403', async () => {
    await signInDemo(ACCOUNTANT);
    expect(((await call('GET', 'entities')).body.data as unknown[]).length).toBe(1);
    expect((await call('GET', 'le-firm/journals')).status).toBe(404);
    expect((await call('GET', 'le-c-009/accounts')).status).toBe(404);
    expect((await call('GET', `${C1}/accounts`)).status).toBe(200);
    expect((await call('POST', `${C1}/accounts`, { code: '9' })).status).toBe(403);
    expect((await call('POST', `${C1}/journals/x/post`)).status).toBe(403);
    await signInDemo('client@demo.test');
    expect((await call('GET', 'entities')).status).toBe(403);
  });

  it('blocks a category change, deactivation and un-posting of an account with posted lines (409)', async () => {
    await signInDemo(CHIEF);
    const used = acct('le-firm', '1120');
    expect((await call('PATCH', `le-firm/accounts/${used}`, { category: 'liability' })).status).toBe(409);
    expect((await call('PATCH', `le-firm/accounts/${used}`, { isActive: false })).status).toBe(409);
    expect((await call('PATCH', `le-firm/accounts/${used}`, { nameEn: 'Main bank' })).status).toBe(200);
    const fresh = (await call('POST', 'le-firm/accounts', { code: '5950', nameAr: 'تجريبي', nameEn: 'Test', category: 'expense', parentId: acct('le-firm', '5000') })).body.data;
    expect(fresh.normalBalance).toBe('debit');
    expect((await call('PATCH', `le-firm/accounts/${fresh.id}`, { category: 'asset', parentId: '' })).body.data.category).toBe('asset');
    expect((await call('PATCH', `le-firm/accounts/${fresh.id}`, { isActive: false })).body.data.isActive).toBe(false);
  });

  it('keeps account codes unique per ledger and validates the parent', async () => {
    await signInDemo(CHIEF);
    const body = { code: '1110', nameAr: 'س', nameEn: 'x', category: 'asset' };
    expect((await call('POST', 'le-firm/accounts', body)).body.errors.code).toBeTruthy();
    expect((await call('POST', 'le-c-001/accounts', { ...body, code: '7000', parentId: acct('le-firm', '1000') })).body.errors.parentId).toBeTruthy();
    expect((await call('POST', 'le-firm/accounts', { ...body, code: '7000', parentId: acct('le-firm', '1110') })).status).toBe(422);
    expect((await call('POST', 'le-firm/accounts', { ...body, code: '7000', category: 'expense', parentId: acct('le-firm', '1000') })).status).toBe(422);
  });

  it('imports the starter chart idempotently: about forty bilingual accounts', async () => {
    expect(STARTER_CHART.length).toBeGreaterThanOrEqual(38);
    expect(STARTER_CHART.length).toBeLessThanOrEqual(45);
    expect(STARTER_CHART.every((a) => a.nameAr && a.nameEn)).toBe(true);
    await signInDemo(CHIEF);
    const res = await call('POST', 'le-firm/accounts/import-template');
    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(0);
    const accounts = (await call('GET', 'le-firm/accounts')).body.data as Array<{ code: string }>;
    expect(accounts.length).toBe(STARTER_CHART.length);
  });

  it('creates fiscal years from any start month and refuses overlaps and mid-month starts', async () => {
    await signInDemo(CHIEF);
    const res = await call('POST', `${C1}/fiscal-years`, { name: 'FY 2027/28', startDate: '2027-04-01' });
    expect(res.status).toBe(201);
    expect(res.body.data.year.endDate).toBe('2028-03-31');
    expect(res.body.data.periods).toHaveLength(12);
    expect(res.body.data.periods[10].endDate).toBe('2028-02-29');
    expect((await call('POST', `${C1}/fiscal-years`, { name: 'x', startDate: '2027-10-01' })).body.errors.startDate).toBeTruthy();
    expect((await call('POST', `${C1}/fiscal-years`, { name: 'x', startDate: '2028-06-15' })).status).toBe(422);
    await signInDemo(ACCOUNTANT);
    expect((await call('POST', `${C1}/fiscal-years`, { name: 'x', startDate: '2040-01-01' })).status).toBe(403);
  });

  it('closes, locks and reopens periods; reopening needs periods.reopen and a reason, and is audited', async () => {
    await signInDemo(CHIEF);
    const periods = (await call('GET', `${C1}/periods`)).body.data as Array<{ id: string; status: string }>;
    const october = periods[9];
    expect((await call('POST', `${C1}/periods/${october.id}/close`)).body.data.status).toBe('closed');
    expect((await call('POST', `${C1}/periods/${october.id}/close`)).status).toBe(409);
    expect((await call('POST', `${C1}/periods/${october.id}/reopen`, {})).status).toBe(422);
    const reopened = await call('POST', `${C1}/periods/${october.id}/reopen`, { reason: 'Late invoice' });
    expect(reopened.body.data.status).toBe('open');
    expect(reopened.body.data.history.at(-1)).toMatchObject({ action: 'reopened', reason: 'Late invoice' });
    await call('POST', `${C1}/periods/${october.id}/lock`);
    await signInDemo(ACCOUNTANT);
    expect((await call('POST', `${C1}/periods/${october.id}/reopen`, { reason: 'x' })).status).toBe(403);
    expect((await call('POST', `${C1}/periods/${october.id}/close`)).status).toBe(403);
  });

  it('reports only posted lines, and marks a preview when unposted entries are included', async () => {
    await signInDemo(OWNER);
    const posted = await trialBalance(C1);
    const preview = await trialBalance(C1, '?includeUnposted=true');
    expect(preview.includesUnposted).toBe(true);
    expect(cmp(preview.totals.debit, posted.totals.debit)).toBe(1);
    const register = (await call('GET', `${C1}/reports/journal-register`)).body.data;
    expect(register.rows.every((r: { status: string }) => r.status === 'posted' || r.status === 'reversed')).toBe(true);
    const gl = (await call('GET', `${C1}/reports/general-ledger?accountId=${acct(C1, '1120')}&from=2026-04-01`)).body.data;
    expect(gl.openingBalance).toBe('310000.2');
    expect(gl.rows.at(-1).balance).toBe(gl.closingBalance);
    expect((await call('GET', `${C1}/reports/general-ledger`)).status).toBe(422);
  });

  it('keeps the trial balance balanced after new postings', async () => {
    const e = await postEntry(C1, '1234.5678');
    await e.post();
    expect((await trialBalance(C1)).balanced).toBe(true);
    expect((await trialBalance(C1, '?from=2026-10-01&to=2026-10-31')).totals.debit).toBe('1234.5678');
  });

  it('creates a draft from a recurring template and counts items awaiting approval', async () => {
    await signInDemo(ACCOUNTANT);
    const templates = (await call('GET', `${C1}/recurring-templates`)).body.data as Array<{ id: string }>;
    expect(templates.length).toBeGreaterThan(0);
    const res = await call('POST', `${C1}/recurring-templates/${templates[0].id}/create-draft`, { postingDate: '2026-10-31' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.sourceType).toBe('recurring_template');
    const summary = (await call('GET', 'summary')).body.data;
    expect(summary.awaitingApproval).toBe(2);
    expect(summary.openPeriods).toBe(11);
  });
});
