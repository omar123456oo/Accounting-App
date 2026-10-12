import { AuditSink } from './mock-audit-sink';
import { LedgerEntity, LedgerSummary } from '../../features/accounting/accounting.models';
import { MockClients } from './mock-clients';
import { handleCommercial } from './mock-commercial';
import { commercialSummary } from './mock-commercial-reports';
import { handleTaxRates } from './mock-commercial-settings';
import { handleStatements } from './mock-fs';
import { handleAccounts } from './mock-ledger-accounts';
import { seedLedgerStore } from './mock-ledger-data';
import { handleJournals, handleTemplates } from './mock-ledger-journals';
import { handleYears, handlePeriods } from './mock-ledger-periods';
import { handleReports } from './mock-ledger-reports';
import { LedgerCtx, LedgerStore, StoredEntity } from './mock-ledger-store';
import { MockModule, MockRequest, MockResult, fail, need, ok } from './mock-types';
import { DemoUser } from './mock-users';

const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

/**
 * The ledger service. Firm books are visible to office-wide staff only; a client's books follow the client
 * assignment, so books never mix and an unassigned client's ledger answers 404 like any other hidden record.
 */
export class MockLedger implements MockModule {
  readonly store: LedgerStore = seedLedgerStore();

  constructor(
    private readonly clients: MockClients,
    audit: AuditSink,
  ) {
    // Seeding is not a user action and leaves no trail; every request after this is audited.
    this.store.compliance.audit = audit;
  }

  handle(req: MockRequest, user: DemoUser): MockResult {
    if (user.profile.type !== 'staff') return fail(403, 'forbidden');
    const [, first, section, ...rest] = req.path.split('/');
    if (first === 'entities' && req.method === 'GET') return need(user, 'ledger.view') ?? ok({ data: this.visible(user).map((e) => this.entityDto(e)) });
    if (first === 'summary' && req.method === 'GET') return need(user, 'ledger.view') ?? ok({ data: this.summary(user) });
    if (first === 'tax-rates') return handleTaxRates(this.store.commercial, req, user, section);
    if (first === 'commercial-summary' && req.method === 'GET') return this.commercialSummary(req, user);
    const entity = this.visible(user).find((e) => e.id === first);
    if (!entity) return need(user, 'ledger.view') ?? fail(404, 'notFound');
    const ctx: LedgerCtx = { store: this.store, entity, user, req, clients: this.clients };
    return this.idempotent(ctx, section, () => this.route(ctx, section, rest));
  }

  private route(ctx: LedgerCtx, section: string | undefined, rest: string[]): MockResult {
    switch (section) {
      case 'accounts':
        return handleAccounts(ctx, rest);
      case 'fiscal-years':
        return handleYears(ctx);
      case 'periods':
        return handlePeriods(ctx, rest);
      case 'journals':
        return handleJournals(ctx, rest);
      case 'recurring-templates':
        return handleTemplates(ctx, rest);
      case 'reports':
        return handleReports(ctx, rest);
      case 'commercial':
        return handleCommercial(ctx, rest);
      case 'statements':
        return handleStatements(ctx, rest);
      default:
        return fail(404, 'notFound');
    }
  }

  /**
   * Honours the Idempotency-Key on the financial actions. A retry with the same key and body replays the stored
   * response; the same key with a different body is refused (422). Only successful responses are stored.
   */
  private idempotent(ctx: LedgerCtx, section: string | undefined, run: () => MockResult): MockResult {
    const key = ctx.req.idempotencyKey;
    if (!key || ctx.req.method !== 'POST' || (section !== 'journals' && section !== 'recurring-templates' && section !== 'commercial')) return run();
    const slot = `${ctx.user.profile.id}|${ctx.req.path}|${key}`;
    const hash = stable(ctx.req.body);
    const seen = this.store.idempotency.get(slot);
    if (seen) return seen.hash === hash ? structuredClone(seen.result) : fail(422, 'idempotencyConflict');
    const result = run();
    if (result.status >= 200 && result.status < 300) this.store.idempotency.set(slot, { hash, result: structuredClone(result) });
    return result;
  }

  private visible(user: DemoUser): StoredEntity[] {
    return this.store.entities.filter((e) => (e.type === 'firm' ? !!user.officeWide : !!e.clientId && !!this.clients.find(e.clientId, user)));
  }

  private entityDto(e: StoredEntity): LedgerEntity {
    return { id: e.id, type: e.type, ...(e.clientId ? { clientId: e.clientId } : {}), name: e.clientId ? this.clients.clientName(e.clientId) : 'DEMO Accounting Office', functionalCurrency: e.functionalCurrency };
  }

  private commercialSummary(req: MockRequest, user: DemoUser): MockResult {
    const denied = need(user, 'ledger.view');
    if (denied) return denied;
    const ledgers = this.visible(user).map((e) => ({ ctx: { store: this.store, entity: e, user, req, clients: this.clients } as LedgerCtx, type: e.type, name: this.entityDto(e).name }));
    return ok({ data: commercialSummary(ledgers, user) });
  }

  private summary(user: DemoUser): LedgerSummary {
    const canSeeJournals = user.profile.permissions.includes('journals.view');
    const ledgers = this.visible(user).map((e) => ({
      ledgerEntityId: e.id,
      type: e.type,
      name: this.entityDto(e).name,
      awaitingApproval: canSeeJournals ? this.store.journals.filter((j) => j.ledgerEntityId === e.id && j.status === 'pending_approval').length : 0,
      openPeriods: this.store.periods.filter((p) => p.ledgerEntityId === e.id && p.status === 'open').length,
    }));
    return { awaitingApproval: ledgers.reduce((n, l) => n + l.awaitingApproval, 0), openPeriods: ledgers.reduce((n, l) => n + l.openPeriods, 0), ledgers };
  }
}
