import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { LedgerContext } from '../accounting/ledger-context';
import { AccountingAnalytics } from './accounting-analytics';
import { ClientsAnalytics } from './clients-analytics';
import { CommercialAnalytics } from './commercial-analytics';
import { EngageAnalytics } from './engage-analytics';
import { DocumentsAnalytics } from './documents-analytics';
import { HrAnalytics } from './hr-analytics';
import { SecurityAnalytics } from './security-analytics';
import { StatementsAnalytics } from './statements-analytics';
import { TasksAnalytics } from './tasks-analytics';
import { TaxAnalytics } from './tax-analytics';

type Module = 'clients' | 'documents' | 'tasks' | 'accounting' | 'receivables' | 'payables' | 'tax' | 'statements' | 'hr' | 'support' | 'security';

interface Tab {
  key: Module;
  icon: string;
  /** Any one of these opens the tab. */
  permissions: string[];
  /** Whether the numbers belong to one ledger (so the ledger picker shows). */
  ledger: boolean;
}

const TABS: readonly Tab[] = [
  { key: 'clients', icon: 'users', permissions: ['clients.view'], ledger: false },
  { key: 'documents', icon: 'folder-open', permissions: ['documents.view'], ledger: false },
  { key: 'tasks', icon: 'list-check', permissions: ['tasks.view'], ledger: false },
  { key: 'accounting', icon: 'book', permissions: ['journals.view', 'ledger.view'], ledger: true },
  { key: 'receivables', icon: 'file-invoice-dollar', permissions: ['invoices.view'], ledger: true },
  { key: 'payables', icon: 'file-invoice', permissions: ['bills.view'], ledger: true },
  { key: 'tax', icon: 'percent', permissions: ['tax.view'], ledger: true },
  { key: 'statements', icon: 'chart-line', permissions: ['reports.view'], ledger: true },
  { key: 'hr', icon: 'people-group', permissions: ['hr.view'], ledger: false },
  { key: 'support', icon: 'comments', permissions: ['tickets.manage', 'appointments.manage'], ledger: false },
  { key: 'security', icon: 'user-shield', permissions: ['audit.view', 'settings.manage'], ledger: false },
];

/** One analytics tab per module of the application. A person sees the tabs for the modules they may open. */
@Component({
  selector: 'app-analytics-layout',
  imports: [TranslatePipe, PageHeader, ClientsAnalytics, DocumentsAnalytics, TasksAnalytics, AccountingAnalytics, CommercialAnalytics, TaxAnalytics, StatementsAnalytics, HrAnalytics, EngageAnalytics, SecurityAnalytics],
  template: `
    <app-page-header [title]="'analytics.title' | translate" />
    <p class="text-body-secondary">{{ 'analytics.intro' | translate }}</p>

    @if (tabs().length === 0) {
      <div class="alert alert-info" role="status">{{ 'analytics.none' | translate }}</div>
    } @else {
      <ul class="nav nav-tabs mb-3 flex-nowrap overflow-auto" role="tablist">
        @for (t of tabs(); track t.key) {
          <li class="nav-item" role="presentation">
            <button type="button" role="tab" class="nav-link text-nowrap" [class.active]="current().key === t.key" [attr.aria-selected]="current().key === t.key" (click)="selected.set(t.key)">
              <i class="fa-solid fa-{{ t.icon }} fa-fw me-1" aria-hidden="true"></i>{{ 'analytics.tabs.' + t.key | translate }}
            </button>
          </li>
        }
      </ul>

      @if (current().ledger) {
        <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
          <label for="an-ledger" class="form-label mb-0">{{ 'analytics.ledger' | translate }}</label>
          <select id="an-ledger" class="form-select w-auto" [value]="ledgers.activeId() ?? ''" (change)="ledgers.select($any($event.target).value)">
            @for (e of ledgers.entities(); track e.id) {
              <option [value]="e.id">{{ e.name }}</option>
            }
          </select>
        </div>
      }

      @switch (current().key) {
        @case ('clients') { <app-clients-analytics /> }
        @case ('documents') { <app-documents-analytics /> }
        @case ('tasks') { <app-tasks-analytics /> }
        @case ('accounting') { <app-accounting-analytics /> }
        @case ('receivables') { <app-commercial-analytics side="ar" /> }
        @case ('payables') { <app-commercial-analytics side="ap" /> }
        @case ('tax') { <app-tax-analytics /> }
        @case ('statements') { <app-statements-analytics /> }
        @case ('hr') { <app-hr-analytics /> }
        @case ('support') { <app-engage-analytics /> }
        @case ('security') { <app-security-analytics /> }
      }
      <p class="small text-body-secondary mt-4 mb-0">{{ 'analytics.footnote' | translate }}</p>
    }
  `,
})
export class AnalyticsLayout {
  private readonly auth = inject(AuthService);
  protected readonly ledgers = inject(LedgerContext);
  protected readonly selected = signal<Module | null>(null);
  protected readonly tabs = computed(() => TABS.filter((t) => t.permissions.some((p) => this.auth.can(p))));
  protected readonly current = computed(() => this.tabs().find((t) => t.key === this.selected()) ?? this.tabs()[0]);

  constructor() {
    this.ledgers.load();
  }
}
