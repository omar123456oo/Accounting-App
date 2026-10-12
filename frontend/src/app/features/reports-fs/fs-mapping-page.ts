import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { apiErrorMessage } from '../../core/http/api-errors';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { AccountingFormat } from '../accounting/accounting-format';
import { LedgerContext } from '../accounting/ledger-context';
import { FsApiService } from './fs-api.service';
import { FsFormat } from './fs-format';
import { FsLineKey, FsMapping, FsMappingAccount, LINES_BY_CATEGORY } from './fs.models';

/** Which statement line each account reports under, per ledger. The starter template is only a starting point. */
@Component({
  selector: 'app-fs-mapping-page',
  imports: [TranslatePipe, PageHeader],
  template: `
    <app-page-header [title]="'fs.tabs.mapping' | translate">
      <button type="button" class="btn btn-primary" [disabled]="busy() || changes() === 0" (click)="save()"><i class="fa-solid fa-floppy-disk me-1" aria-hidden="true"></i>{{ 'common.save' | translate }}</button>
    </app-page-header>
    <div class="alert alert-warning py-2" role="note" id="fs-template-note"><i class="fa-solid fa-triangle-exclamation me-1" aria-hidden="true"></i>{{ 'fs.notCertified' | translate }}</div>
    @if (message(); as m) {
      <div class="alert" [class]="m.ok ? 'alert-success' : 'alert-danger'" [attr.role]="m.ok ? 'status' : 'alert'">{{ m.ok ? ('fs.mapping.savedMsg' | translate) : m.text }}</div>
    }
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (mapping(); as m) {
      @if (m.confirmedBy) {
        <p class="small text-body-secondary">{{ 'fs.mapping.confirmedBy' | translate: { name: m.confirmedBy, at: money.dateTime(m.confirmedAt ?? '') } }}</p>
      } @else {
        <p class="small text-body-secondary">{{ 'fs.mapping.notConfirmed' | translate }}</p>
      }
      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <caption class="visually-hidden">{{ 'fs.tabs.mapping' | translate }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ 'accounting.reports.col.code' | translate }}</th>
              <th scope="col">{{ 'accounting.reports.col.account' | translate }}</th>
              <th scope="col">{{ 'fs.mapping.category' | translate }}</th>
              <th scope="col">{{ 'fs.mapping.line' | translate }}</th>
              <th scope="col">{{ 'fs.mapping.source' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (a of m.accounts; track a.accountId) {
              <tr>
                <td dir="ltr" class="text-start">{{ a.code }}</td>
                <td>{{ money.name(a) }}</td>
                <td>{{ 'accounting.category.' + a.category | translate }}</td>
                <td>
                  <label class="visually-hidden" [for]="'fs-map-' + a.accountId">{{ 'fs.mapping.lineFor' | translate: { name: money.name(a) } }}</label>
                  <select class="form-select form-select-sm" [id]="'fs-map-' + a.accountId" (change)="choose(a, $any($event.target).value)">
                    @for (l of linesFor(a); track l.key) {
                      <option [value]="l.key" [selected]="l.key === current(a)">{{ format.label(l) }}</option>
                    }
                  </select>
                </td>
                <td>{{ (a.fromTemplate && !edits()[a.accountId] ? 'fs.mapping.template' : 'fs.mapping.saved') | translate }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class FsMappingPage {
  private readonly api = inject(FsApiService);
  private readonly ledgerId = inject(LedgerContext).activeId() as string;
  protected readonly money = inject(AccountingFormat);
  protected readonly format = inject(FsFormat);
  protected readonly mapping = signal<FsMapping | null>(null);
  protected readonly edits = signal<Record<string, FsLineKey>>({});
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly changes = computed(() => Object.keys(this.edits()).length);

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.mapping(this.ledgerId).subscribe({ next: (m) => this.mapping.set(m), error: () => this.failed.set(true) });
  }

  protected linesFor(a: FsMappingAccount) {
    const allowed = LINES_BY_CATEGORY[a.category];
    return (this.mapping()?.lines ?? []).filter((l) => allowed.includes(l.key));
  }

  protected current(a: FsMappingAccount): FsLineKey {
    return this.edits()[a.accountId] ?? a.lineKey;
  }

  protected choose(a: FsMappingAccount, key: FsLineKey): void {
    this.edits.update((e) => (key === a.lineKey ? Object.fromEntries(Object.entries(e).filter(([id]) => id !== a.accountId)) : { ...e, [a.accountId]: key }));
  }

  protected save(): void {
    this.busy.set(true);
    this.message.set(null);
    this.api.saveMapping(this.ledgerId, this.edits()).subscribe({
      next: (m) => {
        this.mapping.set(m);
        this.edits.set({});
        this.busy.set(false);
        this.message.set({ ok: true, text: '' });
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.message.set({ ok: false, text: apiErrorMessage(e) ?? '' });
      },
    });
  }
}
