import { ExpenseCategory, ServiceType, TaxRate } from '../../features/commercial/commercial.models';
import { handleCommercial } from './mock-commercial';
import { StoredParty } from './mock-commercial-store';
import { LedgerCtx, LedgerStore } from './mock-ledger-store';
import { DEMO_USERS } from './mock-users';

/**
 * DEMO ONLY. Fictional customers, suppliers, invoices, bills and payments for the three demo ledgers. They are
 * created through the same handlers the API uses (as the demo accountant and chief accountant), so every
 * document has its posted journal, the trial balances stay balanced and the subledgers reconcile.
 * The tax rates are unverified DEMO values, not legal facts: Egyptian rates must be entered and verified by a specialist.
 */
export const DEMO_TAX_RATES: TaxRate[] = [
  { id: 'tx-demo-vat-std', code: 'DEMO-VAT-STD', name: 'DEMO standard rate (unverified)', rate: '14', effectiveFrom: '2020-01-01', jurisdiction: 'EG', legalSource: 'DEMO value for testing only. Not a legal source.', approvalStatus: 'draft', version: 1, history: [], isDemo: true },
  { id: 'tx-demo-vat-zero', code: 'DEMO-VAT-ZERO', name: 'DEMO zero rate (unverified)', rate: '0', effectiveFrom: '2020-01-01', jurisdiction: 'EG', legalSource: 'DEMO value for testing only. Not a legal source.', approvalStatus: 'draft', version: 1, history: [], isDemo: true },
];

const STD = 'tx-demo-vat-std';
const CATEGORIES: Array<[string, string, string, string, string, string]> = [
  ['RENT', 'الإيجار', 'Rent', '12000', '5200', ''],
  ['UTIL', 'المرافق', 'Utilities', '3000', '5300', ''],
  ['FEES', 'الرسوم والأتعاب', 'Fees and charges', '5000', '5400', ''],
  ['BANK', 'مصروفات بنكية', 'Bank charges', '200', '5310', ''],
  ['OTHER', 'مصروفات متنوعة', 'Other expenses', '2000', '5900', ''],
];

type Services = Array<[string, string, string, 'on_issue' | 'deferred_over_period', 'standard' | 'reimbursement', string]>;
const SERVICES: Record<string, Services> = {
  'le-firm': [
    ['BOOK', 'مسك الدفاتر', 'Bookkeeping', 'on_issue', 'standard', '4100'],
    ['CONS', 'استشارات', 'Consulting', 'on_issue', 'standard', '4100'],
    ['RETAIN', 'اشتراك سنوي', 'Annual retainer', 'deferred_over_period', 'standard', '4100'],
    ['REIMB', 'مصروفات مستردة', 'Reimbursed expenses', 'on_issue', 'reimbursement', '1240'],
  ],
  'le-c-001': [
    ['SALES', 'مبيعات', 'Sales', 'on_issue', 'standard', '4200'],
    ['SERV', 'خدمات', 'Services', 'on_issue', 'standard', '4100'],
  ],
  'le-c-009': [['SALES', 'مبيعات', 'Sales', 'on_issue', 'standard', '4200']],
};

const PARTIES: Record<string, Array<[string, 'customer' | 'supplier', string, string | undefined, number]>> = {
  'le-firm': [
    ['nile', 'customer', 'DEMO Nile Trading Co.', 'c-001', 30],
    ['alex', 'customer', 'DEMO Alex Pharmacy', 'c-009', 15],
    ['luxor', 'customer', 'DEMO Luxor Crafts', 'c-011', 60],
    ['walkin', 'customer', 'DEMO Walk-in Customer', undefined, 30],
    ['landlord', 'supplier', 'DEMO Cairo Office Landlord', undefined, 30],
    ['stationery', 'supplier', 'DEMO Stationery House', undefined, 15],
    ['utility', 'supplier', 'DEMO City Utilities', undefined, 30],
    ['court', 'supplier', 'DEMO Court Services', undefined, 30],
  ],
  'le-c-001': [
    ['retailA', 'customer', 'DEMO Retail Customer A', undefined, 30],
    ['wholesale', 'supplier', 'DEMO Wholesale Supplier', undefined, 30],
  ],
  'le-c-009': [['medwholesale', 'supplier', 'DEMO Medicine Wholesaler', undefined, 30]],
};

const clientStub = { find: (id: string) => ({ id, legalName: id }), clientName: (id: string) => id };

/** Fills the commercial store of one ledger. Called while the demo periods are still open, before they are locked. */
export function seedCommercial(store: LedgerStore, ledgerId: string): void {
  const c = store.commercial;
  const key = ledgerId.replace(/^le-/, '');
  if (c.taxRates.length === 0) c.taxRates.push(...structuredClone(DEMO_TAX_RATES));
  const code = (n: string) => store.accountByCode(ledgerId, n)?.id as string;

  const services: ServiceType[] = SERVICES[ledgerId].map(([cd, nameAr, nameEn, recognition, kind]) => ({ id: `st-${key}-${cd}`, ledgerEntityId: ledgerId, code: cd, nameAr, nameEn, recognition, kind }));
  const categories: ExpenseCategory[] = CATEGORIES.map(([cd, nameAr, nameEn, budget]) => ({ id: `ec-${key}-${cd}`, ledgerEntityId: ledgerId, code: cd, nameAr, nameEn, monthlyBudget: `${budget}.0000` }));
  c.serviceTypes.push(...services);
  c.categories.push(...categories);
  const m = c.mappingsOf(ledgerId);
  Object.assign(m, { arControl: code('1210'), apControl: code('2110'), vatOutput: code('2310'), vatInput: code('1410'), deferredRevenue: code('2250'), customerCredit: code('2260'), supplierPrepayment: code('1250'), receivableFromClient: code('1240'), employeePayable: code('2200'), paymentAccounts: [code('1110'), code('1120')] });
  SERVICES[ledgerId].forEach(([cd, , , , , account]) => (m.revenueByService[`st-${key}-${cd}`] = code(account)));
  CATEGORIES.forEach(([cd, , , , account]) => (m.expenseByCategory[`ec-${key}-${cd}`] = code(account)));
  for (const [short, kind, name, clientId, terms] of PARTIES[ledgerId]) {
    const party: StoredParty = { id: `${kind === 'customer' ? 'cu' : 'su'}-${key}-${short}`, ledgerEntityId: ledgerId, kind, name, paymentTermsDays: terms, archived: false, ...(clientId ? { clientId } : {}) };
    c.parties.push(party);
  }

  const entity = store.entities.find((e) => e.id === ledgerId)!;
  const run = (userId: string, method: string, path: string, body: Record<string, unknown> = {}): { id: string; [k: string]: unknown } => {
    const user = DEMO_USERS.find((u) => u.profile.id === userId)!;
    const ctx: LedgerCtx = { store, entity, user, req: { method, path, query: new URLSearchParams(), body }, clients: clientStub };
    const res = handleCommercial(ctx, path.split('/'));
    if (res.status >= 300) throw new Error(`seed ${method} ${path} failed: ${res.status} ${JSON.stringify(res.errors ?? res.error)}`);
    const data = (res.body as { data?: { id: string } } | undefined)?.data;
    return (data ?? { id: '' }) as { id: string };
  };
  const svc = (cd: string) => `st-${key}-${cd}`;
  const cat = (cd: string) => `ec-${key}-${cd}`;
  const line = (description: string, serviceTypeId: string, qty: string, unitPrice: string, extra: Record<string, unknown> = {}) => ({ description, serviceTypeId, qty, unitPrice, discount: '0', ...extra });
  const bline = (description: string, categoryId: string, unitPrice: string, taxRateId?: string) => ({ description, categoryId, qty: '1', unitPrice, discount: '0', ...(taxRateId ? { taxRateId } : {}) });
  const cu = (s: string) => `cu-${key}-${s}`;
  const su = (s: string) => `su-${key}-${s}`;
  const bankId = code('1120');
  const cashId = code('1110');
  const issueInvoice = (body: Record<string, unknown>) => {
    const inv = run('u-accountant', 'POST', 'invoices', body);
    run('u-accountant', 'POST', `invoices/${inv.id}/issue`);
    return inv.id;
  };
  const approveInvoice = (body: Record<string, unknown>) => {
    const inv = run('u-accountant', 'POST', 'invoices', body);
    run('u-accountant', 'POST', `invoices/${inv.id}/submit`);
    run('u-chief', 'POST', `invoices/${inv.id}/approve`);
    return inv.id;
  };
  const approveBill = (body: Record<string, unknown>) => {
    const bill = run('u-accountant', 'POST', 'bills', body);
    run('u-accountant', 'POST', `bills/${bill.id}/submit`);
    run('u-chief', 'POST', `bills/${bill.id}/approve`);
    return bill.id;
  };
  const pay = (path: string, partyId: string, date: string, accountId: string, amount: string, allocations: Array<{ docId: string; amount: string }>, reference: string) => run('u-accountant', 'POST', path, { partyId, date, accountId, amount, allocations, reference });

  if (ledgerId === 'le-firm') {
    const i1 = issueInvoice({ partyId: cu('nile'), date: '2026-02-10', termsKind: 'net30', lines: [line('Bookkeeping, January', svc('BOOK'), '1', '50000', { taxRateId: STD })] });
    pay('payments', cu('nile'), '2026-03-05', bankId, '57000', [{ docId: i1, amount: '57000' }], 'DEMO transfer 1001');
    const i2 = issueInvoice({ partyId: cu('alex'), date: '2026-08-01', termsKind: 'net15', lines: [line('Consulting sessions', svc('CONS'), '4', '5000', { taxRateId: STD })] });
    pay('payments', cu('alex'), '2026-09-15', bankId, '10000', [{ docId: i2, amount: '10000' }], 'DEMO transfer 1002');
    const i3 = issueInvoice({ partyId: cu('nile'), date: '2026-10-01', termsKind: 'net30', lines: [line('Bookkeeping, September', svc('BOOK'), '2', '5555.55', { discount: '10', taxRateId: STD })] });
    run('u-chief', 'POST', 'credit-notes', { docId: i3, date: '2026-10-05', reason: 'DEMO goodwill discount', amount: '1140' });
    const i4 = issueInvoice({ partyId: cu('luxor'), date: '2026-07-01', termsKind: 'net60', servicePeriodStart: '2026-07-01', servicePeriodMonths: 12, lines: [line('Annual retainer 2026/27', svc('RETAIN'), '1', '36000')] });
    run('u-chief', 'POST', `invoices/${i4}/recognize`, { upTo: '2026-09-30' });
    issueInvoice({ partyId: cu('walkin'), date: '2026-05-20', termsKind: 'net30', lines: [line('Tax consultation', svc('CONS'), '1', '3000', { taxRateId: STD })] });
    const pending = run('u-accountant', 'POST', 'invoices', { partyId: cu('nile'), date: '2026-10-09', termsKind: 'net30', lines: [line('Annual audit support', svc('BOOK'), '1', '150000', { taxRateId: STD })] });
    run('u-accountant', 'POST', `invoices/${pending.id}/submit`);
    run('u-accountant', 'POST', 'invoices', { partyId: cu('alex'), date: '2026-10-10', termsKind: 'net15', lines: [line('Payroll service, October', svc('CONS'), '1', '2500')] });
    pay('payments', cu('walkin'), '2026-09-20', cashId, '5000', [], 'DEMO advance');
    run('u-accountant', 'POST', 'recurring-invoices', { name: 'DEMO Monthly bookkeeping retainer', partyId: cu('nile'), termsKind: 'net30', lines: [line('Monthly bookkeeping', svc('BOOK'), '1', '8000', { taxRateId: STD })] });
    const q1 = run('u-accountant', 'POST', 'quotations', { partyId: cu('luxor'), date: '2026-10-02', validUntil: '2026-11-02', lines: [line('Year-end closing package', svc('CONS'), '1', '12000', { taxRateId: STD })] });
    run('u-accountant', 'POST', `quotations/${q1.id}/send`);
    run('u-accountant', 'POST', 'quotations', { partyId: cu('alex'), date: '2026-10-11', validUntil: '2026-11-11', lines: [line('VAT filing support', svc('CONS'), '1', '4000')] });

    const b1 = approveBill({ partyId: su('landlord'), date: '2026-09-20', termsKind: 'net30', supplierInvoiceNo: 'DEMO-L-0920', lines: [bline('Office rent, October', cat('RENT'), '12000')] });
    run('u-chief', 'POST', 'supplier-credits', { docId: b1, date: '2026-10-07', reason: 'DEMO rent adjustment', amount: '500' });
    const b2 = approveBill({ partyId: su('stationery'), date: '2026-10-01', termsKind: 'net15', supplierInvoiceNo: 'DEMO-S-1001', lines: [bline('Paper and toner', cat('OTHER'), '1500', STD)] });
    pay('bill-payments', su('stationery'), '2026-10-05', bankId, '700', [{ docId: b2, amount: '700' }], 'DEMO cheque 501');
    approveBill({ partyId: su('utility'), date: '2026-09-01', termsKind: 'net30', supplierInvoiceNo: 'DEMO-U-0901', lines: [bline('Electricity, August', cat('UTIL'), '2450.40')] });
    approveBill({ partyId: su('court'), date: '2026-09-25', termsKind: 'net30', bearer: 'client_reimbursable', clientId: 'c-001', supplierInvoiceNo: 'DEMO-C-0925', lines: [bline('Commercial registry fees for the client', cat('FEES'), '2000')] });
    const big = run('u-accountant', 'POST', 'bills', { partyId: su('landlord'), date: '2026-10-10', termsKind: 'net30', supplierInvoiceNo: 'DEMO-L-1010', lines: [bline('Office rent, annual deposit', cat('RENT'), '60000')] });
    run('u-accountant', 'POST', `bills/${big.id}/submit`);
    run('u-accountant', 'POST', 'bills', { partyId: su('stationery'), date: '2026-10-11', termsKind: 'net15', lines: [bline('Printer', cat('OTHER'), '3200', STD)] });
    pay('bill-payments', su('landlord'), '2026-09-28', bankId, '3000', [], 'DEMO prepayment');
    run('u-accountant', 'POST', 'recurring-bills', { name: 'DEMO Monthly rent', partyId: su('landlord'), termsKind: 'net30', lines: [bline('Monthly office rent', cat('RENT'), '12000')] });
    const receipt = (name: string) => ({ name, size: 20480, type: 'application/pdf' });
    run('u-accountant', 'POST', 'expense-claims', { date: '2026-10-08', description: 'DEMO taxi to client visit', categoryId: cat('OTHER'), amount: '350', bearer: 'firm', receipt: receipt('taxi-receipt.pdf') });
    const printing = run('u-accountant', 'POST', 'expense-claims', { date: '2026-09-30', description: 'DEMO printing of reports', categoryId: cat('OTHER'), amount: '1200', bearer: 'firm', receipt: receipt('printing-receipt.pdf') });
    run('u-chief', 'POST', `expense-claims/${printing.id}/approve`);
  }

  if (ledgerId === 'le-c-001') {
    const sale = approveInvoice({ partyId: cu('retailA'), date: '2026-03-12', termsKind: 'net30', lines: [line('Goods on credit', svc('SALES'), '1', '100000', { taxRateId: STD })] });
    pay('payments', cu('retailA'), '2026-06-02', bankId, '60000', [{ docId: sale, amount: '60000' }], 'DEMO transfer 2001');
    approveBill({ partyId: su('wholesale'), date: '2026-09-20', termsKind: 'net30', supplierInvoiceNo: 'DEMO-W-0920', lines: [bline('Goods for resale', cat('OTHER'), '4000', STD)] });
  }

  if (ledgerId === 'le-c-009') {
    approveBill({ partyId: su('medwholesale'), date: '2026-09-10', termsKind: 'net30', supplierInvoiceNo: 'DEMO-M-0910', lines: [bline('Medicine stock', cat('OTHER'), '8000')] });
  }
}
