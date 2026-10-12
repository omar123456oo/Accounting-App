import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { mockHttpProviders, signInDemo } from '../../testing/test-utils';
import { add, cmp, min, mulDiv } from '../money/money';
import { setMockToday } from './mock-clock';

const OWNER = 'owner@demo.test';
const ACCOUNTANT = 'accountant@demo.test';
const CHIEF = 'chief@demo.test';
const FIRM = 'le-firm';
const C1 = 'le-c-001';
const BASE = '/api/v1/staff/ledger';

interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

describe('mock commercial API', () => {
  let http: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: mockHttpProviders() });
    http = TestBed.inject(HttpClient);
  });
  afterEach(() => setMockToday(null));

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
  const com = (ledger: string, path: string) => `${ledger}/commercial/${path}`;
  const acct = (ledger: string, code: string) => `a-${ledger.replace('le-', '')}-${code}`;
  const st = (ledger: string, code: string) => `st-${ledger.replace('le-', '')}-${code}`;
  const ec = (ledger: string, code: string) => `ec-${ledger.replace('le-', '')}-${code}`;
  const party = (ledger: string, kind: 'cu' | 'su', short: string) => `${kind}-${ledger.replace('le-', '')}-${short}`;
  const STD = 'tx-demo-vat-std';

  const line = (ledger: string, over: Record<string, unknown> = {}) => ({ description: 'DEMO service', serviceTypeId: st(ledger, ledger === FIRM ? 'BOOK' : 'SALES'), qty: '1', unitPrice: '1000', discount: '0', ...over });
  const invoiceBody = (ledger: string, over: Record<string, unknown> = {}) => ({ partyId: party(ledger, 'cu', ledger === FIRM ? 'nile' : 'retailA'), date: '2026-10-12', termsKind: 'net30', lines: [line(ledger)], ...over });
  const billBody = (ledger: string, over: Record<string, unknown> = {}) => ({ partyId: party(ledger, 'su', ledger === FIRM ? 'stationery' : 'wholesale'), date: '2026-10-12', termsKind: 'net30', lines: [{ description: 'DEMO purchase', categoryId: ec(ledger, 'OTHER'), qty: '1', unitPrice: '1000', discount: '0' }], ...over });

  async function trialBalance(ledger: string) {
    return (await call('GET', `${ledger}/reports/trial-balance`)).body.data;
  }
  async function recon(ledger: string) {
    return (await call('GET', com(ledger, 'reports/reconciliation'))).body.data;
  }
  const journalCount = async (ledger: string) => ((await call('GET', `${ledger}/journals?pageSize=100`)).body.meta.total as number);

  /** Creates a draft, issues it as the accountant (below the approval threshold) and returns the issued invoice. */
  async function issued(ledger = C1, over: Record<string, unknown> = {}) {
    await signInDemo(ACCOUNTANT);
    const created = await call('POST', com(ledger, 'invoices'), invoiceBody(ledger, over));
    expect(created.status).toBe(201);
    const res = await call('POST', com(ledger, `invoices/${created.body.data.id}/issue`));
    expect(res.status).toBe(200);
    return res.body.data;
  }
  const bankOf = (ledger: string) => acct(ledger, '1120');

  it('seeds consistent commercial data: balanced trial balances and reconciled subledgers in every ledger', async () => {
    await signInDemo(OWNER);
    for (const ledger of [FIRM, C1, 'le-c-009']) {
      expect((await trialBalance(ledger)).balanced).toBe(true);
      const r = await recon(ledger);
      expect(r.reconciled).toBe(true);
      expect(r.rows.map((x: { key: string }) => x.key)).toEqual(['ar', 'ap', 'customerCredit', 'supplierPrepayment', 'deferredRevenue']);
    }
    const firm = await recon(FIRM);
    expect(firm.rows[0].subledger).toBe(firm.rows[0].control);
    expect(cmp(firm.rows[0].control, '0')).toBe(1);
  });

  it('computes lines with exact decimals and one half-up rounding per line, and the totals add up', async () => {
    await signInDemo(ACCOUNTANT);
    const res = await call('POST', com(C1, 'invoices'), invoiceBody(C1, { lines: [line(C1, { qty: '0.3333', unitPrice: '3', taxRateId: STD }), line(C1, { qty: '3', unitPrice: '19.99', discount: '15' }), line(C1, { qty: '1', unitPrice: '10.05', taxRateId: STD })] }));
    expect(res.status).toBe(201);
    const [a, b, c] = res.body.data.lines;
    expect(a).toMatchObject({ gross: '1.0000', net: '1.0000', taxAmount: '0.1400', total: '1.1400' });
    expect(b).toMatchObject({ gross: '59.9700', discountAmount: '9.0000', net: '50.9700', taxAmount: '0.0000' });
    expect(c).toMatchObject({ net: '10.0500', taxAmount: '1.4100', total: '11.4600' });
    expect(res.body.data).toMatchObject({ net: '62.0200', taxTotal: '1.5500', total: '63.5700' });
    expect(res.body.data.reference).toMatch(/^DRAFT-/);
    expect(res.body.data.number).toBeUndefined();
  });

  it('rejects incomplete lines, unknown services, bad quantities and an unknown or ineffective tax rate', async () => {
    await signInDemo(ACCOUNTANT);
    for (const bad of [{ qty: '0' }, { qty: '1.23456' }, { unitPrice: '-1' }, { discount: '101' }, { description: ' ' }, { serviceTypeId: 'nope' }]) {
      expect((await call('POST', com(C1, 'invoices'), invoiceBody(C1, { lines: [line(C1, bad)] }))).status).toBe(422);
    }
    expect((await call('POST', com(C1, 'invoices'), invoiceBody(C1, { lines: [] }))).status).toBe(422);
    expect((await call('POST', com(C1, 'invoices'), invoiceBody(C1, { lines: [line(C1, { taxRateId: 'tx-nope' })] }))).status).toBe(422);
    expect((await call('POST', com(C1, 'invoices'), invoiceBody(C1, { date: '2019-12-31', lines: [line(C1, { taxRateId: STD })] }))).body.errors.lines).toBeTruthy();
  });

  it('snapshots the tax rate on the invoice: a later rate edit never changes an issued invoice', async () => {
    const inv = await issued(C1, { lines: [line(C1, { taxRateId: STD })] });
    expect(inv.lines[0].tax).toMatchObject({ rateId: STD, percent: '14', version: 1 });
    expect(inv.taxTotal).toBe('140.0000');
    await signInDemo(OWNER);
    const edited = await call('PATCH', 'tax-rates/' + STD, { rate: '15' });
    expect(edited.body.data).toMatchObject({ rate: '15', version: 2 });
    expect(edited.body.data.history[0]).toMatchObject({ version: 1, rate: '14' });
    const again = (await call('GET', com(C1, `invoices/${inv.id}`))).body.data;
    expect(again.lines[0].tax).toMatchObject({ percent: '14', version: 1 });
    expect(again.taxTotal).toBe('140.0000');
    const next = await call('POST', com(C1, 'invoices'), invoiceBody(C1, { lines: [line(C1, { taxRateId: STD })] }));
    expect(next.body.data.lines[0].tax).toMatchObject({ percent: '15', version: 2 });
    expect(next.body.data.taxTotal).toBe('150.0000');
    expect(next.body.data.usesUnverifiedRate).toBe(true);
  });

  it('manages tax rates: empty of real values, demo rates are drafts, verification needs a date, edits need the permission', async () => {
    await signInDemo(OWNER);
    const rates = (await call('GET', 'tax-rates')).body.data as Array<{ isDemo: boolean; approvalStatus: string }>;
    expect(rates.every((r) => r.isDemo && r.approvalStatus === 'draft')).toBe(true);
    const base = { code: 'X-1', name: 'Test rate', rate: '5', effectiveFrom: '2026-01-01', legalSource: 'Test decree', approvalStatus: 'professionally_verified' };
    expect((await call('POST', 'tax-rates', base)).body.errors.lastVerifiedAt).toBeTruthy();
    expect((await call('POST', 'tax-rates', { ...base, rate: '101', lastVerifiedAt: '2026-10-01' })).body.errors.rate).toBeTruthy();
    const created = await call('POST', 'tax-rates', { ...base, lastVerifiedAt: '2026-10-01' });
    expect(created.status).toBe(201);
    expect((await call('POST', 'tax-rates', { ...base, lastVerifiedAt: '2026-10-01' })).body.errors.code).toBeTruthy();
    await signInDemo(CHIEF);
    expect((await call('PATCH', `tax-rates/${created.body.data.id}`, { rate: '6' })).status).toBe(403);
    await signInDemo(ACCOUNTANT);
    expect((await call('GET', 'tax-rates')).status).toBe(200);
    expect((await call('POST', 'tax-rates', base)).status).toBe(403);
  });

  it('refuses retired rates, and draft rates when the ledger does not allow them; a verified rate shows no warning', async () => {
    await signInDemo(OWNER);
    const verified = (await call('POST', 'tax-rates', { code: 'OK-1', name: 'Verified', rate: '10', effectiveFrom: '2026-01-01', legalSource: 'Test decree', approvalStatus: 'professionally_verified', lastVerifiedAt: '2026-10-01' })).body.data;
    const ok = await call('POST', com(C1, 'invoices'), invoiceBody(C1, { lines: [line(C1, { taxRateId: verified.id })] }));
    expect(ok.body.data.usesUnverifiedRate).toBe(false);
    expect((await call('PATCH', com(C1, 'settings'), { allowDraftRates: false })).body.data.allowDraftRates).toBe(false);
    expect((await call('POST', com(C1, 'invoices'), invoiceBody(C1, { lines: [line(C1, { taxRateId: STD })] }))).status).toBe(422);
    expect((await call('POST', com(C1, 'invoices'), invoiceBody(C1, { lines: [line(C1, { taxRateId: verified.id })] }))).status).toBe(201);
    await call('PATCH', `tax-rates/${verified.id}`, { approvalStatus: 'retired' });
    expect((await call('POST', com(C1, 'invoices'), invoiceBody(C1, { lines: [line(C1, { taxRateId: verified.id })] }))).status).toBe(422);
  });

  it('issues atomically: a closed period leaves a draft with no number and no journal, and the next number has no gap', async () => {
    await signInDemo(OWNER);
    const numbers = ((await call('GET', com(FIRM, 'invoices?pageSize=100'))).body.data as Array<{ number?: string }>).map((i) => i.number).filter(Boolean) as string[];
    const last = Number(numbers.sort().at(-1)!.split('-')[2]);
    const draft = (await call('POST', com(FIRM, 'invoices'), invoiceBody(FIRM, { date: '2026-02-15' }))).body.data;
    const journals = await journalCount(FIRM);
    const tb = (await trialBalance(FIRM)).totals.debit;
    const res = await call('POST', com(FIRM, `invoices/${draft.id}/issue`));
    expect(res.status).toBe(422);
    expect(res.body.errors.postingDate).toBeTruthy();
    const after = (await call('GET', com(FIRM, `invoices/${draft.id}`))).body.data;
    expect(after).toMatchObject({ status: 'draft', journals: [] });
    expect(after.number).toBeUndefined();
    expect(after.reference).toMatch(/^DRAFT-/);
    expect(await journalCount(FIRM)).toBe(journals);
    expect((await trialBalance(FIRM)).totals.debit).toBe(tb);
    const fine = (await call('POST', com(FIRM, 'invoices'), invoiceBody(FIRM))).body.data;
    const issuedOk = (await call('POST', com(FIRM, `invoices/${fine.id}/issue`))).body.data;
    expect(issuedOk.number).toBe(`INV-2026-${String(last + 1).padStart(6, '0')}`);
    expect(issuedOk.journals).toHaveLength(1);
  });

  it('links every issued invoice to a posted journal with source type and id, visible in the general ledger and trial balance', async () => {
    const inv = await issued(C1, { lines: [line(C1, { unitPrice: '2500', taxRateId: STD })] });
    await signInDemo(CHIEF);
    const journal = (await call('GET', `${C1}/journals/${inv.journals[0].journalId}`)).body.data;
    expect(journal).toMatchObject({ status: 'posted', sourceType: 'invoice', sourceId: inv.id });
    expect(journal.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: acct(C1, '1210'), debit: '2850.0000' }), expect.objectContaining({ accountId: acct(C1, '4200'), credit: '2500.0000' }), expect.objectContaining({ accountId: acct(C1, '2310'), credit: '350.0000' })]));
    const gl = (await call('GET', `${C1}/reports/general-ledger?accountId=${acct(C1, '1210')}`)).body.data;
    expect(gl.rows.some((r: { journalId: string }) => r.journalId === journal.id)).toBe(true);
    expect((await trialBalance(C1)).balanced).toBe(true);
    expect((await call('POST', `${C1}/journals/${journal.id}/reverse`, { reason: 'manual' })).status).toBe(409);
  });

  it('enforces four-eyes above the threshold: a different user with invoices.approve approves, which issues atomically', async () => {
    await signInDemo(OWNER);
    const created = (await call('POST', com(C1, 'invoices'), invoiceBody(C1, { lines: [line(C1, { unitPrice: '100000' })] }))).body.data;
    expect(created.requiresApproval).toBe(true);
    expect((await call('POST', com(C1, `invoices/${created.id}/issue`))).body.errors.approval).toBeTruthy();
    expect((await call('POST', com(C1, `invoices/${created.id}/submit`))).body.data.status).toBe('pending_approval');
    expect((await call('PATCH', com(C1, `invoices/${created.id}`), { notes: 'x' })).status).toBe(409);
    expect((await call('POST', com(C1, `invoices/${created.id}/approve`))).status).toBe(403);
    await signInDemo(ACCOUNTANT);
    expect((await call('POST', com(C1, `invoices/${created.id}/approve`))).status).toBe(403);
    await signInDemo(CHIEF);
    const approved = await call('POST', com(C1, `invoices/${created.id}/approve`), { comment: 'ok' });
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({ status: 'issued', approvedBy: 'u-chief' });
    expect(approved.body.data.number).toMatch(/^INV-2026-/);
    expect((await call('POST', com(C1, `invoices/${created.id}/approve`))).status).toBe(409);
    await signInDemo(ACCOUNTANT);
    const below = (await call('POST', com(C1, 'invoices'), invoiceBody(C1, { lines: [line(C1, { unitPrice: '99999.99' })] }))).body.data;
    expect((await call('POST', com(C1, `invoices/${below.id}/issue`))).status).toBe(200);
  });

  it('lets an approver reject back to draft with a reason', async () => {
    await signInDemo(ACCOUNTANT);
    const created = (await call('POST', com(C1, 'invoices'), invoiceBody(C1, { lines: [line(C1, { unitPrice: '150000' })] }))).body.data;
    await call('POST', com(C1, `invoices/${created.id}/submit`));
    await signInDemo(CHIEF);
    expect((await call('POST', com(C1, `invoices/${created.id}/reject`), {})).status).toBe(422);
    expect((await call('POST', com(C1, `invoices/${created.id}/reject`), { reason: 'Wrong price' })).body.data.status).toBe('draft');
  });

  it('makes issued invoices immutable (409) and corrects them only through credit notes', async () => {
    const inv = await issued();
    expect((await call('PATCH', com(C1, `invoices/${inv.id}`), { notes: 'changed' })).status).toBe(409);
    expect((await call('DELETE', com(C1, `invoices/${inv.id}`))).status).toBe(409);
    expect((await call('POST', com(C1, `invoices/${inv.id}/cancel`))).status).toBe(409);
    expect((await call('POST', com(C1, `invoices/${inv.id}/issue`))).status).toBe(409);
    const draft = (await call('POST', com(C1, 'invoices'), invoiceBody(C1))).body.data;
    expect((await call('PATCH', com(C1, `invoices/${draft.id}`), { notes: 'fine' })).body.data.notes).toBe('fine');
    expect((await call('DELETE', com(C1, `invoices/${draft.id}`))).status).toBe(204);
  });

  it('moves issued -> partially_paid -> paid through allocated payments and refuses over-allocation with 422', async () => {
    const inv = await issued(C1, { lines: [line(C1, { unitPrice: '1000' })] });
    const customer = inv.partyId;
    const pay = (amount: string, allocations: unknown[], extra: Record<string, unknown> = {}) => call('POST', com(C1, 'payments'), { partyId: customer, date: '2026-10-12', accountId: bankOf(C1), amount, allocations, ...extra });
    const over = await pay('2000', [{ docId: inv.id, amount: '1000.01' }]);
    expect(over.status).toBe(422);
    expect(over.body.errors.allocations).toBeTruthy();
    expect((await pay('500', [{ docId: inv.id, amount: '600' }])).status).toBe(422);
    expect((await pay('500', [{ docId: 'nope', amount: '100' }])).status).toBe(422);
    expect((await pay('500', [{ docId: inv.id, amount: '0' }])).status).toBe(422);
    expect((await call('GET', com(C1, `invoices/${inv.id}`))).body.data.status).toBe('issued');
    const first = await pay('400', [{ docId: inv.id, amount: '400' }], { reference: 'DEMO' });
    expect(first.status).toBe(201);
    expect(first.body.data.number).toMatch(/^RC-2026-/);
    let after = (await call('GET', com(C1, `invoices/${inv.id}`))).body.data;
    expect(after).toMatchObject({ status: 'partially_paid', paid: '400.0000', balance: '600.0000' });
    expect((await pay('700', [{ docId: inv.id, amount: '700' }])).status).toBe(422);
    await pay('600', [{ docId: inv.id, amount: '600' }]);
    after = (await call('GET', com(C1, `invoices/${inv.id}`))).body.data;
    expect(after).toMatchObject({ status: 'paid', balance: '0.0000' });
    expect((await call('POST', com(C1, `invoices/${inv.id}/cancel`))).status).toBe(409);
    expect((await pay('10', [{ docId: inv.id, amount: '10' }])).status).toBe(422);
    expect((await trialBalance(C1)).balanced).toBe(true);
    expect((await recon(C1)).reconciled).toBe(true);
  });

  it('turns an unapplied payment into a customer credit, allocates it later, and refunds part of it', async () => {
    const inv = await issued(C1, { lines: [line(C1, { unitPrice: '300' })] });
    const made = await call('POST', com(C1, 'payments'), { partyId: inv.partyId, date: '2026-10-12', accountId: bankOf(C1), amount: '1000', allocations: [{ docId: inv.id, amount: '100' }] });
    expect(made.body.data).toMatchObject({ unapplied: '900.0000' });
    const customer = (await call('GET', com(C1, `customers/${inv.partyId}`))).body.data;
    expect(customer).toMatchObject({ creditBalance: '900.0000', openBalance: '54200.0000' });
    let r = await recon(C1);
    expect(r.rows.find((x: { key: string }) => x.key === 'customerCredit')).toMatchObject({ subledger: '900.0000', control: '900.0000', reconciled: true });
    const id = made.body.data.id;
    expect((await call('POST', com(C1, `payments/${id}/allocate`), { allocations: [{ docId: inv.id, amount: '250' }] })).status).toBe(422);
    const allocated = await call('POST', com(C1, `payments/${id}/allocate`), { allocations: [{ docId: inv.id, amount: '200' }] });
    expect(allocated.body.data).toMatchObject({ unapplied: '700.0000' });
    expect((await call('GET', com(C1, `invoices/${inv.id}`))).body.data.status).toBe('paid');
    expect((await call('POST', com(C1, `payments/${id}/refund`), { amount: '800', accountId: bankOf(C1) })).body.errors.amount).toBeTruthy();
    expect((await call('POST', com(C1, `payments/${id}/refund`), { amount: '300', accountId: acct(C1, '5900') })).body.errors.accountId).toBeTruthy();
    const refunded = await call('POST', com(C1, `payments/${id}/refund`), { amount: '300', accountId: bankOf(C1) });
    expect(refunded.body.data).toMatchObject({ unapplied: '400.0000' });
    r = await recon(C1);
    expect(r.reconciled).toBe(true);
    expect((await trialBalance(C1)).balanced).toBe(true);
  });

  it('credits an invoice: the open balance falls, the journal reverses proportionally, and a full credit marks it credited', async () => {
    const inv = await issued(C1, { lines: [line(C1, { unitPrice: '1000', taxRateId: STD })] });
    await signInDemo(CHIEF);
    const note = await call('POST', com(C1, 'credit-notes'), { docId: inv.id, date: '2026-10-12', reason: 'Returned goods', amount: '570' });
    expect(note.status).toBe(201);
    expect(note.body.data.creditNote.number).toMatch(/^CN-2026-/);
    expect(note.body.data.document).toMatchObject({ status: 'issued', balance: '570.0000', credited: '570.0000' });
    const journal = (await call('GET', `${C1}/journals/${note.body.data.creditNote.journalId}`)).body.data;
    expect(journal).toMatchObject({ sourceType: 'credit_note', status: 'posted' });
    expect(journal.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: acct(C1, '1210'), credit: '570.0000' }), expect.objectContaining({ accountId: acct(C1, '4200'), debit: '500.0000' }), expect.objectContaining({ accountId: acct(C1, '2310'), debit: '70.0000' })]));
    expect((await call('POST', com(C1, 'credit-notes'), { docId: inv.id, reason: 'Too much', amount: '570.01' })).status).toBe(422);
    expect((await call('POST', com(C1, 'credit-notes'), { docId: inv.id, reason: '', amount: '10' })).status).toBe(422);
    const rest = await call('POST', com(C1, 'credit-notes'), { docId: inv.id, date: '2026-10-12', reason: 'Cancelled order', amount: '570' });
    expect(rest.body.data.document).toMatchObject({ status: 'credited', balance: '0.0000' });
    expect((await call('POST', com(C1, 'credit-notes'), { docId: inv.id, reason: 'again', amount: '1' })).status).toBe(409);
    expect((await trialBalance(C1)).balanced).toBe(true);
    expect((await recon(C1)).reconciled).toBe(true);
    const revenue = (await call('GET', com(C1, 'reports/revenue?by=service'))).body.data;
    expect(revenue.rows.length).toBeGreaterThan(0);
  });

  it('gives each credit note a share of every line that adds up exactly, even with awkward rounding', async () => {
    const inv = await issued(C1, { lines: [line(C1, { unitPrice: '33.33', taxRateId: STD }), line(C1, { unitPrice: '66.67' }), line(C1, { unitPrice: '0.01', taxRateId: STD })] });
    await signInDemo(CHIEF);
    let balance = inv.balance as string;
    for (const amount of ['10.01', '33.33', '1.01']) {
      const res = await call('POST', com(C1, 'credit-notes'), { docId: inv.id, date: '2026-10-12', reason: 'DEMO', amount });
      expect(res.status).toBe(201);
      balance = res.body.data.document.balance;
      expect(cmp(balance, '0')).toBe(1);
    }
    const final = await call('POST', com(C1, 'credit-notes'), { docId: inv.id, date: '2026-10-12', reason: 'DEMO rest', amount: balance });
    expect(final.body.data.document.status).toBe('credited');
    expect(final.body.data.document.lines.every((l: { creditedTotal: string; total: string }) => l.creditedTotal === l.total)).toBe(true);
    expect((await trialBalance(C1)).balanced).toBe(true);
  });

  it('plans deferred revenue over the service period and recognizes it up to a date, all or nothing', async () => {
    await signInDemo(OWNER);
    const retainer = st(FIRM, 'RETAIN');
    const created = await call('POST', com(FIRM, 'invoices'), invoiceBody(FIRM, { lines: [line(FIRM, { serviceTypeId: retainer, unitPrice: '12000' })], servicePeriodStart: '2026-11-01', servicePeriodMonths: 12 }));
    const noPeriod = await call('POST', com(FIRM, 'invoices'), invoiceBody(FIRM, { lines: [line(FIRM, { serviceTypeId: retainer })] }));
    expect(noPeriod.status).toBe(422);
    const res = await call('POST', com(FIRM, `invoices/${created.body.data.id}/issue`));
    const inv = res.body.data;
    expect(inv.schedule).toHaveLength(12);
    expect(inv.schedule[0]).toMatchObject({ n: 1, date: '2026-11-30', amount: '1000.0000', status: 'pending' });
    expect(inv.schedule[11].date).toBe('2027-10-31');
    const issueJournal = (await call('GET', `${FIRM}/journals/${inv.journals[0].journalId}`)).body.data;
    expect(issueJournal.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: acct(FIRM, '2250'), credit: '12000.0000' })]));
    expect(issueJournal.lines.some((l: { accountId: string }) => l.accountId === acct(FIRM, '4100'))).toBe(false);
    const before = await recon(FIRM);

    // A closed December period makes the whole action fail: nothing is recognized, nothing is posted.
    const periods = (await call('GET', `${FIRM}/periods`)).body.data as Array<{ id: string; startDate: string }>;
    const december = periods.find((p) => p.startDate === '2026-12-01')!;
    await signInDemo(CHIEF);
    await call('POST', `${FIRM}/periods/${december.id}/close`);
    const journals = await journalCount(FIRM);
    const blocked = await call('POST', com(FIRM, `invoices/${inv.id}/recognize`), { upTo: '2026-12-31' });
    expect(blocked.status).toBe(422);
    expect(await journalCount(FIRM)).toBe(journals);
    expect((await call('GET', com(FIRM, `invoices/${inv.id}`))).body.data.schedule.filter((r: { status: string }) => r.status === 'recognized')).toHaveLength(0);
    await call('POST', `${FIRM}/periods/${december.id}/reopen`, { reason: 'DEMO' });

    const done = await call('POST', com(FIRM, `invoices/${inv.id}/recognize`), { upTo: '2026-12-31' });
    expect(done.status).toBe(200);
    expect(done.body.meta.recognized).toBe(2);
    expect(done.body.data.schedule.filter((r: { status: string }) => r.status === 'recognized').map((r: { date: string }) => r.date)).toEqual(['2026-11-30', '2026-12-31']);
    expect(await journalCount(FIRM)).toBe(journals + 2);
    const after = await recon(FIRM);
    const deferred = (r: { rows: Array<{ key: string; subledger: string }> }) => r.rows.find((x) => x.key === 'deferredRevenue')!.subledger;
    expect(cmp(deferred(before), deferred(after))).toBe(1);
    expect(after.reconciled).toBe(true);
    expect((await call('POST', com(FIRM, `invoices/${inv.id}/recognize`), { upTo: '2026-12-31' })).body.meta.recognized).toBe(0);
    const revenue = (await call('GET', com(FIRM, 'reports/revenue?by=month&from=2026-11-01&to=2026-12-31'))).body.data;
    expect(revenue.rows).toEqual([expect.objectContaining({ key: '2026-11', amount: '1000.0000' }), expect.objectContaining({ key: '2026-12', amount: '1000.0000' })]);
    // Revenue already recognized cannot be credited away from the invoice.
    expect((await call('POST', com(FIRM, 'credit-notes'), { docId: inv.id, reason: 'x', amount: '10' })).body.errors.amount).toBeTruthy();
  });

  it('answers 422 naming the missing account mapping and posts nothing; restoring the mapping lets the invoice issue', async () => {
    await signInDemo(CHIEF);
    const draft = (await call('POST', com(C1, 'invoices'), invoiceBody(C1, { lines: [line(C1, { taxRateId: STD })] }))).body.data;
    const mappings = (await call('GET', com(C1, 'mappings'))).body.data;
    for (const [patch, text] of [[{ arControl: '' }, 'حساب مراقبة العملاء'], [{ vatOutput: '' }, 'حساب ضريبة المخرجات'], [{ revenueByService: {} }, 'حساب الإيراد']] as const) {
      expect((await call('PATCH', com(C1, 'mappings'), patch)).status).toBe(200);
      const res = await call('POST', com(C1, `invoices/${draft.id}/issue`));
      expect(res.status).toBe(422);
      expect(res.body.errors.mappings[0]).toContain(text);
      expect((await call('GET', com(C1, `invoices/${draft.id}`))).body.data.status).toBe('draft');
      await call('PATCH', com(C1, 'mappings'), { arControl: mappings.arControl, vatOutput: mappings.vatOutput, revenueByService: mappings.revenueByService });
    }
    expect((await call('POST', com(C1, `invoices/${draft.id}/issue`))).status).toBe(200);
  });

  it('validates mappings: accounts must exist in the ledger and accept postings, and only mappings.manage may change them', async () => {
    await signInDemo(CHIEF);
    expect((await call('PATCH', com(C1, 'mappings'), { arControl: acct(FIRM, '1210') })).body.errors.arControl).toBeTruthy();
    expect((await call('PATCH', com(C1, 'mappings'), { arControl: acct(C1, '1200') })).status).toBe(422);
    expect((await call('PATCH', com(C1, 'mappings'), { paymentAccounts: [acct(C1, '1120')] })).body.data.paymentAccounts).toEqual([acct(C1, '1120')]);
    await signInDemo(ACCOUNTANT);
    expect((await call('PATCH', com(C1, 'mappings'), { arControl: acct(C1, '1210') })).status).toBe(403);
    expect((await call('GET', com(C1, 'mappings'))).status).toBe(200);
    expect((await call('POST', com(C1, 'service-types'), { code: 'X', nameAr: 'س', nameEn: 'x', recognition: 'on_issue' })).status).toBe(403);
  });

  it('replays the stored response for the same Idempotency-Key and refuses a different body with 422', async () => {
    const inv = await issued(C1, { lines: [line(C1, { unitPrice: '500' })] });
    const body = { partyId: inv.partyId, date: '2026-10-12', accountId: bankOf(C1), amount: '100', allocations: [{ docId: inv.id, amount: '100' }] };
    const first = await call('POST', com(C1, 'payments'), body, 'pay-1');
    const replay = await call('POST', com(C1, 'payments'), body, 'pay-1');
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(((await call('GET', com(C1, 'payments'))).body.data as unknown[]).filter((p) => (p as { id: string }).id === first.body.data.id)).toHaveLength(1);
    expect((await call('GET', com(C1, `invoices/${inv.id}`))).body.data.paid).toBe('100.0000');
    expect((await call('POST', com(C1, 'payments'), { ...body, amount: '200' }, 'pay-1')).status).toBe(422);
    const credit = await call('POST', com(C1, 'credit-notes'), { docId: inv.id, date: '2026-10-12', reason: 'DEMO', amount: '50' }, 'cn-1');
    const again = await call('POST', com(C1, 'credit-notes'), { docId: inv.id, date: '2026-10-12', reason: 'DEMO', amount: '50' }, 'cn-1');
    expect(again.body).toEqual(credit.body);
    expect((await call('GET', com(C1, `invoices/${inv.id}`))).body.data.credited).toBe('50.0000');
    const draft = (await call('POST', com(C1, 'invoices'), invoiceBody(C1))).body.data;
    const a = await call('POST', com(C1, `invoices/${draft.id}/issue`), {}, 'issue-1');
    const b = await call('POST', com(C1, `invoices/${draft.id}/issue`), {}, 'issue-1');
    expect(b.body).toEqual(a.body);
    expect((await call('POST', com(C1, `invoices/${draft.id}/issue`), {})).status).toBe(409);
  });

  it('scopes everything to the ledger: hidden ledgers and other ledgers documents answer 404, the portal gets 403', async () => {
    await signInDemo(ACCOUNTANT);
    expect((await call('GET', com(FIRM, 'customers'))).status).toBe(404);
    expect((await call('POST', com(FIRM, 'invoices'), invoiceBody(FIRM))).status).toBe(404);
    expect((await call('GET', com('le-c-009', 'bills'))).status).toBe(404);
    const mine = await issued(C1);
    await signInDemo(OWNER);
    expect((await call('GET', com(FIRM, `invoices/${mine.id}`))).status).toBe(404);
    expect((await call('POST', com(FIRM, 'payments'), { partyId: mine.partyId, date: '2026-10-12', accountId: acct(FIRM, '1120'), amount: '1', allocations: [{ docId: mine.id, amount: '1' }] })).status).toBe(422);
    expect((await call('POST', com(FIRM, 'credit-notes'), { docId: mine.id, reason: 'x', amount: '1' })).body.errors.docId).toBeTruthy();
    await signInDemo('client@demo.test');
    expect((await call('GET', com(C1, 'invoices'))).status).toBe(403);
  });

  it('checks permissions per action', async () => {
    await signInDemo(ACCOUNTANT);
    expect((await call('GET', com(C1, 'invoices'))).status).toBe(200);
    expect((await call('GET', com(C1, 'customers'))).status).toBe(200);
    const inv = await issued();
    expect((await call('POST', com(C1, 'credit-notes'), { docId: inv.id, date: '2026-10-12', reason: 'x', amount: '1' })).status).toBe(201);
    const bill = (await call('POST', com(C1, 'bills'), billBody(C1))).body.data;
    expect((await call('POST', com(C1, `bills/${bill.id}/submit`))).status).toBe(200);
    expect((await call('POST', com(C1, `bills/${bill.id}/approve`))).status).toBe(403);
    expect((await call('PATCH', com(C1, 'settings'), { allowDraftRates: false })).status).toBe(403);
  });

  it('builds AR aging by the mock clock and moves invoices between buckets when the clock moves', async () => {
    await signInDemo(OWNER);
    const aging = async () => (await call('GET', com(FIRM, 'reports/aging?side=ar'))).body.data;
    let report = await aging();
    expect(report.asOf).toBe('2026-10-12');
    expect(report.totals).toMatchObject({ current: '10259.9900', d1_30: '0.0000', d31_60: '48800.0000', d61_90: '0.0000', d90_plus: '3420.0000', total: '62479.9900' });
    const nile = report.rows.find((r: { partyName: string }) => r.partyName === 'DEMO Nile Trading Co.');
    expect(nile.items[0]).toMatchObject({ dueDate: '2026-10-31', bucket: 'current', daysPastDue: 0 });
    expect(report.rows.flatMap((r: { items: unknown[] }) => r.items)).toHaveLength(4);
    setMockToday('2026-12-31');
    report = await aging();
    expect(report.totals).toMatchObject({ current: '0.0000', d61_90: '10259.9900', d90_plus: '52220.0000' });
    const overdue = (await call('GET', com(FIRM, 'invoices?status=overdue&pageSize=50'))).body.data;
    expect(overdue).toHaveLength(4);
    expect(overdue.every((i: { status: string }) => i.status === 'overdue')).toBe(true);
    const asOf = (await call('GET', com(FIRM, 'reports/aging?side=ar&asOf=2026-10-12'))).body.data;
    expect(asOf.totals.current).toBe('10259.9900');
    expect((await call('GET', com(FIRM, 'reports/aging?side=ar&asOf=bad'))).status).toBe(422);
  });

  it('shows overdue as a computed status, records reminders only on overdue invoices, and keeps them in the history', async () => {
    const current = await issued(C1);
    expect(current.status).toBe('issued');
    expect((await call('POST', com(C1, `invoices/${current.id}/remind`), {})).status).toBe(409);
    setMockToday('2026-12-31');
    const late = (await call('GET', com(C1, `invoices/${current.id}`))).body.data;
    expect(late.status).toBe('overdue');
    const reminded = await call('POST', com(C1, `invoices/${current.id}/remind`), { note: 'First reminder' });
    expect(reminded.body.data.reminders).toEqual([expect.objectContaining({ delivery: 'logged_only', note: 'First reminder' })]);
    expect(reminded.body.data.history.at(-1).action).toBe('reminder_logged');
    setMockToday(null);
  });

  it('creates statements with opening and running balances and AP statements from the supplier side', async () => {
    await signInDemo(OWNER);
    const nile = party(FIRM, 'cu', 'nile');
    const full = (await call('GET', com(FIRM, `reports/statement?side=ar&partyId=${nile}`))).body.data;
    expect(full.lines.map((l: { kind: string }) => l.kind)).toEqual(['invoice', 'payment', 'invoice', 'credit_note']);
    expect(full.closingBalance).toBe('10259.9900');
    const later = (await call('GET', com(FIRM, `reports/statement?side=ar&partyId=${nile}&from=2026-06-01`))).body.data;
    expect(later.openingBalance).toBe('0.0000');
    expect(later.lines).toHaveLength(2);
    const supplier = (await call('GET', com(FIRM, `reports/statement?side=ap&partyId=${party(FIRM, 'su', 'landlord')}`))).body.data;
    expect(supplier.closingBalance).toBe('8500.0000');
    expect(supplier.unapplied).toBe('3000.0000');
    expect((await call('GET', com(FIRM, 'reports/statement?side=ar&partyId=nope'))).status).toBe(404);
  });

  describe('payables', () => {
    const lines = (ledger: string, over: Record<string, unknown> = {}) => [{ description: 'DEMO purchase', categoryId: ec(ledger, 'OTHER'), qty: '1', unitPrice: '1000', discount: '0', ...over }];

    async function approvedBill(ledger = FIRM, over: Record<string, unknown> = {}) {
      await signInDemo(OWNER);
      const bill = (await call('POST', com(ledger, 'bills'), billBody(ledger, over))).body.data;
      await call('POST', com(ledger, `bills/${bill.id}/submit`));
      await signInDemo(CHIEF);
      const res = await call('POST', com(ledger, `bills/${bill.id}/approve`));
      expect(res.status).toBe(200);
      return res.body.data;
    }

    it('walks a bill through draft, pending approval, approved and paid, with four-eyes and its journal', async () => {
      await signInDemo(OWNER);
      const bill = (await call('POST', com(FIRM, 'bills'), billBody(FIRM, { lines: lines(FIRM, { taxRateId: STD }) }))).body.data;
      expect(bill).toMatchObject({ status: 'draft', total: '1140.0000', bearer: 'firm' });
      expect(bill.reference).toMatch(/^DRAFT-/);
      expect((await call('POST', com(FIRM, `bills/${bill.id}/approve`))).status).toBe(409);
      await call('POST', com(FIRM, `bills/${bill.id}/submit`));
      expect((await call('POST', com(FIRM, `bills/${bill.id}/approve`))).status).toBe(403);
      await signInDemo(ACCOUNTANT);
      expect((await call('POST', com(FIRM, `bills/${bill.id}/approve`))).status).toBe(404);
      await signInDemo(CHIEF);
      const approved = (await call('POST', com(FIRM, `bills/${bill.id}/approve`))).body.data;
      expect(approved).toMatchObject({ status: 'approved', balance: '1140.0000' });
      expect(approved.number).toMatch(/^BILL-2026-/);
      const journal = (await call('GET', `${FIRM}/journals/${approved.journals[0].journalId}`)).body.data;
      expect(journal.sourceType).toBe('supplier_bill');
      expect(journal.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: acct(FIRM, '5900'), debit: '1000.0000' }), expect.objectContaining({ accountId: acct(FIRM, '1410'), debit: '140.0000' }), expect.objectContaining({ accountId: acct(FIRM, '2110'), credit: '1140.0000' })]));
      expect((await call('PATCH', com(FIRM, `bills/${bill.id}`), { notes: 'x' })).status).toBe(409);
      const pay = (amount: string) => call('POST', com(FIRM, 'bill-payments'), { partyId: approved.partyId, date: '2026-10-12', accountId: bankOf(FIRM), amount, allocations: [{ docId: bill.id, amount }] });
      expect((await pay('1140.01')).status).toBe(422);
      expect((await pay('400')).status).toBe(201);
      expect((await call('GET', com(FIRM, `bills/${bill.id}`))).body.data).toMatchObject({ status: 'partially_paid', balance: '740.0000' });
      const last = await pay('740');
      expect(last.body.data.number).toMatch(/^PV-2026-/);
      expect((await call('GET', com(FIRM, `bills/${bill.id}`))).body.data).toMatchObject({ status: 'paid', balance: '0.0000' });
      expect((await trialBalance(FIRM)).balanced).toBe(true);
      expect((await recon(FIRM)).reconciled).toBe(true);
    });

    it('credits a supplier bill, keeps unapplied supplier payments as prepayments, and reconciles', async () => {
      const bill = await approvedBill(C1, { lines: lines(C1, { unitPrice: '800', taxRateId: STD }) });
      const credit = await call('POST', com(C1, 'supplier-credits'), { docId: bill.id, date: '2026-10-12', reason: 'Damaged goods', amount: '228' });
      expect(credit.status).toBe(201);
      expect(credit.body.data.creditNote.number).toMatch(/^SCN-2026-/);
      expect(credit.body.data.document).toMatchObject({ balance: '684.0000' });
      const pay = await call('POST', com(C1, 'bill-payments'), { partyId: bill.partyId, date: '2026-10-12', accountId: bankOf(C1), amount: '1000', allocations: [{ docId: bill.id, amount: '684' }] });
      expect(pay.body.data.unapplied).toBe('316.0000');
      expect((await call('GET', com(C1, `bills/${bill.id}`))).body.data.status).toBe('paid');
      const r = await recon(C1);
      expect(r.rows.find((x: { key: string }) => x.key === 'supplierPrepayment')).toMatchObject({ subledger: '316.0000', control: '316.0000' });
      expect(r.reconciled).toBe(true);
    });

    it('limits approvals by role: the chief cannot approve above the limit, the owner can', async () => {
      await signInDemo(CHIEF);
      const big = ((await call('GET', com(FIRM, 'bills?status=pending_approval'))).body.data as Array<{ id: string; total: string }>).find((b) => b.total === '60000.0000')!;
      const refused = await call('POST', com(FIRM, `bills/${big.id}/approve`));
      expect(refused.status).toBe(403);
      await signInDemo(OWNER);
      expect((await call('POST', com(FIRM, `bills/${big.id}/approve`))).body.data.status).toBe('approved');
    });

    it('posts firm and client-reimbursable expenses differently and keeps client ledgers firm-only', async () => {
      const firmBill = await approvedBill(FIRM, { lines: lines(FIRM, { categoryId: ec(FIRM, 'FEES'), unitPrice: '700' }) });
      const reimbursable = await approvedBill(FIRM, { bearer: 'client_reimbursable', clientId: 'c-001', lines: lines(FIRM, { categoryId: ec(FIRM, 'FEES'), unitPrice: '700' }) });
      const linesOf = async (bill: { journals: Array<{ journalId: string }> }) => (await call('GET', `${FIRM}/journals/${bill.journals[0].journalId}`)).body.data.lines as Array<{ accountId: string; debit: string }>;
      expect((await linesOf(firmBill)).find((l) => cmp(l.debit, '0') > 0)!.accountId).toBe(acct(FIRM, '5400'));
      expect((await linesOf(reimbursable)).find((l) => cmp(l.debit, '0') > 0)!.accountId).toBe(acct(FIRM, '1240'));
      await signInDemo(OWNER);
      expect((await call('POST', com(C1, 'bills'), billBody(C1, { bearer: 'client_reimbursable', clientId: 'c-001' }))).body.errors.bearer).toBeTruthy();
      expect((await call('POST', com(FIRM, 'bills'), billBody(FIRM, { bearer: 'client_reimbursable' }))).body.errors.bearer).toBeTruthy();
      expect((await call('POST', com(FIRM, 'bills'), billBody(FIRM, { bearer: 'client_reimbursable', clientId: 'c-404' }))).status).toBe(422);
      expect((await trialBalance(FIRM)).balanced).toBe(true);
    });

    it('re-bills a reimbursable expense on a client invoice once, and issuing that invoice clears the receivable from the client', async () => {
      await signInDemo(CHIEF);
      const seeded = ((await call('GET', com(FIRM, 'bills?pageSize=50'))).body.data as Array<{ id: string; bearer: string; total: string }>).find((b) => b.bearer === 'client_reimbursable')!;
      const glBalance = async () => (await call('GET', `${FIRM}/reports/general-ledger?accountId=${acct(FIRM, '1240')}`)).body.data.closingBalance as string;
      expect(await glBalance()).toBe('2000');
      const res = await call('POST', com(FIRM, `bills/${seeded.id}/rebill`), {});
      expect(res.status).toBe(200);
      const invoice = (await call('GET', com(FIRM, `invoices/${res.body.data.invoiceId}`))).body.data;
      expect(invoice).toMatchObject({ status: 'draft', total: '2000.0000', partyId: party(FIRM, 'cu', 'nile') });
      expect(invoice.lines[0].description).toContain('Reimbursement');
      expect((await call('POST', com(FIRM, `bills/${seeded.id}/rebill`), {})).status).toBe(409);
      expect((await call('POST', com(FIRM, 'supplier-credits'), { docId: seeded.id, reason: 'x', amount: '10' })).status).toBe(409);
      expect((await call('POST', com(FIRM, `invoices/${invoice.id}/issue`))).status).toBe(200);
      expect(await glBalance()).toBe('0');
      expect((await recon(FIRM)).reconciled).toBe(true);
      await signInDemo(ACCOUNTANT);
      expect((await call('POST', com(FIRM, `bills/${seeded.id}/rebill`), {})).status).toBe(404);
    });

    it('handles expense claims: receipt reference validated, approved by a different user within the limit, then paid', async () => {
      await signInDemo(ACCOUNTANT);
      const body = { date: '2026-10-10', description: 'DEMO train ticket', categoryId: ec(C1, 'OTHER'), amount: '250', bearer: 'firm', receipt: { name: 'ticket.pdf', size: 1024, type: 'application/pdf' } };
      for (const receipt of [{ name: 'run.exe', size: 10, type: 'application/pdf' }, { name: 'a.pdf', size: 0, type: 'application/pdf' }, { name: 'a.pdf', size: 11 * 1024 * 1024, type: 'application/pdf' }, { name: 'a.pdf', size: 5, type: 'image/png' }, undefined]) {
        expect((await call('POST', com(C1, 'expense-claims'), { ...body, receipt })).body.errors.receipt).toBeTruthy();
      }
      expect((await call('POST', com(C1, 'expense-claims'), { ...body, amount: '0' })).status).toBe(422);
      const claim = (await call('POST', com(C1, 'expense-claims'), body)).body.data;
      expect(claim).toMatchObject({ status: 'submitted', claimantId: 'u-accountant' });
      expect(claim.reference).toMatch(/^EXP-2026-/);
      expect((await call('POST', com(C1, `expense-claims/${claim.id}/approve`))).status).toBe(403);
      expect(((await call('GET', com(C1, 'expense-claims'))).body.data as unknown[]).length).toBe(1);
      await signInDemo(CHIEF);
      expect((await call('POST', com(C1, `expense-claims/${claim.id}/pay`), { accountId: bankOf(C1) })).status).toBe(409);
      const approved = await call('POST', com(C1, `expense-claims/${claim.id}/approve`));
      expect(approved.body.data.status).toBe('approved');
      expect(approved.body.data.journals).toHaveLength(1);
      expect((await call('POST', com(C1, `expense-claims/${claim.id}/pay`), { accountId: acct(C1, '5900') })).status).toBe(422);
      const paid = await call('POST', com(C1, `expense-claims/${claim.id}/pay`), { accountId: bankOf(C1), date: '2026-10-12' });
      expect(paid.body.data.status).toBe('paid');
      expect((await trialBalance(C1)).balanced).toBe(true);
    });

    it('applies four-eyes and the role limit to claims', async () => {
      const body = { date: '2026-10-10', description: 'DEMO conference', categoryId: ec(FIRM, 'OTHER'), amount: '12000', bearer: 'firm', receipt: { name: 'r.png', size: 100, type: 'image/png' } };
      await signInDemo(CHIEF);
      const own = (await call('POST', com(FIRM, 'expense-claims'), body)).body.data;
      expect((await call('POST', com(FIRM, `expense-claims/${own.id}/approve`))).status).toBe(403);
      await signInDemo(OWNER);
      const above = (await call('POST', com(FIRM, 'expense-claims'), { ...body, amount: '10000.01' })).body.data;
      const within = (await call('POST', com(FIRM, 'expense-claims'), { ...body, amount: '10000' })).body.data;
      expect((await call('POST', com(FIRM, `expense-claims/${above.id}/reject`), {})).status).toBe(422);
      expect((await call('POST', com(FIRM, `expense-claims/${above.id}/approve`))).status).toBe(403);
      expect((await call('POST', com(FIRM, `expense-claims/${own.id}/approve`))).body.data.status).toBe('approved');
      await signInDemo(CHIEF);
      expect((await call('POST', com(FIRM, `expense-claims/${above.id}/approve`))).status).toBe(403);
      expect((await call('POST', com(FIRM, `expense-claims/${within.id}/approve`))).body.data.status).toBe('approved');
      expect((await call('POST', com(FIRM, `expense-claims/${above.id}/reject`), { reason: 'Not business related' })).body.data).toMatchObject({ status: 'rejected', decisionNote: 'Not business related' });
    });

    it('creates recurring drafts for invoices and bills, and reports the budget, payment schedule and dashboard numbers', async () => {
      await signInDemo(OWNER);
      const invoiceTemplate = ((await call('GET', com(FIRM, 'recurring-invoices'))).body.data as Array<{ id: string }>)[0];
      const draft = await call('POST', com(FIRM, `recurring-invoices/${invoiceTemplate.id}/create-draft`), { date: '2026-10-31' });
      expect(draft.status).toBe(201);
      expect(draft.body.data).toMatchObject({ status: 'draft', total: '9120.0000' });
      expect((await call('POST', com(FIRM, `recurring-invoices/${invoiceTemplate.id}/create-draft`), {})).status).toBe(422);
      const billTemplate = ((await call('GET', com(FIRM, 'recurring-bills'))).body.data as Array<{ id: string }>)[0];
      expect((await call('POST', com(FIRM, `recurring-bills/${billTemplate.id}/create-draft`), { date: '2026-10-31' })).body.data).toMatchObject({ status: 'draft', total: '12000.0000' });
      const budget = (await call('GET', com(FIRM, 'reports/budget?month=2026-10'))).body.data;
      const other = budget.rows.find((r: { code: string }) => r.code === 'OTHER');
      expect(other).toMatchObject({ budget: '2000.0000', actual: '1500.0000', remaining: '500.0000', over: false });
      const schedule = (await call('GET', com(FIRM, 'reports/payment-schedule?days=30'))).body.data as Array<{ reference: string; bucket: string }>;
      expect(schedule.map((s) => s.bucket)).toEqual(['overdue', 'this_week', 'later', 'later']);
      const summary = (await call('GET', 'commercial-summary')).body.data;
      expect(summary).toMatchObject({ overdueInvoices: 4, billsDueSoon: 1 });
      expect(summary.ledgers.find((l: { ledgerEntityId: string }) => l.ledgerEntityId === FIRM)).toMatchObject({ overdueInvoices: 3, billsDueSoon: 1, outstandingReceivables: '62479.9900' });
      expect(summary.ledgers).toHaveLength(3);
      await signInDemo(ACCOUNTANT);
      const mine = (await call('GET', 'commercial-summary')).body.data;
      expect(mine.ledgers).toHaveLength(1);
    });
  });

  it('runs a quotation from draft through sent and accepted to a draft invoice that keeps the lines', async () => {
    await signInDemo(ACCOUNTANT);
    const q = (await call('POST', com(C1, 'quotations'), { partyId: party(C1, 'cu', 'retailA'), date: '2026-10-01', validUntil: '2026-10-31', lines: [line(C1, { unitPrice: '2000', taxRateId: STD })] })).body.data;
    expect(q).toMatchObject({ status: 'draft', total: '2280.0000' });
    expect(q.reference).toMatch(/^DRAFT-/);
    expect((await call('POST', com(C1, `quotations/${q.id}/convert`))).status).toBe(409);
    expect((await call('POST', com(C1, `quotations/${q.id}/accept`))).status).toBe(409);
    const sent = (await call('POST', com(C1, `quotations/${q.id}/send`))).body.data;
    expect(sent.number).toMatch(/^QT-2026-/);
    expect((await call('POST', com(C1, `quotations/${q.id}/accept`))).body.data.status).toBe('accepted');
    const converted = await call('POST', com(C1, `quotations/${q.id}/convert`));
    expect(converted.status).toBe(201);
    const invoice = (await call('GET', com(C1, `invoices/${converted.body.data.invoiceId}`))).body.data;
    expect(invoice).toMatchObject({ status: 'draft', total: '2280.0000', sourceQuotationId: q.id });
    expect((await call('POST', com(C1, `quotations/${q.id}/convert`))).status).toBe(409);
    expect((await call('POST', com(C1, 'quotations'), { partyId: party(C1, 'cu', 'retailA'), date: '2026-10-10', validUntil: '2026-10-01', lines: [line(C1)] })).body.errors.validUntil).toBeTruthy();
  });

  it('keeps customers in their own ledger, links a customer only to a client the caller may see, and blocks archiving with an open balance', async () => {
    await signInDemo(CHIEF);
    const ok = await call('POST', com(FIRM, 'customers'), { name: 'DEMO linked', clientId: 'c-001', paymentTermsDays: 45 });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ clientId: 'c-001', clientName: 'DEMO Nile Trading Co.', paymentTermsDays: 45, openBalance: '0.0000' });
    expect((await call('POST', com(FIRM, 'customers'), { name: 'x', clientId: 'c-404' })).body.errors.clientId).toBeTruthy();
    expect((await call('POST', com(C1, 'customers'), { name: 'x', clientId: 'c-001' })).body.errors.clientId).toBeTruthy();
    expect((await call('POST', com(FIRM, 'suppliers'), { name: 'x', clientId: 'c-001' })).body.errors.clientId).toBeTruthy();
    expect((await call('POST', com(FIRM, 'customers'), { name: '' })).body.errors.name).toBeTruthy();
    expect((await call('POST', com(FIRM, 'customers'), { name: 'x', email: 'bad' })).body.errors.email).toBeTruthy();
    expect((await call('POST', com(FIRM, 'customers'), { name: 'x', taxRegistrationNo: '12ab' })).body.errors.taxRegistrationNo).toBeTruthy();
    expect((await call('GET', com(C1, `customers/${ok.body.data.id}`))).status).toBe(404);
    expect((await call('PATCH', com(FIRM, `customers/${party(FIRM, 'cu', 'nile')}`), { archived: true })).status).toBe(409);
    const archived = await call('PATCH', com(FIRM, `customers/${ok.body.data.id}`), { archived: true });
    expect(archived.body.data.archived).toBe(true);
    expect((await call('POST', com(FIRM, 'invoices'), invoiceBody(FIRM, { partyId: ok.body.data.id }))).body.errors.partyId).toBeTruthy();
    const names = ((await call('GET', com(FIRM, 'customers'))).body.data as Array<{ name: string }>).map((c) => c.name);
    expect(names).not.toContain('DEMO linked');
    await signInDemo(ACCOUNTANT);
    expect((await call('POST', com(C1, 'suppliers'), { name: 'DEMO supplier' })).status).toBe(201);
  });

  it('manages service types and expense categories per ledger with unique codes and budgets', async () => {
    await signInDemo(CHIEF);
    const service = await call('POST', com(C1, 'service-types'), { code: 'NEW', nameAr: 'خدمة', nameEn: 'New service', recognition: 'deferred_over_period' });
    expect(service.status).toBe(201);
    expect(service.body.data.kind).toBe('standard');
    expect((await call('POST', com(C1, 'service-types'), { code: 'new', nameAr: 'خدمة', nameEn: 'Again', recognition: 'on_issue' })).body.errors.code).toBeTruthy();
    expect((await call('POST', com(C1, 'service-types'), { code: 'BAD', nameAr: 'خ', nameEn: 'x', recognition: 'sometimes' })).status).toBe(422);
    // A new service type has no revenue mapping, so an invoice using it is refused until the mapping is set.
    const draft = (await call('POST', com(C1, 'invoices'), invoiceBody(C1, { lines: [line(C1, { serviceTypeId: service.body.data.id })], servicePeriodStart: '2026-10-01', servicePeriodMonths: 3 }))).body.data;
    const refused = await call('POST', com(C1, `invoices/${draft.id}/issue`));
    expect(refused.body, JSON.stringify([draft, refused])).toBeTruthy();
    expect(refused.body.errors?.mappings, JSON.stringify([draft.status, refused])).toBeTruthy();
    await call('PATCH', com(C1, 'mappings'), { revenueByService: { ...(await call('GET', com(C1, 'mappings'))).body.data.revenueByService, [service.body.data.id]: acct(C1, '4100') } });
    expect((await call('POST', com(C1, `invoices/${draft.id}/issue`))).status).toBe(200);
    const category = await call('POST', com(C1, 'expense-categories'), { code: 'TRAVEL', nameAr: 'سفر', nameEn: 'Travel', monthlyBudget: '1500.5' });
    expect(category.body.data.monthlyBudget).toBe('1500.5000');
    expect((await call('POST', com(C1, 'expense-categories'), { code: 'X2', nameAr: 'س', nameEn: 'x', monthlyBudget: '12.12345' })).body.errors.monthlyBudget).toBeTruthy();
    const cleared = await call('PATCH', com(C1, `expense-categories/${category.body.data.id}`), { monthlyBudget: '' });
    expect(cleared.body.data.monthlyBudget).toBeUndefined();
    expect((await call('PATCH', com(C1, 'service-types/nope'), { nameEn: 'x' })).status).toBe(404);
  });

  it('shrinks the deferred schedule when an unrecognized invoice is credited, and gives a deleted rebill draft its expense back', async () => {
    await signInDemo(CHIEF);
    const retainer = st(FIRM, 'RETAIN');
    const created = (await call('POST', com(FIRM, 'invoices'), invoiceBody(FIRM, { lines: [line(FIRM, { serviceTypeId: retainer, unitPrice: '1200' })], servicePeriodStart: '2026-11-01', servicePeriodMonths: 12 }))).body.data;
    const inv = (await call('POST', com(FIRM, `invoices/${created.id}/issue`))).body.data;
    expect(inv.schedule[0].amount).toBe('100.0000');
    const credited = (await call('POST', com(FIRM, 'credit-notes'), { docId: inv.id, date: '2026-10-12', reason: 'Half cancelled', amount: '600' })).body.data.document;
    expect(credited.schedule.every((r: { amount: string }) => r.amount === '50.0000')).toBe(true);
    expect((await recon(FIRM)).reconciled).toBe(true);
    const seeded = ((await call('GET', com(FIRM, 'bills?pageSize=50'))).body.data as Array<{ id: string; bearer: string }>).find((b) => b.bearer === 'client_reimbursable')!;
    const draft = (await call('POST', com(FIRM, `bills/${seeded.id}/rebill`), {})).body.data.invoiceId;
    expect((await call('DELETE', com(FIRM, `invoices/${draft}`))).status).toBe(204);
    expect((await call('GET', com(FIRM, `bills/${seeded.id}`))).body.data.rebilledInvoiceId).toBeUndefined();
    expect((await call('POST', com(FIRM, `bills/${seeded.id}/rebill`), {})).status).toBe(200);
  });

  it('answers an unknown action or section with 404 and wrong methods with 405 without touching data', async () => {
    await signInDemo(OWNER);
    expect((await call('GET', com(C1, 'nope'))).status).toBe(404);
    const inv = await issued();
    await signInDemo(OWNER);
    expect((await call('POST', com(C1, `invoices/${inv.id}/explode`))).status).toBe(404);
    expect((await call('PUT', com(C1, 'invoices'), {})).status).toBe(405);
    expect((await call('GET', com(C1, `invoices/${inv.id}`))).body.data.status).toBe('issued');
    expect((await call('POST', 'tax-rates/tx-demo-vat-std', {})).status).toBe(405);
  });

  describe('property: random seeded operations keep the books balanced and the subledgers reconciled', () => {
    /** Small deterministic generator (mulberry32): the same seed always replays the same sequence of operations. */
    function mulberry32(seed: number): () => number {
      let a = seed;
      return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    async function run(ledger: string, seed: number, steps: number): Promise<number> {
      const rnd = mulberry32(seed);
      const int = (n: number) => Math.floor(rnd() * n);
      const pick = <T,>(items: readonly T[]): T => items[int(items.length)];
      const cents = (max: number) => {
        const c = 100 + int(max);
        return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
      };
      let current = '';
      const as = async (email: string) => {
        if (current !== email) {
          await signInDemo(email);
          current = email;
        }
      };
      const list = async (path: string) => (await call('GET', com(ledger, `${path}${path.includes('?') ? '&' : '?'}pageSize=100`))).body.data as Array<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const open = (d: Record<string, any>) => ['issued', 'partially_paid', 'overdue', 'approved'].includes(d['status']) && cmp(d['balance'], '0') > 0; // eslint-disable-line @typescript-eslint/no-explicit-any
      const fraction = (balance: string) => mulDiv(balance, String(1 + int(100)), '100', 2);
      await as(OWNER);
      const services = ((await call('GET', com(ledger, 'service-types'))).body.data as Array<{ id: string; kind: string; recognition: string }>).filter((s) => s.kind === 'standard');
      const categories = ((await call('GET', com(ledger, 'expense-categories'))).body.data as Array<{ id: string }>).map((c) => c.id);
      const customers = ((await call('GET', com(ledger, 'customers'))).body.data as Array<{ id: string }>).map((c) => c.id);
      const suppliers = ((await call('GET', com(ledger, 'suppliers'))).body.data as Array<{ id: string }>).map((c) => c.id);
      const accounts = [acct(ledger, '1110'), acct(ledger, '1120')];
      let failures = 0;
      let performed = 0;

      for (let step = 0; step < steps; step++) {
        let res: Res | null = null;
        const drawn = int(11);
        const op = customers.length === 0 && [0, 1, 2, 3, 4, 8, 9].includes(drawn) ? 5 + int(2) : drawn;
        if (op <= 1 || op === 8) {
          await as(OWNER);
          const deferred = op === 8 ? services.find((s) => s.recognition === 'deferred_over_period') : undefined;
          const lines = Array.from({ length: 1 + int(3) }, () => ({ description: 'DEMO random', serviceTypeId: (deferred ?? pick(services.filter((s) => s.recognition === 'on_issue'))).id, qty: pick(['1', '2', '0.333', '3.5']), unitPrice: cents(300000), discount: pick(['0', '0', '5', '12.5']), ...(rnd() < 0.5 ? { taxRateId: STD } : {}) }));
          const created = await call('POST', com(ledger, 'invoices'), { partyId: pick(customers), date: `2026-10-${String(1 + int(12)).padStart(2, '0')}`, termsKind: 'net30', lines, ...(deferred ? { servicePeriodStart: '2026-10-01', servicePeriodMonths: 2 + int(5) } : {}) });
          res = created.status === 201 ? await call('POST', com(ledger, `invoices/${created.body.data.id}/issue`)) : created;
        } else if (op === 2) {
          const invoices = (await list('invoices')).filter(open);
          if (invoices.length) {
            const inv = pick(invoices);
            const alloc = rnd() < 0.3 ? inv['balance'] : fraction(inv['balance']);
            const extra = rnd() < 0.3 ? '12.34' : '0';
            res = await call('POST', com(ledger, 'payments'), { partyId: inv['partyId'], date: '2026-10-12', accountId: pick(accounts), amount: add(alloc, extra), allocations: [{ docId: inv['id'], amount: alloc }] });
          }
        } else if (op === 3) {
          const payment = (await list('payments')).find((p) => cmp(p['unapplied'], '0') > 0);
          if (payment) {
            const invoices = (await list('invoices')).filter((i) => open(i) && i['partyId'] === payment['partyId']);
            if (invoices.length && rnd() < 0.6) res = await call('POST', com(ledger, `payments/${payment['id']}/allocate`), { allocations: [{ docId: invoices[0]['id'], amount: min(payment['unapplied'], invoices[0]['balance']) }] });
            else res = await call('POST', com(ledger, `payments/${payment['id']}/refund`), { amount: mulDiv(payment['unapplied'], '1', '2', 2), accountId: pick(accounts) });
          }
        } else if (op === 4) {
          const invoices = (await list('invoices')).filter(open);
          if (invoices.length) {
            const inv = pick(invoices);
            await as(CHIEF);
            res = await call('POST', com(ledger, 'credit-notes'), { docId: inv['id'], date: '2026-10-12', reason: 'DEMO random credit', amount: rnd() < 0.3 ? inv['balance'] : fraction(inv['balance']) });
          }
        } else if (op === 5) {
          await as(OWNER);
          const created = await call('POST', com(ledger, 'bills'), { partyId: pick(suppliers), date: `2026-10-${String(1 + int(12)).padStart(2, '0')}`, termsKind: 'net15', lines: [{ description: 'DEMO random purchase', categoryId: pick(categories), qty: '1', unitPrice: cents(2000000), discount: '0', ...(rnd() < 0.5 ? { taxRateId: STD } : {}) }] });
          if (created.status === 201) {
            await call('POST', com(ledger, `bills/${created.body.data.id}/submit`));
            await as(CHIEF);
            res = await call('POST', com(ledger, `bills/${created.body.data.id}/approve`));
          } else res = created;
        } else if (op === 6) {
          const bills = (await list('bills')).filter(open);
          if (bills.length) {
            const bill = pick(bills);
            await as(OWNER);
            const alloc = fraction(bill['balance']);
            res = await call('POST', com(ledger, 'bill-payments'), { partyId: bill['partyId'], date: '2026-10-12', accountId: pick(accounts), amount: add(alloc, rnd() < 0.3 ? '5.55' : '0'), allocations: [{ docId: bill['id'], amount: alloc }] });
          }
        } else if (op === 7) {
          const bills = (await list('bills')).filter((b) => open(b) && !b['rebilledInvoiceId']);
          if (bills.length) {
            const bill = pick(bills);
            await as(CHIEF);
            res = await call('POST', com(ledger, 'supplier-credits'), { docId: bill['id'], date: '2026-10-12', reason: 'DEMO random', amount: fraction(bill['balance']) });
          }
        } else if (op === 9) {
          const invoices = (await list('invoices')).filter((i) => (i['schedule'] as unknown[]).some((r) => (r as { status: string }).status === 'pending'));
          if (invoices.length) {
            await as(CHIEF);
            res = await call('POST', com(ledger, `invoices/${pick(invoices)['id']}/recognize`), { upTo: pick(['2026-10-31', '2026-11-30', '2026-12-31', '2027-02-28']) });
          }
        } else {
          await as(OWNER);
          const claim = await call('POST', com(ledger, 'expense-claims'), { date: '2026-10-10', description: 'DEMO random claim', categoryId: pick(categories), amount: cents(900000), bearer: 'firm', receipt: { name: 'r.pdf', size: 2048, type: 'application/pdf' } });
          await as(CHIEF);
          const approved = claim.status === 201 ? await call('POST', com(ledger, `expense-claims/${claim.body.data.id}/approve`)) : claim;
          res = approved.status === 200 ? await call('POST', com(ledger, `expense-claims/${claim.body.data.id}/pay`), { accountId: pick(accounts), date: '2026-10-12' }) : approved;
        }
        if (!res) continue;
        performed++;
        // A refused action (422/409) is fine, but it must never be an authorization or scoping mistake or a crash.
        expect([200, 201, 204, 409, 422], `step ${step} op ${op} -> ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`).toContain(res.status);
        if (res.status >= 400) failures++;
        if (step % 4 === 3 || step === steps - 1) {
          await as(OWNER);
          const tb = await trialBalance(ledger);
          expect(tb.balanced, `trial balance after step ${step} op ${op}`).toBe(true);
          const r = await recon(ledger);
          expect(r.reconciled, `reconciliation after step ${step} op ${op}: ${JSON.stringify(r.rows)}`).toBe(true);
        }
      }
      expect(performed).toBeGreaterThan(steps / 2);
      expect(failures).toBeLessThan(performed / 2);
      return performed;
    }

    it.each([
      [FIRM, 7],
      [FIRM, 2026],
      [C1, 11],
      ['le-c-009', 5],
    ])('ledger %s, seed %i', async (ledger, seed) => {
      await run(ledger, seed, 70);
    }, 60_000);
  });
});
