import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { apiErrorMessage } from '../../../core/http/api-errors';
import { CommentDialog } from '../../../shared/components/comment-dialog/comment-dialog';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { AccountingPeriod, FiscalYear } from '../accounting.models';
import { AccountingFormat, PERIOD_TONE } from '../accounting-format';
import { LedgerApiService } from '../ledger-api.service';
import { LedgerContext } from '../ledger-context';
import { FiscalYearForm } from './fiscal-year-form';

/** Fiscal years and their monthly periods. Closing and locking need periods.manage; reopening needs periods.reopen and a reason. */
@Component({
  selector: 'app-periods-page',
  imports: [TranslatePipe, PageHeader, StatusBadge, HasPermissionDirective, FiscalYearForm, CommentDialog],
  templateUrl: './periods-page.html',
})
export class PeriodsPage {
  private readonly api = inject(LedgerApiService);
  protected readonly format = inject(AccountingFormat);
  protected readonly tone = PERIOD_TONE;
  protected readonly ledgerId = inject(LedgerContext).activeId() as string;

  protected readonly years = signal<FiscalYear[] | null>(null);
  protected readonly periods = signal<AccountingPeriod[]>([]);
  protected readonly selectedYear = signal<string | null>(null);
  protected readonly failed = signal(false);
  protected readonly creating = signal(false);
  protected readonly reopening = signal<AccountingPeriod | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly shown = computed(() => this.periods().filter((p) => p.fiscalYearId === this.selectedYear()));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.failed.set(false);
    this.api.fiscalYears(this.ledgerId).subscribe({
      next: (years) => {
        this.years.set(years);
        if (!years.some((y) => y.id === this.selectedYear())) this.selectedYear.set(years[0]?.id ?? null);
        this.api.periods(this.ledgerId).subscribe({ next: (p) => this.periods.set(p), error: () => this.failed.set(true) });
      },
      error: () => this.failed.set(true),
    });
  }

  protected created(): void {
    this.creating.set(false);
    this.selectedYear.set(null);
    this.load();
  }

  protected change(period: AccountingPeriod, action: 'close' | 'lock' | 'reopen', reason?: string): void {
    this.reopening.set(null);
    this.error.set(null);
    this.busy.set(true);
    this.api.changePeriod(this.ledgerId, period.id, action, reason).subscribe({
      next: () => {
        this.busy.set(false);
        this.load();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }

  protected last(period: AccountingPeriod) {
    return period.history[period.history.length - 1];
  }
}
