import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AccountingPeriod, FiscalYear } from '../accounting/accounting.models';
import { AccountingFormat } from '../accounting/accounting-format';
import { FsOptions, StatementParams } from './fs.models';

/** Range or fiscal year, optional comparative range, branch / cost-centre slice, and the posted-only vs preview switch. */
@Component({
  selector: 'app-statement-filters',
  imports: [TranslatePipe],
  template: `
    <form class="card card-body mb-3 no-print" (submit)="run($event)">
      <div class="row g-2 align-items-end">
        @if (years().length > 0) {
          <div class="col-12 col-md-3">
            <label for="fs-year" class="form-label">{{ 'fs.fiscalYear' | translate }}</label>
            <select id="fs-year" class="form-select" (change)="chooseYear($any($event.target).value)">
              <option value="">{{ 'accounting.reports.customRange' | translate }}</option>
              @for (y of years(); track y.id) {
                <option [value]="y.id">{{ y.name }}</option>
              }
            </select>
          </div>
        }
        @if (periods().length > 0) {
          <div class="col-12 col-md-3">
            <label for="fs-period" class="form-label">{{ 'accounting.reports.period' | translate }}</label>
            <select id="fs-period" class="form-select" (change)="choosePeriod($any($event.target).value)">
              <option value="">{{ 'accounting.reports.customRange' | translate }}</option>
              @for (p of periods(); track p.id) {
                <option [value]="p.id">{{ format.date(p.startDate) }} - {{ format.date(p.endDate) }}</option>
              }
            </select>
          </div>
        }
        <div class="col-6 col-md-3">
          <label for="fs-from" class="form-label">{{ 'accounting.journals.from' | translate }}</label>
          <input id="fs-from" type="date" class="form-control" [value]="from()" (input)="from.set($any($event.target).value)" />
        </div>
        <div class="col-6 col-md-3">
          <label for="fs-to" class="form-label">{{ 'accounting.journals.to' | translate }}</label>
          <input id="fs-to" type="date" class="form-control" [value]="to()" (input)="to.set($any($event.target).value)" />
        </div>
        <div class="col-12">
          <div class="form-check">
            <input id="fs-compare" type="checkbox" class="form-check-input" [checked]="compare()" (change)="compare.set($any($event.target).checked)" />
            <label for="fs-compare" class="form-check-label">{{ 'fs.compare' | translate }}</label>
          </div>
        </div>
        @if (compare()) {
          <div class="col-6 col-md-3">
            <label for="fs-cfrom" class="form-label">{{ 'fs.compareFrom' | translate }}</label>
            <input id="fs-cfrom" type="date" class="form-control" [value]="compareFrom()" (input)="compareFrom.set($any($event.target).value)" />
          </div>
          <div class="col-6 col-md-3">
            <label for="fs-cto" class="form-label">{{ 'fs.compareTo' | translate }}</label>
            <input id="fs-cto" type="date" class="form-control" [value]="compareTo()" (input)="compareTo.set($any($event.target).value)" />
          </div>
        }
        @if (options().branches.length > 0) {
          <div class="col-6 col-md-3">
            <label for="fs-branch" class="form-label">{{ 'fs.branch' | translate }}</label>
            <select id="fs-branch" class="form-select" (change)="branch.set($any($event.target).value)">
              <option value="">{{ 'fs.all' | translate }}</option>
              @for (b of options().branches; track b) {
                <option [value]="b">{{ b }}</option>
              }
            </select>
          </div>
        }
        @if (options().costCenters.length > 0) {
          <div class="col-6 col-md-3">
            <label for="fs-cc" class="form-label">{{ 'fs.costCenter' | translate }}</label>
            <select id="fs-cc" class="form-select" (change)="costCenter.set($any($event.target).value)">
              <option value="">{{ 'fs.all' | translate }}</option>
              @for (c of options().costCenters; track c) {
                <option [value]="c">{{ c }}</option>
              }
            </select>
          </div>
        }
        <div class="col-12 col-md-6">
          <div class="form-check">
            <input id="fs-unposted" type="checkbox" class="form-check-input" [checked]="includeUnposted()" (change)="includeUnposted.set($any($event.target).checked)" />
            <label for="fs-unposted" class="form-check-label">{{ 'accounting.reports.includeUnposted' | translate }}</label>
          </div>
        </div>
        <div class="col-12">
          <button type="submit" class="btn btn-secondary"><i class="fa-solid fa-play me-1" aria-hidden="true"></i>{{ 'accounting.reports.run' | translate }}</button>
        </div>
      </div>
    </form>
  `,
})
export class StatementFilters implements OnInit {
  readonly periods = input<readonly AccountingPeriod[]>([]);
  readonly years = input<readonly FiscalYear[]>([]);
  readonly options = input<FsOptions>({ branches: [], costCenters: [] });
  readonly initial = input<StatementParams>({});
  readonly runReport = output<StatementParams>();

  protected readonly format = inject(AccountingFormat);
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly compare = signal(false);
  protected readonly compareFrom = signal('');
  protected readonly compareTo = signal('');
  protected readonly branch = signal('');
  protected readonly costCenter = signal('');
  protected readonly includeUnposted = signal(false);
  private readonly lookup = computed(() => new Map(this.years().map((y) => [y.id, y])));

  ngOnInit(): void {
    const i = this.initial();
    this.from.set(i.from ?? '');
    this.to.set(i.to ?? '');
    this.includeUnposted.set(i.includeUnposted ?? false);
    this.runReport.emit(this.params());
  }

  protected chooseYear(id: string): void {
    const y = this.lookup().get(id);
    if (!y) return;
    this.from.set(y.startDate);
    this.to.set(y.endDate);
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

  private params(): StatementParams {
    return {
      from: this.from(),
      to: this.to(),
      includeUnposted: this.includeUnposted(),
      ...(this.compare() && this.compareFrom() && this.compareTo() ? { compareFrom: this.compareFrom(), compareTo: this.compareTo() } : {}),
      ...(this.branch() ? { branch: this.branch() } : {}),
      ...(this.costCenter() ? { costCenter: this.costCenter() } : {}),
    };
  }
}
