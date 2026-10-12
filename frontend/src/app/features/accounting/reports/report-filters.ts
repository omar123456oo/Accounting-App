import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Account, AccountingPeriod } from '../accounting.models';
import { AccountingFormat } from '../accounting-format';
import { ReportParams } from '../reports-api.service';

/** Date range, optional period shortcut, optional account, and the "include unposted (preview)" switch. */
@Component({
  selector: 'app-report-filters',
  imports: [TranslatePipe],
  template: `
    <form class="row g-2 align-items-end mb-3 no-print" (submit)="run($event)">
      @if (accounts()) {
        <div class="col-12 col-md-4">
          <label for="rep-account" class="form-label">{{ 'accounting.reports.account' | translate }}</label>
          <select id="rep-account" class="form-select" (change)="accountId.set($any($event.target).value)">
            @for (a of postable(); track a.id) {
              <option [value]="a.id" [selected]="a.id === accountId()">{{ a.code }} - {{ format.name(a) }}</option>
            }
          </select>
        </div>
      }
      @if (periods().length > 0) {
        <div class="col-12 col-md-3">
          <label for="rep-period" class="form-label">{{ 'accounting.reports.period' | translate }}</label>
          <select id="rep-period" class="form-select" (change)="choosePeriod($any($event.target).value)">
            <option value="">{{ 'accounting.reports.customRange' | translate }}</option>
            @for (p of periods(); track p.id) {
              <option [value]="p.id">{{ format.date(p.startDate) }} - {{ format.date(p.endDate) }}</option>
            }
          </select>
        </div>
      }
      <div class="col-6 col-md-2">
        <label for="rep-from" class="form-label">{{ 'accounting.journals.from' | translate }}</label>
        <input id="rep-from" type="date" class="form-control" [value]="from()" (input)="from.set($any($event.target).value)" />
      </div>
      <div class="col-6 col-md-2">
        <label for="rep-to" class="form-label">{{ 'accounting.journals.to' | translate }}</label>
        <input id="rep-to" type="date" class="form-control" [value]="to()" (input)="to.set($any($event.target).value)" />
      </div>
      <div class="col-12 col-md-3">
        <div class="form-check">
          <input id="rep-unposted" type="checkbox" class="form-check-input" [checked]="includeUnposted()" (change)="includeUnposted.set($any($event.target).checked)" />
          <label for="rep-unposted" class="form-check-label">{{ 'accounting.reports.includeUnposted' | translate }}</label>
        </div>
      </div>
      <div class="col-12">
        <button type="submit" class="btn btn-secondary">{{ 'accounting.reports.run' | translate }}</button>
      </div>
    </form>
  `,
})
export class ReportFilters implements OnInit {
  readonly accounts = input<readonly Account[] | null>(null);
  readonly periods = input<readonly AccountingPeriod[]>([]);
  readonly initial = input<ReportParams>({});
  readonly runReport = output<ReportParams>();

  protected readonly format = inject(AccountingFormat);
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly includeUnposted = signal(false);
  protected readonly accountId = signal('');
  protected readonly postable = computed(() => (this.accounts() ?? []).filter((a) => a.isPostable));

  ngOnInit(): void {
    const i = this.initial();
    this.from.set(i.from ?? '');
    this.to.set(i.to ?? '');
    this.includeUnposted.set(i.includeUnposted ?? false);
    this.accountId.set(i.accountId ?? this.postable()[0]?.id ?? '');
    this.runReport.emit(this.params());
  }

  protected choosePeriod(id: string): void {
    const p = this.periods().find((x) => x.id === id);
    if (!p) return;
    this.from.set(p.startDate);
    this.to.set(p.endDate);
  }

  protected run(event: Event): void {
    event.preventDefault();
    this.runReport.emit(this.params());
  }

  private params(): ReportParams {
    return { from: this.from(), to: this.to(), includeUnposted: this.includeUnposted(), ...(this.accounts() ? { accountId: this.accountId() } : {}) };
  }
}
