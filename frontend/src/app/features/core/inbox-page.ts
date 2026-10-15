import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { apiErrorMessage } from '../../core/http/api-errors';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { WorkflowApiService } from './workflow-api.service';
import { AppNotification, Delegation, InboxItem, Person } from './workflow.models';

const today = (): string => new Date().toISOString().slice(0, 10);

/** What is waiting for me, who may act for me, and what I have been told. */
@Component({
  selector: 'app-inbox-page',
  imports: [FormsModule, RouterLink, TranslatePipe, PageHeader, DatePipe],
  template: `
    <app-page-header [title]="'core.inbox.title' | translate" />

    @if (loadFailed()) {
      <div class="alert alert-danger" role="alert">{{ 'core.loadFailed' | translate }}</div>
    } @else if (items(); as list) {
      <section class="mb-4" aria-labelledby="in-wait">
        <h2 class="h5" id="in-wait">{{ 'core.inbox.waiting' | translate }}</h2>
        @if (list.length === 0) { <p class="text-body-secondary">{{ 'core.inbox.none' | translate }}</p> } @else {
          <div class="table-responsive"><table class="table align-middle">
            <caption class="visually-hidden">{{ 'core.inbox.waiting' | translate }}</caption>
            <thead><tr><th scope="col">{{ 'core.records.name' | translate }}</th><th scope="col">{{ 'core.inbox.record' | translate }}</th><th scope="col">{{ 'core.workflow.status' | translate }}</th><th scope="col">{{ 'core.inbox.actions' | translate }}</th><th scope="col">{{ 'core.inbox.since' | translate }}</th></tr></thead>
            <tbody>
              @for (i of list; track i.doctype + i.name) {
                <tr>
                  <td><a [routerLink]="i.route" dir="ltr">{{ i.name }}</a></td>
                  <td>{{ i.title }} <span class="text-body-secondary small">{{ i.doctypeLabel }}</span></td>
                  <td><span class="badge text-bg-primary">{{ i.stateLabel ?? i.state }}</span></td>
                  <td>{{ actionLabels(i) }}</td>
                  <td>{{ i.since | date: 'medium' }}</td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </section>

      <section class="mb-4" aria-labelledby="in-del">
        <h2 class="h5" id="in-del">{{ 'core.inbox.delegations' | translate }}</h2>
        <p class="text-body-secondary small">{{ 'core.inbox.delegationsHint' | translate }}</p>
        @for (d of delegations(); track d.id) {
          <div class="d-flex align-items-center gap-2 mb-1">
            <span>{{ d.toName ?? d.toUserId }}</span><span class="text-body-secondary small" dir="ltr">{{ d.startDate }} → {{ d.endDate }}</span>
            <button type="button" class="btn btn-outline-danger btn-sm" (click)="endDelegation(d)">{{ 'core.inbox.endDelegation' | translate }}<span class="visually-hidden"> {{ d.toName }}</span></button>
          </div>
        }
        <form class="row g-2 align-items-end mt-1" (ngSubmit)="addDelegation()">
          <div class="col-md-4"><label class="form-label" for="dg-to">{{ 'core.inbox.person' | translate }}</label>
            <select id="dg-to" name="to" class="form-select" [ngModel]="to()" (ngModelChange)="to.set($event)"><option value=""></option>@for (u of people(); track u.id) { <option [value]="u.id">{{ u.name }}</option> }</select></div>
          <div class="col-md-3"><label class="form-label" for="dg-from">{{ 'core.inbox.from' | translate }}</label><input id="dg-from" name="from" type="date" class="form-control" dir="ltr" [ngModel]="start()" (ngModelChange)="start.set($event)" /></div>
          <div class="col-md-3"><label class="form-label" for="dg-end">{{ 'core.inbox.until' | translate }}</label><input id="dg-end" name="end" type="date" class="form-control" dir="ltr" [ngModel]="end()" (ngModelChange)="end.set($event)" /></div>
          <div class="col-md-2"><button type="submit" class="btn btn-outline-primary w-100">{{ 'core.inbox.delegate' | translate }}</button></div>
        </form>
        @if (delegationError(); as e) { <div class="alert alert-danger mt-2" role="alert">{{ e }}</div> }
      </section>

      <section aria-labelledby="in-notes">
        <h2 class="h5" id="in-notes">{{ 'core.inbox.notifications' | translate }}</h2>
        @if (notes().length === 0) { <p class="text-body-secondary">{{ 'core.inbox.noNotifications' | translate }}</p> }
        <ul class="list-group">
          @for (n of notes(); track n.id) {
            <li class="list-group-item d-flex justify-content-between align-items-start" [class.fw-semibold]="!n.readAt">
              <div>
                @if (n.link) { <a [routerLink]="n.link" (click)="read(n)">{{ n.title }}</a> } @else { {{ n.title }} }
                @if (n.body) { <div class="small text-body-secondary">{{ n.body }}</div> }
                <div class="small text-body-secondary">{{ n.createdAt | date: 'medium' }}</div>
              </div>
              @if (!n.readAt) { <button type="button" class="btn btn-outline-secondary btn-sm" (click)="read(n)">{{ 'core.inbox.markRead' | translate }}</button> }
            </li>
          }
        </ul>
      </section>
    } @else {
      <p role="status">{{ 'common.loading' | translate }}</p>
    }
  `,
})
export class InboxPage {
  private readonly api = inject(WorkflowApiService);
  private readonly translate = inject(TranslateService);

  protected readonly items = signal<InboxItem[] | null>(null);
  protected readonly delegations = signal<Delegation[]>([]);
  protected readonly notes = signal<AppNotification[]>([]);
  protected readonly people = signal<Person[]>([]);
  protected readonly loadFailed = signal(false);
  protected readonly delegationError = signal<string | null>(null);
  protected readonly to = signal('');
  protected readonly start = signal(today());
  protected readonly end = signal(today());

  constructor() {
    forkJoin({ items: this.api.inbox(), delegations: this.api.delegations(), notes: this.api.notifications() }).subscribe({
      next: (r) => { this.items.set(r.items); this.delegations.set(r.delegations); this.notes.set(r.notes); },
      error: () => this.loadFailed.set(true),
    });
    this.api.people().subscribe({ next: (p) => this.people.set(p), error: () => undefined });
  }

  protected actionLabels(i: InboxItem): string { return i.actions.map((a) => a.label).join(', '); }

  protected addDelegation(): void {
    this.delegationError.set(null);
    this.api.addDelegation({ toUserId: this.to(), startDate: this.start(), endDate: this.end() }).subscribe({
      next: (d) => { this.delegations.update((l) => [d, ...l]); this.to.set(''); },
      error: (e) => this.delegationError.set(apiErrorMessage(e) ?? (this.translate.instant('core.saveFailed') as string)),
    });
  }

  protected endDelegation(d: Delegation): void {
    this.api.endDelegation(d.id).subscribe({ next: () => this.delegations.update((l) => l.filter((x) => x.id !== d.id)), error: (e) => this.delegationError.set(apiErrorMessage(e)) });
  }

  protected read(n: AppNotification): void {
    if (n.readAt) return;
    this.api.markRead(n.id).subscribe(() => this.notes.update((l) => l.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))));
  }
}
