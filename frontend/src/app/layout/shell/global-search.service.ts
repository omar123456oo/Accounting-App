import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { LedgerContext } from '../../features/accounting/ledger-context';
import { JournalsApiService } from '../../features/accounting/journals-api.service';
import { ClientsApiService } from '../../features/clients/clients-api.service';
import { DocumentsApiService } from '../../features/documents/documents-api.service';
import { EngageApiService } from '../../features/engage/engage-api.service';
import { HrApiService } from '../../features/hr/hr-api.service';
import { InvoicingApiService } from '../../features/invoicing/invoicing-api.service';
import { PayablesApiService } from '../../features/payables/payables-api.service';
import { TasksApiService } from '../../features/workflows/tasks-api.service';
import { NAV_ITEMS } from './nav.config';
import { SearchKind, norm, parseQuery, rankHits } from './search-rank';

export type { SearchKind } from './search-rank';

export interface SearchHit {
  kind: SearchKind;
  title: string;
  subtitle?: string;
  route: string;
  query?: Record<string, string>;
}

export interface SearchGroup {
  kind: SearchKind;
  hits: SearchHit[];
}

/** Screens that are not in the sidebar but people look for by name. */
const EXTRA_PAGES: ReadonlyArray<{ labelKey: string; route: string; permission?: string; groupKey?: string }> = [
  { labelKey: 'search.pages.newClient', route: '/app/clients/new', permission: 'clients.create' },
  { labelKey: 'search.pages.newTask', route: '/app/tasks/new', permission: 'tasks.manage' },
  { labelKey: 'search.pages.newJournal', route: '/app/accounting/journals/new', permission: 'journals.create' },
  { labelKey: 'search.pages.newInvoice', route: '/app/invoicing/invoices/new', permission: 'invoices.create' },
  { labelKey: 'search.pages.hrDashboard', route: '/app/hr/dashboard', permission: 'hr.employees.view' },
  { labelKey: 'search.pages.organization', route: '/app/hr/organization', permission: 'hr.employees.view' },
  { labelKey: 'search.pages.contracts', route: '/app/hr/contracts', permission: 'hr.contracts.view' },
  { labelKey: 'search.pages.leave', route: '/app/hr/leave', permission: 'leave.apply' },
  { labelKey: 'search.pages.payroll', route: '/app/hr/payroll', permission: 'payroll.view' },
  { labelKey: 'search.pages.roles', route: '/app/settings/roles', permission: 'settings.manage' },
  { labelKey: 'search.pages.users', route: '/app/settings/users', permission: 'settings.manage' },
];

const LIMIT = 5;

/**
 * One search across the whole application. Every source is limited to what the signed-in person may open, runs in
 * parallel, and a source that fails is simply left out, so one broken module never blocks the rest.
 */
@Injectable({ providedIn: 'root' })
export class GlobalSearchService {
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly clients = inject(ClientsApiService);
  private readonly documents = inject(DocumentsApiService);
  private readonly tasks = inject(TasksApiService);
  private readonly invoices = inject(InvoicingApiService);
  private readonly bills = inject(PayablesApiService);
  private readonly journals = inject(JournalsApiService);
  private readonly hr = inject(HrApiService);
  private readonly engage = inject(EngageApiService);
  private readonly ledgers = inject(LedgerContext);

  /** Needed for invoices, bills and journals, which live in a ledger. */
  prepare(): void {
    if (this.auth.can('ledger.view') && !this.ledgers.loaded()) this.ledgers.load();
  }

  pages(term: string): SearchHit[] {
    const t = norm(term);
    const seen = new Set<string>();
    const hits = [...NAV_ITEMS, ...EXTRA_PAGES]
      .filter((p) => !p.permission || this.auth.can(p.permission))
      .map((p) => ({ route: p.route, title: this.translate.instant(p.labelKey) as string, group: p.groupKey ? (this.translate.instant(p.groupKey) as string) : undefined }))
      .filter((p) => norm(p.title).includes(t) && !seen.has(p.route) && !!seen.add(p.route))
      .map((p): SearchHit => ({ kind: 'page', title: p.title, subtitle: p.group, route: p.route }));
    return rankHits(term, hits).slice(0, LIMIT);
  }

  search(raw: string): Observable<SearchGroup[]> {
    const { term: q, kind: only } = parseQuery(raw);
    if (q.length < 2) return of([]);
    const can = (p: string) => this.auth.can(p);
    const ledger = this.ledgers.activeId();
    const part = <T>(allowed: boolean, kind: SearchKind, source: () => Observable<T[]>, hit: (row: T) => SearchHit): Observable<SearchGroup> =>
      (allowed && (!only || only === kind) ? source() : of([] as T[])).pipe(
        map((rows): SearchGroup => ({ kind, hits: rankHits(q, rows.map(hit)).slice(0, LIMIT) })),
        catchError(() => of<SearchGroup>({ kind, hits: [] })),
      );
    const contains = (...fields: Array<string | undefined>) => fields.some((f) => f && norm(f).includes(norm(q)));

    return forkJoin([
      of<SearchGroup>({ kind: 'page', hits: !only || only === 'page' ? this.pages(q) : [] }),
      part(can('clients.view'), 'client', () => this.clients.list({ q, pageSize: LIMIT }).pipe(map((p) => p.data)), (c) => ({ kind: 'client', title: c.legalName, subtitle: c.tradeName, route: `/app/clients/${c.id}` })),
      part(can('documents.view'), 'document', () => this.documents.list({ q, pageSize: LIMIT }).pipe(map((p) => p.data)), (d) => ({ kind: 'document', title: d.name, subtitle: d.clientName, route: '/app/documents', query: { q } })),
      part(can('tasks.view'), 'task', () => this.tasks.list({ q, pageSize: LIMIT }).pipe(map((p) => p.data)), (t) => ({ kind: 'task', title: t.title, subtitle: t.clientName, route: `/app/tasks/${t.id}` })),
      part(can('invoices.view') && !!ledger, 'invoice', () => this.invoices.list(ledger!, { q, pageSize: LIMIT }).pipe(map((p) => p.data)), (i) => ({ kind: 'invoice', title: i.reference, subtitle: i.partyName, route: `/app/invoicing/invoices/${i.id}` })),
      part(can('bills.view') && !!ledger, 'bill', () => this.bills.list(ledger!, { q, pageSize: LIMIT }).pipe(map((p) => p.data)), (b) => ({ kind: 'bill', title: b.reference, subtitle: b.partyName, route: `/app/payables/bills/${b.id}` })),
      part(can('journals.view') && !!ledger, 'journal', () => this.journals.list(ledger!, { q, pageSize: LIMIT }).pipe(map((p) => p.data)), (j) => ({ kind: 'journal', title: j.reference, subtitle: j.description, route: `/app/accounting/journals/${j.id}` })),
      part(can('hr.view'), 'employee', () => this.hr.employees({ q }), (e) => ({ kind: 'employee', title: e.name, subtitle: e.jobTitle, route: `/app/hr/employees/${e.userId}` })),
      part(can('tickets.manage'), 'ticket', () => this.engage.tickets('staff').pipe(map((rows) => rows.filter((t) => contains(t.subject, t.clientName)))), (t) => ({ kind: 'ticket', title: t.subject, subtitle: t.clientName, route: `/app/tickets/${t.id}` })),
    ]).pipe(map((groups) => groups.filter((g) => g.hits.length > 0)));
  }
}
