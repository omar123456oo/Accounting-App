import { Account, AccountingPeriod, FiscalYear, JournalEntry, JournalEvent, JournalLine, JournalStatus, JournalType, RecurringTemplate } from '../../features/accounting/accounting.models';
import { sum } from '../money/money';
import { endOfMonth, firstOfMonthAfter } from './mock-clock';
import { NORMAL_BY_CATEGORY, STARTER_CHART } from './mock-ledger-template';
import { CommercialStore } from './mock-commercial-store';
import { MockRequest, MockResult } from './mock-types';
import { DEMO_USERS, DemoUser } from './mock-users';

export interface StoredEntity {
  id: string;
  type: 'firm' | 'client';
  clientId?: string;
  functionalCurrency: 'EGP';
}

export type StoredAccount = Omit<Account, 'hasPostings'>;

export interface StoredJournal {
  id: string;
  ledgerEntityId: string;
  number?: string;
  draftRef: string;
  entryType: JournalType;
  postingDate: string;
  description: string;
  status: JournalStatus;
  lines: JournalLine[];
  sourceType?: string;
  sourceId?: string;
  createdBy: string;
  approvedBy?: string;
  postedBy?: string;
  reversalOfId?: string;
  reversedById?: string;
  history: JournalEvent[];
}

export interface StoredIdempotency {
  hash: string;
  result: MockResult;
}

export const userName = (id: string): string => DEMO_USERS.find((u) => u.profile.id === id)?.profile.name ?? id;

/** Posted entries are the only ones that count in the books; a reversed entry was posted and stays in them. */
export const isPosted = (j: Pick<StoredJournal, 'status'>): boolean => j.status === 'posted' || j.status === 'reversed';

/** The in-memory "database" of the ledger service. Rules live in the handlers; this only stores and looks things up. */
export class LedgerStore {
  entities: StoredEntity[] = [];
  accounts: StoredAccount[] = [];
  years: FiscalYear[] = [];
  periods: AccountingPeriod[] = [];
  journals: StoredJournal[] = [];
  templates: RecurringTemplate[] = [];
  readonly commercial = new CommercialStore();
  readonly idempotency = new Map<string, StoredIdempotency>();
  private readonly sequences = new Map<string, number>();
  private seq = 1000;

  nextId(prefix: string): string {
    return `${prefix}-${++this.seq}`;
  }

  accountsOf(ledgerId: string): StoredAccount[] {
    return this.accounts.filter((a) => a.ledgerEntityId === ledgerId);
  }

  account(ledgerId: string, id: unknown): StoredAccount | undefined {
    return this.accounts.find((a) => a.ledgerEntityId === ledgerId && a.id === id);
  }

  accountByCode(ledgerId: string, code: string): StoredAccount | undefined {
    return this.accounts.find((a) => a.ledgerEntityId === ledgerId && a.code === code);
  }

  hasPostings(accountId: string): boolean {
    return this.journals.some((j) => isPosted(j) && j.lines.some((l) => l.accountId === accountId));
  }

  /** Adds the starter chart; codes that already exist are left alone. Returns the accounts it created. */
  importStarterChart(ledgerId: string): StoredAccount[] {
    const created: StoredAccount[] = [];
    const key = ledgerId.replace(/^le-/, '');
    for (const t of STARTER_CHART) {
      if (this.accountByCode(ledgerId, t.code)) continue;
      const account: StoredAccount = {
        id: `a-${key}-${t.code}`,
        ledgerEntityId: ledgerId,
        code: t.code,
        nameAr: t.nameAr,
        nameEn: t.nameEn,
        category: t.category,
        ...(t.parent ? { parentId: `a-${key}-${t.parent}` } : {}),
        isPostable: !t.group,
        isActive: true,
        normalBalance: t.contra ? (NORMAL_BY_CATEGORY[t.category] === 'debit' ? 'credit' : 'debit') : NORMAL_BY_CATEGORY[t.category],
      };
      this.accounts.push(account);
      created.push(account);
    }
    return created;
  }

  periodAt(ledgerId: string, date: string): AccountingPeriod | undefined {
    return this.periods.find((p) => p.ledgerEntityId === ledgerId && p.startDate <= date && date <= p.endDate);
  }

  yearOf(period: AccountingPeriod): FiscalYear {
    return this.years.find((y) => y.id === period.fiscalYearId) as FiscalYear;
  }

  /** A fiscal year of twelve monthly periods starting on `startDate` (the first day of any month). */
  createYear(ledgerId: string, name: string, startDate: string, actor: string, at: string): FiscalYear {
    const id = this.nextId('fy');
    const year: FiscalYear = { id, ledgerEntityId: ledgerId, name, startDate, endDate: endOfMonth(firstOfMonthAfter(startDate, 11)), status: 'open' };
    this.years.push(year);
    for (let i = 0; i < 12; i++) {
      const start = firstOfMonthAfter(startDate, i);
      this.periods.push({ id: `${id}-p${i + 1}`, ledgerEntityId: ledgerId, fiscalYearId: id, number: i + 1, startDate: start, endDate: endOfMonth(start), status: 'open', history: [{ actor, action: 'created', at }] });
    }
    return year;
  }

  /** Gapless per ledger and fiscal year: the counter moves only here, at posting. */
  nextNumber(ledgerId: string, year: FiscalYear): string {
    const key = `${ledgerId}|${year.id}`;
    const n = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, n);
    return `JE-${year.startDate.slice(0, 4)}-${String(n).padStart(6, '0')}`;
  }

  newDraftRef(): string {
    return `DRAFT-${String(++this.seq).padStart(5, '0')}`;
  }

  totalDebit(lines: readonly JournalLine[]): string {
    return sum(lines.map((l) => l.debit));
  }
}

/** What every ledger handler receives: the store, the (already scoped) ledger entity, the caller and the request. */
export interface LedgerCtx {
  store: LedgerStore;
  entity: StoredEntity;
  user: DemoUser;
  req: MockRequest;
  /** Client lookup for the commercial module: only clients the caller may see are returned. */
  clients: { find(id: string, user: DemoUser): { id: string; legalName: string } | undefined; clientName(id: string): string };
}
