import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { downloadCsv } from '../clients/csv';
import { AccountingPeriod, FiscalYear } from '../accounting/accounting.models';
import { AccountingFormat } from '../accounting/accounting-format';
import { LedgerApiService } from '../accounting/ledger-api.service';
import { LedgerContext } from '../accounting/ledger-context';
import { ReportBanner } from '../accounting/reports/report-banner';
import { AuditExportService } from '../audit/audit-export.service';
import { FsApiService } from './fs-api.service';
import { FsFormat } from './fs-format';
import { FsOptions, StatementKind, StatementParams, StatementView } from './fs.models';
import { StatementFilters } from './statement-filters';
import { statementCsv } from './statement-csv';

/**
 * One page for all four statements (the route says which). The numbers come from the server, derived from
 * posted ledger lines; every line expands to its accounts and each account links to the general ledger.
 */
@Component({
  selector: 'app-statement-page',
  imports: [TranslatePipe, RouterLink, PageHeader, StatusBadge, ReportBanner, StatementFilters],
  templateUrl: './statement-page.html',
})
export class StatementPage {
  private readonly api = inject(FsApiService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly exports = inject(AuditExportService);
  protected readonly format = inject(FsFormat);
  protected readonly money = inject(AccountingFormat);
  protected readonly ctx = inject(LedgerContext);
  protected readonly kind = inject(ActivatedRoute).snapshot.data['kind'] as StatementKind;
  private readonly ledgerId = this.ctx.activeId() as string;

  protected readonly periods = signal<AccountingPeriod[]>([]);
  protected readonly years = signal<FiscalYear[]>([]);
  protected readonly options = signal<FsOptions>({ branches: [], costCenters: [] });
  protected readonly view = signal<StatementView | null>(null);
  protected readonly params = signal<StatementParams>({});
  protected readonly failed = signal(false);
  protected readonly loading = signal(false);
  protected readonly open = signal<ReadonlySet<string>>(new Set());

  constructor() {
    const ledger = inject(LedgerApiService);
    if (inject(AuthService).can('ledger.view')) {
      ledger.periods(this.ledgerId).subscribe({ next: (p) => this.periods.set(p), error: () => this.periods.set([]) });
      ledger.fiscalYears(this.ledgerId).subscribe({ next: (y) => this.years.set(y), error: () => this.years.set([]) });
    }
    this.api.options(this.ledgerId).subscribe({ next: (o) => this.options.set(o), error: () => this.options.set({ branches: [], costCenters: [] }) });
  }

  protected run(params: StatementParams): void {
    this.params.set(params);
    this.loading.set(true);
    this.failed.set(false);
    this.open.set(new Set());
    this.api.statement(this.ledgerId, this.kind, params).subscribe({
      next: (v) => {
        this.view.set(v);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected toggle(key: string): void {
    this.open.update((s) => {
      const next = new Set(s);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  protected exportCsv(): void {
    const v = this.view();
    if (!v) return;
    downloadCsv(`${this.kind}-statement.csv`, statementCsv(v, this.money.ledgerLabel(this.ctx.active()), (k, p) => this.translate.instant(k, p), this.language.current()));
    this.exports.log(`statements.${this.kind}`, this.ledgerId);
  }

  protected isRtl(): boolean {
    return this.language.current() === 'ar';
  }

  protected print(): void {
    window.print();
  }
}
