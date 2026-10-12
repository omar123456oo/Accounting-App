import {
  AccountMappings,
  Bill,
  CommercialSettings,
  CreditNote,
  ExpenseCategory,
  ExpenseClaim,
  Invoice,
  Party,
  Payment,
  Quotation,
  RecurringDoc,
  ServiceType,
  TaxRate,
} from '../../features/commercial/commercial.models';

export type StoredParty = Omit<Party, 'creditBalance' | 'openBalance' | 'clientName'>;

/** Revenue booked by a posted journal of an invoice: positive when recognized, negative when credited. */
export interface RevenueEvent {
  date: string;
  serviceTypeId: string;
  amount: string;
}

/** `schedule` holds the recognized installments only; pending ones are planned on demand. */
export type StoredInvoice = Invoice & { revenueEvents: RevenueEvent[] };
export type StoredBill = Bill;
export type StoredQuotation = Quotation;
export type StoredClaim = ExpenseClaim;

/**
 * The in-memory "database" of the commercial module. Tax rates are global (they are law, not ledger data);
 * everything else belongs to exactly one ledger entity and is looked up through it, so ledger scoping holds.
 */
type StoredSettings = Omit<CommercialSettings, 'today'>;

export class CommercialStore {
  taxRates: TaxRate[] = [];
  settings = new Map<string, StoredSettings>();
  mappings = new Map<string, AccountMappings>();
  serviceTypes: ServiceType[] = [];
  categories: ExpenseCategory[] = [];
  parties: StoredParty[] = [];
  quotations: StoredQuotation[] = [];
  invoices: StoredInvoice[] = [];
  bills: StoredBill[] = [];
  creditNotes: CreditNote[] = [];
  payments: Payment[] = [];
  recurring: RecurringDoc[] = [];
  claims: StoredClaim[] = [];
  private seq = 5000;
  private readonly sequences = new Map<string, number>();

  nextId(prefix: string): string {
    return `${prefix}-${++this.seq}`;
  }

  newDraftRef(prefix: string): string {
    return `DRAFT-${prefix}-${String(++this.seq).padStart(5, '0')}`;
  }

  /**
   * Gapless per ledger, fiscal year and document type: the counter moves only here, and callers call this
   * only after every check that could fail has passed, so a failed action never consumes a number.
   */
  nextNumber(ledgerId: string, type: string, year: string, prefix: string): string {
    const key = `${ledgerId}|${type}|${year}`;
    const n = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, n);
    return `${prefix}-${year}-${String(n).padStart(6, '0')}`;
  }

  settingsOf(ledgerId: string): StoredSettings {
    let s = this.settings.get(ledgerId);
    if (!s) {
      s = { ledgerEntityId: ledgerId, allowDraftRates: true };
      this.settings.set(ledgerId, s);
    }
    return s;
  }

  mappingsOf(ledgerId: string): AccountMappings {
    let m = this.mappings.get(ledgerId);
    if (!m) {
      m = { ledgerEntityId: ledgerId, revenueByService: {}, expenseByCategory: {}, paymentAccounts: [] };
      this.mappings.set(ledgerId, m);
    }
    return m;
  }

  party(ledgerId: string, id: unknown, kind?: 'customer' | 'supplier'): StoredParty | undefined {
    return this.parties.find((p) => p.ledgerEntityId === ledgerId && p.id === id && (!kind || p.kind === kind));
  }

  invoice(ledgerId: string, id: unknown): StoredInvoice | undefined {
    return this.invoices.find((i) => i.ledgerEntityId === ledgerId && i.id === id);
  }

  bill(ledgerId: string, id: unknown): StoredBill | undefined {
    return this.bills.find((b) => b.ledgerEntityId === ledgerId && b.id === id);
  }

  payment(ledgerId: string, id: unknown): Payment | undefined {
    return this.payments.find((p) => p.ledgerEntityId === ledgerId && p.id === id);
  }

  serviceType(ledgerId: string, id: unknown): ServiceType | undefined {
    return this.serviceTypes.find((s) => s.ledgerEntityId === ledgerId && s.id === id);
  }

  category(ledgerId: string, id: unknown): ExpenseCategory | undefined {
    return this.categories.find((c) => c.ledgerEntityId === ledgerId && c.id === id);
  }
}
