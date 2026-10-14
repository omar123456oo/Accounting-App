import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { IncomeTaxCalc, OfficialRecord, TaxReturn, VatCalc } from '../../features/tax/tax.models';
import { add, sub, sum } from '../money/money';
import { mockHttpProviders, signInDemo } from '../../testing/test-utils';
import { applyOfficialResponse, isRealLookingResponse, NullEtaClient } from './mock-eta';

const BASE = '/api/v1/staff/ledger';
const FIRM = 'le-firm';
const C1 = 'le-c-001';

interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

describe('mock tax API', () => {
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
  const ret = (r: Res): TaxReturn => r.body.data;
  const pdf = (name = 'evidence.pdf') => new File(['%PDF-1.4 DEMO evidence'], name, { type: 'application/pdf' });

  async function create(ledger: string, kind: string, start: string, end: string, as = 'accountant@demo.test'): Promise<TaxReturn> {
    await signInDemo(as);
    const r = await call('POST', `${ledger}/tax/returns`, { kind, periodStart: start, periodEnd: end });
    expect(r.status).toBe(201);
    return ret(r);
  }

  async function issueInvoice(ledger: string, date: string, price: string): Promise<void> {
    await signInDemo('accountant@demo.test');
    const key = ledger.replace('le-', '');
    const inv = await call('POST', `${ledger}/commercial/invoices`, { partyId: `cu-${key}-retailA`, date, termsKind: 'net30', lines: [{ description: 'DEMO extra', serviceTypeId: `st-${key}-SALES`, qty: '1', unitPrice: price, discount: '0', taxRateId: 'tx-demo-vat-std' }] });
    expect(inv.status).toBe(201);
    expect((await call('POST', `${ledger}/commercial/invoices/${inv.body.data.id}/issue`)).status).toBe(200);
  }

  it('seeds a prepared VAT return that reconciles with the tax control accounts', async () => {
    await signInDemo('tax@demo.test');
    const list = await call('GET', `${FIRM}/tax/returns`);
    const vat = (list.body.data as TaxReturn[]).find((r) => r.kind === 'vat')!;
    expect(vat.state).toBe('prepared');
    expect(vat.locked).toBe(false);
    const full = ret(await call('GET', `${FIRM}/tax/returns/${vat.id}`));
    const calc = full.calc as VatCalc;
    expect(calc.reconciliation.reconciled).toBe(true);
    expect(calc.reconciliation.output.returnAmount).toBe(calc.reconciliation.output.ledgerAmount);
    expect(calc.reconciliation.input.returnAmount).toBe(calc.reconciliation.input.ledgerAmount);
    expect(calc.outputTax).toBe(sub(sum(calc.transactions.filter((t) => t.source === 'invoice').map((t) => t.tax)), sum(calc.transactions.filter((t) => t.source === 'credit_note').map((t) => t.tax))));
    expect(calc.netTax).toBe(sub(calc.outputTax, calc.inputTax));
    expect(calc.transactions.some((t) => t.source === 'credit_note')).toBe(true);
    expect(calc.unverifiedRates).toBe(true);
  });

  it('computes VAT exactly from the snapshots and matches the ledger on every seed ledger period', async () => {
    await signInDemo('owner@demo.test');
    for (const [ledger, start, end] of [[C1, '2026-03-01', '2026-03-31'], [C1, '2026-09-01', '2026-09-30'], [FIRM, '2026-02-01', '2026-02-28'], [FIRM, '2026-08-01', '2026-08-31']]) {
      const r = await call('POST', `${ledger}/tax/returns`, { kind: 'vat', periodStart: start, periodEnd: end });
      expect(r.status).toBe(201);
      expect((ret(r).calc as VatCalc).reconciliation.reconciled).toBe(true);
    }
    // The seeded pharmacy sale was posted by a manual journal straight to the VAT account: the return cannot see it.
    const manual = ret(await call('POST', 'le-c-009/tax/returns', { kind: 'vat', periodStart: '2026-05-01', periodEnd: '2026-05-31' }));
    const gap = (manual.calc as VatCalc).reconciliation;
    expect(gap.reconciled).toBe(false);
    expect(gap.output).toMatchObject({ returnAmount: '0', ledgerAmount: '2800', difference: '2800' });
    const march = (await call('GET', `${C1}/tax/returns?kind=vat`)).body.data.find((r: TaxReturn) => r.periodStart === '2026-03-01') as TaxReturn;
    const calc = ret(await call('GET', `${C1}/tax/returns/${march.id}`)).calc as VatCalc;
    expect(calc.outputTax).toBe('14000');
    expect(calc.outputNet).toBe('100000');
    const sept = ret(await call('GET', `${C1}/tax/returns/${(await call('GET', `${C1}/tax/returns?kind=vat`)).body.data.find((r: TaxReturn) => r.periodStart === '2026-09-01').id}`)).calc as VatCalc;
    expect(sept.inputTax).toBe('560');
    expect(sept.netTax).toBe('-560');
  });

  it('shows a difference when a manual journal touches the tax control account', async () => {
    await signInDemo('accountant@demo.test');
    const j = await call('POST', `${C1}/journals`, { entryType: 'standard', postingDate: '2026-10-05', description: 'DEMO manual VAT', lines: [{ accountId: 'a-c-001-2310', debit: '0', credit: '123.45' }, { accountId: 'a-c-001-5900', debit: '123.45', credit: '0' }] });
    await call('POST', `${C1}/journals/${j.body.data.id}/submit`);
    await signInDemo('chief@demo.test');
    await call('POST', `${C1}/journals/${j.body.data.id}/approve`);
    expect((await call('POST', `${C1}/journals/${j.body.data.id}/post`)).status).toBe(200);
    const r = await create(C1, 'vat', '2026-10-01', '2026-10-31', 'chief@demo.test');
    const calc = r.calc as VatCalc;
    expect(calc.reconciliation.reconciled).toBe(false);
    expect(calc.reconciliation.output.difference).toBe('123.45');
  });

  it('enforces four-eyes on review and approval, and freezes the calculation on approval', async () => {
    const r = await create(C1, 'vat', '2026-08-01', '2026-08-31', 'tax@demo.test');
    expect((await call('POST', `${C1}/tax/returns/${r.id}/review`)).status).toBe(403);
    expect((await call('POST', `${C1}/tax/returns/${r.id}/approve`)).status).toBe(409);
    await signInDemo('chief@demo.test');
    expect(ret(await call('POST', `${C1}/tax/returns/${r.id}/review`)).state).toBe('reviewed');
    await signInDemo('tax@demo.test');
    expect((await call('POST', `${C1}/tax/returns/${r.id}/approve`)).status).toBe(403);
    await signInDemo('chief@demo.test');
    const approved = ret(await call('POST', `${C1}/tax/returns/${r.id}/approve`));
    expect(approved.state).toBe('approved');
    expect(approved.locked).toBe(true);
    const before = (approved.calc as VatCalc).outputTax;
    // A later invoice dated in the approved period never changes the approved return.
    await issueInvoice(C1, '2026-08-20', '1000');
    const again = ret(await call('GET', `${C1}/tax/returns/${r.id}`));
    expect((again.calc as VatCalc).outputTax).toBe(before);
    expect((await call('POST', `${C1}/tax/returns/${r.id}/recalculate`)).status).toBe(409);
    // The amendment is a new version linked to the original and sees the new invoice.
    await signInDemo('tax@demo.test');
    const amended = ret(await call('POST', `${C1}/tax/returns/${r.id}/amend`));
    expect(amended.version).toBe(2);
    expect(amended.amendsReturnId).toBe(r.id);
    expect(amended.state).toBe('prepared');
    expect((amended.calc as VatCalc).outputTax).toBe(add(before, '140'));
    expect(ret(await call('GET', `${C1}/tax/returns/${r.id}`)).supersededById).toBe(amended.id);
    expect((await call('POST', `${C1}/tax/returns`, { kind: 'vat', periodStart: '2026-08-01', periodEnd: '2026-08-31' })).status).toBe(409);
    expect(amended.history.map((h) => h.action)).toContain('amendment_created');
  });

  it('keeps the rule version a return used: later rule edits never change an approved return', async () => {
    await signInDemo('tax@demo.test');
    const r = await create(FIRM, 'income_tax', '2026-01-01', '2026-12-31', 'tax@demo.test');
    const calc = r.calc as IncomeTaxCalc;
    expect(calc.rule?.percent).toBe('10');
    expect((await call('PUT', `${FIRM}/tax/returns/${r.id}/worksheet`, { adjustments: [{ label: 'DEMO non-deductible', direction: 'add', amount: '1000' }] })).status).toBe(200);
    await signInDemo('chief@demo.test');
    expect((await call('POST', `${FIRM}/tax/returns/${r.id}/review`)).status).toBe(200);
    const approved = ret(await call('POST', `${FIRM}/tax/returns/${r.id}/approve`));
    const frozen = approved.calc as IncomeTaxCalc;
    expect(frozen.adjustmentsAdd).toBe('1000');
    expect(frozen.taxableBase).toBe(add(frozen.profit, '1000'));
    await signInDemo('tax@demo.test');
    expect((await call('PATCH', 'tax-settings/rule-sets/rs-demo-income', { percent: '25' })).status).toBe(200);
    const after = ret(await call('GET', `${FIRM}/tax/returns/${r.id}`)).calc as IncomeTaxCalc;
    expect(after.rule?.percent).toBe('10');
    expect(after.rule?.version).toBe(1);
    expect(after.taxAmount).toBe(frozen.taxAmount);
    const next = await create(C1, 'income_tax', '2026-01-01', '2026-12-31', 'tax@demo.test');
    expect((next.calc as IncomeTaxCalc).rule).toMatchObject({ percent: '25', version: 2 });
  });

  it('has no rate unless the user configures one: an income tax return needs a rule before review', async () => {
    await signInDemo('tax@demo.test');
    expect((await call('PATCH', 'tax-settings/rule-sets/rs-demo-income', { approvalStatus: 'retired' })).status).toBe(200);
    const r = await create('le-c-009', 'income_tax', '2026-01-01', '2026-12-31', 'tax@demo.test');
    expect((r.calc as IncomeTaxCalc).rule).toBeNull();
    expect((r.calc as IncomeTaxCalc).taxAmount).toBeNull();
    await signInDemo('chief@demo.test');
    expect((await call('POST', `le-c-009/tax/returns/${r.id}/review`)).status).toBe(422);
  });

  it('never lets an API call mark a return submitted or accepted', async () => {
    const r = await create(C1, 'vat', '2026-07-01', '2026-07-31', 'tax@demo.test');
    await signInDemo('chief@demo.test');
    await call('POST', `${C1}/tax/returns/${r.id}/review`);
    await signInDemo('owner@demo.test');
    await call('POST', `${C1}/tax/returns/${r.id}/approve`);
    await call('POST', `${C1}/tax/returns/${r.id}/ready`);
    const submit = await call('POST', `${C1}/tax/returns/${r.id}/submit`);
    expect(submit.status).toBe(409);
    expect(submit.body.message).toMatch(/ETA/);
    for (const to of ['submitted', 'accepted']) expect((await call('POST', `${C1}/tax/returns/${r.id}/transition`, { to })).status).toBe(409);
    for (const state of ['submitted', 'accepted']) expect((await call('PATCH', `${C1}/tax/returns/${r.id}`, { state })).status).toBe(409);
    expect((await call('PATCH', `${C1}/tax/returns/${r.id}`, { submission: { status: 'accepted' } })).status).toBe(409);
    expect((await call('PATCH', `${C1}/tax/returns/${r.id}`, { state: 'prepared' })).status).toBe(403);
    const now = ret(await call('GET', `${C1}/tax/returns/${r.id}`));
    expect(now.submission.status).toBe('not_submitted');
    expect(now.submission.official).toBeUndefined();
    expect(now.submitBlocked).toBe('etaNotConfigured');
  });

  it('records a manual outcome only with a reference, evidence and the recorder name, and keeps it "recorded manually"', async () => {
    const r = await create(C1, 'vat', '2026-06-01', '2026-06-30', 'tax@demo.test');
    const form = (fields: Record<string, string | File>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(fields)) f.append(k, v);
      return f;
    };
    const full = { outcome: 'accepted', referenceNo: 'PORTAL-REF-1', recordedByName: 'Demo Tax Specialist', evidence: pdf() };
    expect((await call('POST', `${C1}/tax/returns/${r.id}/record-outcome`, form(full))).status).toBe(409);
    await signInDemo('chief@demo.test');
    await call('POST', `${C1}/tax/returns/${r.id}/review`);
    await signInDemo('owner@demo.test');
    await call('POST', `${C1}/tax/returns/${r.id}/approve`);
    await call('POST', `${C1}/tax/returns/${r.id}/ready`);
    await signInDemo('tax@demo.test');
    for (const missing of ['referenceNo', 'recordedByName', 'evidence']) {
      const copy = { ...full } as Record<string, string | File>;
      delete copy[missing];
      const res = await call('POST', `${C1}/tax/returns/${r.id}/record-outcome`, form(copy));
      expect(res.status).toBe(422);
    }
    const bad = await call('POST', `${C1}/tax/returns/${r.id}/record-outcome`, form({ ...full, evidence: new File(['MZ binary'], 'x.pdf', { type: 'application/pdf' }) }));
    expect(bad.status).toBe(422);
    await signInDemo('accountant@demo.test');
    expect((await call('POST', `${C1}/tax/returns/${r.id}/record-outcome`, form(full))).status).toBe(403);
    await signInDemo('tax@demo.test');
    const ok = ret(await call('POST', `${C1}/tax/returns/${r.id}/record-outcome`, form(full)));
    expect(ok.submission.status).toBe('recorded_manually');
    expect(ok.submission.manual).toMatchObject({ referenceNo: 'PORTAL-REF-1', recordedByName: 'Demo Tax Specialist', outcome: 'accepted' });
    expect(ok.submission.manual?.evidence.sha256).toBeTruthy();
    expect(ok.submission.official).toBeUndefined();
    expect((await call('POST', `${C1}/tax/returns/${r.id}/record-outcome`, form(full))).status).toBe(409);
  });

  it('attaches supporting documents through the upload validation', async () => {
    const r = await create(C1, 'withholding', '2026-10-01', '2026-10-31');
    const good = new FormData();
    good.append('file', pdf('invoice-copy.pdf'));
    good.append('name', 'Supplier invoice copy');
    const added = ret(await call('POST', `${C1}/tax/returns/${r.id}/attachments`, good));
    expect(added.attachments[0]).toMatchObject({ name: 'Supplier invoice copy', mimeType: 'application/pdf' });
    const bad = new FormData();
    bad.append('file', new File(['x'], 'run.exe', { type: 'application/octet-stream' }));
    expect((await call('POST', `${C1}/tax/returns/${r.id}/attachments`, bad)).status).toBe(422);
    expect((await call('POST', `${C1}/tax/returns/${r.id}/attachments`, new FormData())).status).toBe(422);
  });

  it('accepts an official state only from a real-looking adapter response, and the null client refuses to submit', () => {
    expect(new NullEtaClient().submit()).toEqual({ ok: false, reason: 'etaNotConfigured' });
    const target: { official?: OfficialRecord } = {};
    const ref = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
    expect(applyOfficialResponse(target, { status: 'accepted', reference: 'not-a-uuid', rawResponse: '{"uuid":"not-a-uuid"}', receivedAt: '2026-10-12T10:00:00Z' })).toBe(false);
    expect(applyOfficialResponse(target, { status: 'accepted', reference: ref, rawResponse: 'not json', receivedAt: '2026-10-12T10:00:00Z' })).toBe(false);
    expect(applyOfficialResponse(target, { status: 'accepted', reference: ref, rawResponse: '{"uuid":"other"}', receivedAt: '2026-10-12T10:00:00Z' })).toBe(false);
    expect(applyOfficialResponse(target, { status: 'accepted', reference: ref, rawResponse: `{"uuid":"${ref}"}`, receivedAt: 'yesterday' })).toBe(false);
    expect(applyOfficialResponse(target, { status: 'simulated_accepted', reference: ref, rawResponse: `{"uuid":"${ref}"}`, receivedAt: '2026-10-12T10:00:00Z' })).toBe(false);
    expect(target.official).toBeUndefined();
    const good = { status: 'accepted', reference: ref, rawResponse: `{"uuid":"${ref}"}`, receivedAt: '2026-10-12T10:00:00Z' };
    expect(isRealLookingResponse(good)).toBe(true);
    expect(applyOfficialResponse(target, good)).toBe(true);
    expect(target.official).toMatchObject({ status: 'accepted', reference: ref });
  });

  it('scopes returns to the visible ledger (404) and to permissions (403)', async () => {
    await signInDemo('accountant@demo.test');
    expect((await call('GET', `${FIRM}/tax/returns`)).status).toBe(404);
    expect((await call('GET', `${C1}/tax/returns`)).status).toBe(200);
    await signInDemo('auditor@demo.test');
    expect((await call('GET', `${FIRM}/tax/returns`)).status).toBe(200);
    expect((await call('POST', `${FIRM}/tax/returns`, { kind: 'vat', periodStart: '2026-05-01', periodEnd: '2026-05-31' })).status).toBe(403);
    expect((await call('POST', 'tax-settings/rule-sets', {})).status).toBe(403);
    expect((await call('PUT', `${FIRM}/tax/profile`, {})).status).toBe(403);
    await signInDemo('tax@demo.test');
    const other = (await call('GET', `${FIRM}/tax/returns`)).body.data[0] as TaxReturn;
    expect((await call('GET', `${C1}/tax/returns/${other.id}`)).status).toBe(404);
  });

  it('keeps rules as data with a source, dates and verification, and versions every change', async () => {
    await signInDemo('tax@demo.test');
    const overview = (await call('GET', 'tax-settings')).body.data;
    expect(overview.unverified).toBe(true);
    expect(overview.calendarRules.every((r: { isDemo: boolean; approvalStatus: string }) => r.isDemo && r.approvalStatus === 'draft')).toBe(true);
    expect((await call('POST', 'tax-settings/calendar-rules', { obligationTypeId: 'ot-demo-vat', recurrence: 'monthly', dueDayOffset: '20', effectiveFrom: '2026-01-01', approvalStatus: 'draft' })).status).toBe(422);
    expect((await call('POST', 'tax-settings/calendar-rules', { obligationTypeId: 'ot-demo-vat', recurrence: 'monthly', dueDayOffset: '20', effectiveFrom: '2026-01-01', legalSource: 'Specialist note', approvalStatus: 'professionally_verified' })).status).toBe(422);
    const created = await call('POST', 'tax-settings/calendar-rules', { obligationTypeId: 'ot-demo-vat', recurrence: 'monthly', dueDayOffset: '20', effectiveFrom: '2026-01-01', legalSource: 'Specialist note', approvalStatus: 'professionally_verified', lastVerifiedAt: '2026-10-01' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ version: 1, isDemo: false });
    const patched = await call('PATCH', `tax-settings/calendar-rules/${created.body.data.id}`, { dueDayOffset: '25' });
    expect(patched.body.data).toMatchObject({ version: 2, dueDayOffset: 25 });
    // The newer rule wins for the same obligation and period.
    const deadlines = (await call('GET', `${FIRM}/tax/deadlines`)).body.data as Array<{ obligationKind: string; ruleId: string; periodStart: string }>;
    expect(deadlines.filter((d) => d.obligationKind === 'vat' && d.periodStart === '2026-10-01').every((d) => d.ruleId === created.body.data.id)).toBe(true);
  });

  it('lists deadlines by the mock clock, with an overdue one, and logs reminders only', async () => {
    await signInDemo('tax@demo.test');
    const list = (await call('GET', `${FIRM}/tax/deadlines`)).body.data as Array<{ id: string; status: string; dueDate: string; obligationKind: string; periodStart: string; responsibleName: string; reminders: unknown[] }>;
    const overdue = list.find((d) => d.status === 'overdue' && d.obligationKind === 'vat')!;
    expect(overdue.dueDate < '2026-10-12').toBe(true);
    expect(overdue.responsibleName).toBe('Demo Accountant');
    expect(list.every((d) => d.status === 'overdue' === d.dueDate < '2026-10-12' || d.status === 'done')).toBe(true);
    const october = list.find((d) => d.obligationKind === 'vat' && d.periodStart === '2026-10-01')!;
    expect(october.status).toBe('upcoming');
    const reminded = await call('POST', `${FIRM}/tax/deadlines/remind`, { deadlineId: overdue.id, note: 'call the client' });
    expect(reminded.body.data.reminders).toEqual([expect.objectContaining({ delivery: 'logged_only', note: 'call the client' })]);
    await signInDemo('auditor@demo.test');
    expect((await call('POST', `${FIRM}/tax/deadlines/remind`, { deadlineId: overdue.id })).status).toBe(403);
  });

  it('records withholding linked to a payment, with totals per period and no seeded rate', async () => {
    await signInDemo('tax@demo.test');
    const all = await call('GET', `${FIRM}/tax/withholding`);
    expect(all.body.meta.totals).toMatchObject({ deductedByUs: '35', deductedByCustomer: '500', count: 2 });
    const oct = await call('GET', `${FIRM}/tax/withholding?from=2026-10-01&to=2026-10-31`);
    expect(oct.body.meta.totals.count).toBe(1);
    expect(oct.body.data[0].paymentNumber).toBeTruthy();
    const payment = (await call('GET', `${FIRM}/commercial/bill-payments`)).body.data[0];
    const rec = await call('POST', `${FIRM}/tax/withholding`, { date: '2026-10-09', direction: 'deducted_by_us', counterparty: 'DEMO Court Services', paymentId: payment.id, baseAmount: '333.33', ratePercent: '3' });
    expect(rec.status).toBe(201);
    expect(rec.body.data.amount).toBe('9.9999');
    expect((await call('POST', `${FIRM}/tax/withholding`, { date: '2026-10-09', direction: 'deducted_by_us', counterparty: 'x', baseAmount: '100', ratePercent: '' })).status).toBe(422);
    expect((await call('POST', `${FIRM}/tax/withholding`, { date: '2026-10-09', direction: 'deducted_by_us', counterparty: 'x', baseAmount: '100', ratePercent: '5', paymentId: 'nope' })).status).toBe(422);
    const r = await create(FIRM, 'withholding', '2026-10-01', '2026-10-31', 'tax@demo.test');
    expect((r.calc as { totals: { deductedByUs: string } }).totals.deductedByUs).toBe('44.9999');
  });

  it('saves a per-client tax profile with identifiers, a regime label and assigned obligations', async () => {
    await signInDemo('tax@demo.test');
    const before = (await call('GET', `${C1}/tax/profile`)).body.data;
    expect(before).toMatchObject({ clientId: 'c-001', registrationNo: '900000000' });
    const saved = await call('PUT', `${C1}/tax/profile`, { registrationNo: '900000000', regimeLabel: 'Label only', identifiers: [{ label: 'Branch code (DEMO)', value: 'B1' }], obligations: [{ obligationTypeId: 'ot-demo-wht', responsibleUserId: 'u-tax', active: true }] });
    expect(saved.status).toBe(200);
    expect(saved.body.data.obligations).toHaveLength(1);
    expect((await call('PUT', `${C1}/tax/profile`, { registrationNo: '', identifiers: [], obligations: [] })).status).toBe(422);
    expect((await call('PUT', `${C1}/tax/profile`, { registrationNo: '1', identifiers: [], obligations: [{ obligationTypeId: 'nope', responsibleUserId: 'u-tax' }] })).status).toBe(422);
  });

  it('summarises deadlines and returns across visible ledgers, for users who hold tax.view only', async () => {
    await signInDemo('tax@demo.test');
    const s = (await call('GET', 'compliance-summary')).body.data;
    expect(s.ledgers.length).toBeGreaterThan(0);
    for (const k of ['deadlines7', 'deadlines30', 'overdue', 'returnsAwaitingReview', 'periodsReadyToClose']) {
      expect(s[k]).toBe(s.ledgers.reduce((n: number, l: Record<string, number>) => n + l[k], 0));
    }
    expect(s.deadlines30).toBeGreaterThanOrEqual(s.deadlines7);
    await signInDemo('client@demo.test');
    expect((await call('GET', 'compliance-summary')).status).toBeGreaterThanOrEqual(401);
  });
});
