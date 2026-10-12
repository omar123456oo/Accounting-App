import { JournalEvent, JournalStatus, JournalType } from '../../features/accounting/accounting.models';
import { normalize } from '../money/money';
import { LedgerStore, StoredJournal } from './mock-ledger-store';

/**
 * DEMO ONLY. Fictional books for the firm and two fictional clients. Every posted entry balances, so each
 * trial balance is non-trivial and balanced. January 2026 is locked in every ledger; February 2026 is closed
 * in the firm ledger. Today (the mock clock) is 2026-10-12.
 */
export const FIRM_LEDGER = 'le-firm';
export const CLIENT_LEDGERS = [
  { id: 'le-c-001', clientId: 'c-001' },
  { id: 'le-c-009', clientId: 'c-009' },
] as const;

/** [date, description, type, lines as [account code, debit, credit]] */
type Posted = [string, string, JournalType, Array<[string, string, string]>];
interface Open {
  status: Extract<JournalStatus, 'draft' | 'pending_approval' | 'approved'>;
  date: string;
  description: string;
  by: string;
  lines: Array<[string, string, string]>;
}

const POSTED: Record<string, Posted[]> = {
  [FIRM_LEDGER]: [
    ['2026-01-02', 'DEMO Opening balances', 'opening', [['1110', '150000', '0'], ['1120', '450000.50', '0'], ['1510', '120000', '0'], ['3100', '0', '720000.50']]],
    ['2026-02-10', 'DEMO Service fees invoiced, February', 'standard', [['1210', '57000', '0'], ['4100', '0', '50000'], ['2310', '0', '7000']]],
    ['2026-03-05', 'DEMO Collection from clients', 'standard', [['1120', '57000', '0'], ['1210', '0', '57000']]],
    ['2026-04-01', 'DEMO Salaries, March', 'standard', [['5100', '80000.25', '0'], ['1120', '0', '80000.25']]],
    ['2026-05-15', 'DEMO Office rent, Q2', 'standard', [['5200', '36000', '0'], ['1120', '0', '36000']]],
    ['2026-09-30', 'DEMO Bank charges, September', 'standard', [['5310', '33.3333', '0'], ['1110', '0', '33.3333']]],
  ],
  'le-c-001': [
    ['2026-01-02', 'DEMO Opening balances', 'opening', [['1110', '25000.10', '0'], ['1120', '310000.20', '0'], ['1300', '90000', '0'], ['3100', '0', '425000.30']]],
    ['2026-03-12', 'DEMO Sales on credit', 'standard', [['1210', '114000', '0'], ['4200', '0', '100000'], ['2310', '0', '14000']]],
    ['2026-04-20', 'DEMO Supplier payment', 'standard', [['5400', '15000', '0'], ['1120', '0', '15000']]],
    ['2026-06-02', 'DEMO Customer receipt', 'standard', [['1120', '60000', '0'], ['1210', '0', '60000']]],
    ['2026-08-31', 'DEMO Salaries, August', 'standard', [['5100', '48000.75', '0'], ['1120', '0', '48000.75']]],
  ],
  'le-c-009': [
    ['2026-01-02', 'DEMO Opening balances', 'opening', [['1110', '8000', '0'], ['1120', '120000', '0'], ['1300', '75000', '0'], ['3100', '0', '203000']]],
    ['2026-05-10', 'DEMO Pharmacy sales, cash', 'standard', [['1110', '22800', '0'], ['4200', '0', '20000'], ['2310', '0', '2800']]],
    ['2026-07-01', 'DEMO Rent', 'standard', [['5200', '18000', '0'], ['1120', '0', '18000']]],
  ],
};

const OPEN: Record<string, Open[]> = {
  [FIRM_LEDGER]: [
    { status: 'draft', date: '2026-10-05', description: 'DEMO Utilities, September (draft)', by: 'u-chief', lines: [['5300', '2450.4', '0'], ['1120', '0', '2450.4']] },
    { status: 'pending_approval', date: '2026-10-08', description: 'DEMO Accrued audit fees', by: 'u-chief', lines: [['5400', '9000', '0'], ['2200', '0', '9000']] },
  ],
  'le-c-001': [
    { status: 'draft', date: '2026-10-03', description: 'DEMO Bank charges, September (draft)', by: 'u-accountant', lines: [['5310', '120.55', '0'], ['1120', '0', '120.55']] },
    { status: 'pending_approval', date: '2026-10-09', description: 'DEMO Equipment purchase (high value)', by: 'u-accountant', lines: [['1510', '75000', '0'], ['1120', '0', '75000']] },
    { status: 'pending_approval', date: '2026-10-10', description: 'DEMO Office supplies', by: 'u-accountant', lines: [['5900', '640', '0'], ['1110', '0', '640']] },
  ],
  'le-c-009': [{ status: 'draft', date: '2026-10-02', description: 'DEMO Electricity (draft)', by: 'u-accountant', lines: [['5300', '1800', '0'], ['1110', '0', '1800']] }],
};

const TEMPLATES: Array<[string, string, Array<[string, string, string]>]> = [
  ['DEMO Monthly rent', 'Monthly office rent', [['5200', '12000', '0'], ['1120', '0', '12000']]],
  ['DEMO Monthly bank charges', 'Monthly bank charges', [['5310', '150', '0'], ['1120', '0', '150']]],
];

function lineOf(store: LedgerStore, ledger: string, [code, debit, credit]: [string, string, string]) {
  const account = store.accountByCode(ledger, code);
  if (!account) throw new Error(`seed account ${code} missing in ${ledger}`);
  return { accountId: account.id, debit: normalize(debit), credit: normalize(credit) };
}

export function seedLedgerStore(): LedgerStore {
  const store = new LedgerStore();
  store.entities.push({ id: FIRM_LEDGER, type: 'firm', functionalCurrency: 'EGP' });
  for (const c of CLIENT_LEDGERS) store.entities.push({ id: c.id, type: 'client', clientId: c.clientId, functionalCurrency: 'EGP' });
  for (const e of store.entities) {
    store.importStarterChart(e.id);
    const year = store.createYear(e.id, 'FY 2026', '2026-01-01', 'Demo Owner', '2026-01-01T08:00:00.000Z');
    const periods = store.periods.filter((p) => p.fiscalYearId === year.id);
    periods[0].status = 'locked';
    periods[0].history.push({ actor: 'Demo Chief Accountant', action: 'locked', at: '2026-02-20T08:00:00.000Z' });
    if (e.id === FIRM_LEDGER) {
      periods[1].status = 'closed';
      periods[1].history.push({ actor: 'Demo Chief Accountant', action: 'closed', at: '2026-03-15T08:00:00.000Z' });
    }
    for (const [date, description, entryType, lines] of POSTED[e.id]) {
      const at = `${date}T09:00:00.000Z`;
      const fy = store.yearOf(store.periodAt(e.id, date)!);
      const number = store.nextNumber(e.id, fy);
      const event = (action: JournalEvent['action'], actorId: string, actor: string, outcome?: string): JournalEvent => ({ action, actorId, actor, at, ...(outcome ? { outcome } : {}) });
      const entry: StoredJournal = {
        id: store.nextId('je'),
        ledgerEntityId: e.id,
        number,
        draftRef: store.newDraftRef(),
        entryType,
        postingDate: date,
        description,
        status: 'posted',
        lines: lines.map((l) => lineOf(store, e.id, l)),
        createdBy: 'u-accountant',
        approvedBy: 'u-chief',
        postedBy: 'u-chief',
        history: [
          event('created', 'u-accountant', 'Demo Accountant'),
          event('submitted', 'u-accountant', 'Demo Accountant'),
          event('approved', 'u-chief', 'Demo Chief Accountant'),
          event('posted', 'u-chief', 'Demo Chief Accountant', number),
        ],
      };
      store.journals.push(entry);
    }
    for (const o of OPEN[e.id]) {
      const at = `${o.date}T10:00:00.000Z`;
      const name = o.by === 'u-chief' ? 'Demo Chief Accountant' : 'Demo Accountant';
      store.journals.push({
        id: store.nextId('je'),
        ledgerEntityId: e.id,
        draftRef: store.newDraftRef(),
        entryType: 'standard',
        postingDate: o.date,
        description: o.description,
        status: o.status,
        lines: o.lines.map((l) => lineOf(store, e.id, l)),
        createdBy: o.by,
        history: [
          { action: 'created', actorId: o.by, actor: name, at },
          ...(o.status === 'draft' ? [] : [{ action: 'submitted' as const, actorId: o.by, actor: name, at }]),
        ],
      });
    }
    for (const [name, description, lines] of TEMPLATES) {
      store.templates.push({ id: store.nextId('rt'), ledgerEntityId: e.id, name, description, lines: lines.map((l) => lineOf(store, e.id, l)) });
    }
  }
  return store;
}
