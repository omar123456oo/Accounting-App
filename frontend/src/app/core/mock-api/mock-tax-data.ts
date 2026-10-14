import { CalendarRule, ObligationType, RuleSet, WithholdingRecord } from '../../features/tax/tax.models';
import { createReturn } from './mock-tax-returns';
import { LedgerCtx, LedgerStore } from './mock-ledger-store';
import { DEMO_USERS } from './mock-users';

/**
 * DEMO ONLY. Every rule below is a clearly marked placeholder in draft status: the obligation names, the due-day
 * offsets and the percentage are NOT legal facts. A qualified Egyptian tax specialist must enter and verify the
 * real values (legal source, effective dates, verification date) before anything built on them is relied upon.
 */
const DEMO_SOURCE = 'DEMO value for testing only. Not a legal source.';
const meta = { legalSource: DEMO_SOURCE, effectiveFrom: '2020-01-01', approvalStatus: 'draft' as const, version: 1, isDemo: true };

const TYPES: ObligationType[] = [
  { id: 'ot-demo-vat', code: 'DEMO-VAT', nameAr: 'إقرار ضريبة القيمة المضافة (تجريبي)', nameEn: 'VAT return (demo)', kind: 'vat', isDemo: true },
  { id: 'ot-demo-wht', code: 'DEMO-WHT', nameAr: 'إقرار ضريبة الخصم (تجريبي)', nameEn: 'Withholding return (demo)', kind: 'withholding', isDemo: true },
  { id: 'ot-demo-inc', code: 'DEMO-INC', nameAr: 'إقرار ضريبة الدخل (تجريبي)', nameEn: 'Income tax return (demo)', kind: 'income_tax', isDemo: true },
  { id: 'ot-demo-other', code: 'DEMO-OTHER', nameAr: 'التزام آخر (تجريبي)', nameEn: 'Other obligation (demo)', kind: 'other', isDemo: true },
];

const CALENDAR: CalendarRule[] = [
  { id: 'cr-demo-vat', obligationTypeId: 'ot-demo-vat', recurrence: 'monthly', dueDayOffset: 15, ...meta },
  { id: 'cr-demo-wht', obligationTypeId: 'ot-demo-wht', recurrence: 'monthly', dueDayOffset: 10, ...meta },
  { id: 'cr-demo-inc', obligationTypeId: 'ot-demo-inc', recurrence: 'annual', dueDayOffset: 120, ...meta },
  { id: 'cr-demo-other', obligationTypeId: 'ot-demo-other', recurrence: 'quarterly', dueDayOffset: 20, ...meta },
];

const RULE_SETS: RuleSet[] = [{ id: 'rs-demo-income', code: 'DEMO-INCOME-RATE', name: 'DEMO income tax percentage (placeholder)', kind: 'income_tax_rate', percent: '10', ...meta }];

const PROFILES: Record<string, { registrationNo: string; obligations: Array<[string, string]> }> = {
  'le-firm': { registrationNo: 'DEMO-FIRM-0001', obligations: [['ot-demo-vat', 'u-accountant'], ['ot-demo-wht', 'u-accountant'], ['ot-demo-inc', 'u-chief']] },
  'le-c-001': { registrationNo: '900000000', obligations: [['ot-demo-vat', 'u-accountant'], ['ot-demo-inc', 'u-chief']] },
  'le-c-009': { registrationNo: '900000008', obligations: [['ot-demo-vat', 'u-accountant']] },
};

export function seedTax(store: LedgerStore, ledgerId: string): void {
  const c = store.compliance;
  if (c.obligationTypes.length === 0) {
    c.obligationTypes.push(...structuredClone(TYPES));
    c.calendarRules.push(...structuredClone(CALENDAR));
    c.ruleSets.push(...structuredClone(RULE_SETS));
  }
  const p = PROFILES[ledgerId];
  c.profiles.set(ledgerId, {
    ledgerEntityId: ledgerId,
    registrationNo: p.registrationNo,
    regimeLabel: 'DEMO regime label (not a legal classification)',
    identifiers: [{ label: 'Commercial register (DEMO)', value: `DEMO-CR-${ledgerId.slice(3)}` }],
    obligations: p.obligations.map(([obligationTypeId, responsibleUserId]) => ({ obligationTypeId, responsibleUserId, active: true })),
    updatedAt: '2026-01-05T09:00:00.000Z',
    updatedBy: 'Demo Chief Accountant',
  });
  if (ledgerId !== 'le-firm') return;
  const entity = store.entities.find((e) => e.id === ledgerId)!;
  const accountant = DEMO_USERS.find((u) => u.profile.id === 'u-accountant')!;
  const ctx: LedgerCtx = { store, entity, user: accountant, req: { method: 'POST', path: '', query: new URLSearchParams(), body: {} }, clients: { find: (id) => ({ id, legalName: id }), clientName: (id) => id } };
  // A VAT return for October 2026, prepared from the seeded invoices and bills: it reconciles with the ledger.
  createReturn(ctx, 'vat', '2026-10-01', '2026-10-31');
  const pay = (side: 'ar' | 'ap', date: string) => store.commercial.payments.find((x) => x.ledgerEntityId === ledgerId && x.side === side && x.date === date);
  const ap = pay('ap', '2026-10-05');
  const ar = pay('ar', '2026-03-05');
  const rows: Array<Omit<WithholdingRecord, 'id' | 'ledgerEntityId' | 'createdByName'>> = [
    { date: '2026-10-05', direction: 'deducted_by_us', counterparty: 'DEMO Stationery House', ...(ap ? { paymentId: ap.id, paymentNumber: ap.number } : {}), baseAmount: '700.0000', ratePercent: '5', amount: '35.0000', note: 'DEMO entry: the percentage was typed in for the demo.' },
    { date: '2026-03-05', direction: 'deducted_by_customer', counterparty: 'DEMO Nile Trading Co.', ...(ar ? { paymentId: ar.id, paymentNumber: ar.number } : {}), baseAmount: '50000.0000', ratePercent: '1', amount: '500.0000', certificateNo: 'DEMO-CERT-1', note: 'DEMO entry: the percentage was typed in for the demo.' },
  ];
  for (const r of rows) c.withholding.push({ id: c.nextId('wht'), ledgerEntityId: ledgerId, createdByName: 'Demo Accountant', ...r });
}
