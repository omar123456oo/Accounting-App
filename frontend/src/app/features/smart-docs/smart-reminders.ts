import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-errors';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { ReminderRuleEditor } from './reminder-rule-editor';
import { SmartDocsApi } from './smart-docs-api.service';
import { Delivery, DocTypeDef, Lookups, ReminderJob, ReminderRule, SmartConfig } from './smart-docs.models';

type Tab = 'upcoming' | 'failed' | 'rules' | 'history';

/** Everything about reminders in one place: what is coming, what failed (and can be retried), the rules, and who was told. */
@Component({
  selector: 'app-smart-reminders',
  imports: [RouterLink, TranslatePipe, PageHeader, DatePipe, ReminderRuleEditor, ConfirmDialog],
  template: `
    <app-page-header [title]="'smartDocs.reminders.title' | translate">
      @if (tab() === 'rules' && auth.can('documents.manage')) { <button type="button" class="btn btn-primary" (click)="edit(null)">{{ 'smartDocs.rules.new' | translate }}</button> }
    </app-page-header>
    @if (config()?.scheduler?.inProcess === false) { <div class="alert alert-info" role="status">{{ 'smartDocs.reminders.cron' | translate }}</div> }
    @if (error(); as e) { <div class="alert alert-danger" role="alert">{{ e }}</div> }

    <ul class="nav nav-tabs mb-3" role="tablist" [attr.aria-label]="'smartDocs.reminders.title' | translate">
      @for (t of tabs; track t) { <li class="nav-item" role="presentation"><button type="button" class="nav-link" role="tab" [class.active]="tab() === t" [attr.aria-selected]="tab() === t" (click)="select(t)">{{ 'smartDocs.reminders.tab.' + t | translate }}</button></li> }
    </ul>

    @switch (tab()) {
      @case ('rules') {
        <div class="table-responsive"><table class="table align-middle">
          <caption class="visually-hidden">{{ 'smartDocs.reminders.tab.rules' | translate }}</caption>
          <thead><tr><th scope="col">{{ 'smartDocs.rules.name' | translate }}</th><th scope="col">{{ 'smartDocs.rules.scope' | translate }}</th><th scope="col">{{ 'smartDocs.rules.timing' | translate }}</th><th scope="col">{{ 'smartDocs.rules.channels' | translate }}</th><th scope="col">{{ 'smartDocs.rules.active' | translate }}</th><th scope="col"></th></tr></thead>
          <tbody>
            @for (r of rules(); track r.id) {
              <tr>
                <td>{{ r.name }}@if (r.description) { <div class="small text-body-secondary">{{ r.description }}</div> }</td>
                <td>{{ 'smartDocs.reminders.scope.' + r.scope | translate }}@if (r.typeKey) { · {{ r.typeKey }} }</td>
                <td>{{ r.dateField }} · {{ offsets(r) }}@if (r.recurring) { · {{ 'smartDocs.rules.repeats' | translate: { n: r.recurring.every, unit: ('smartDocs.unit.' + r.recurring.unit | translate) } }} }</td>
                <td>{{ r.channels.inApp ? ('smartDocs.channel.in_app' | translate) : '' }} {{ r.channels.email ? ('smartDocs.channel.email' | translate) : '' }}</td>
                <td>{{ (r.active ? 'common.yes' : 'common.no') | translate }}</td>
                <td class="text-nowrap">@if (auth.can('documents.manage')) { <button type="button" class="btn btn-outline-primary btn-sm me-1" (click)="edit(r)">{{ 'common.edit' | translate }}<span class="visually-hidden"> {{ r.name }}</span></button><button type="button" class="btn btn-outline-danger btn-sm" (click)="askDelete(r)">{{ 'common.delete' | translate }}<span class="visually-hidden"> {{ r.name }}</span></button> }</td>
              </tr>
            } @empty { <tr><td colspan="6" class="text-body-secondary">{{ 'smartDocs.rules.none' | translate }}</td></tr> }
          </tbody>
        </table></div>
      }
      @case ('history') {
        <div class="table-responsive"><table class="table align-middle">
          <caption class="visually-hidden">{{ 'smartDocs.reminders.tab.history' | translate }}</caption>
          <thead><tr><th scope="col">{{ 'smartDocs.reminders.when' | translate }}</th><th scope="col">{{ 'smartDocs.list.name' | translate }}</th><th scope="col">{{ 'smartDocs.reminders.recipient' | translate }}</th><th scope="col">{{ 'smartDocs.reminders.channel' | translate }}</th><th scope="col">{{ 'smartDocs.reminders.status' | translate }}</th></tr></thead>
          <tbody>
            @for (x of deliveries(); track x.id) {
              <tr><td>{{ x.at | date: 'medium' }}</td><td><a [routerLink]="['/app/smart-documents', x.documentId]">{{ x.documentTitle }}</a></td><td>{{ x.userName }}</td><td>{{ 'smartDocs.channel.' + x.channel | translate }}</td>
                <td>{{ 'smartDocs.delivery.' + x.status | translate }}@if (x.error) { <div class="small text-danger">{{ x.error }}</div> }</td></tr>
            } @empty { <tr><td colspan="5" class="text-body-secondary">{{ 'smartDocs.reminders.noDeliveries' | translate }}</td></tr> }
          </tbody>
        </table></div>
        <p class="small text-body-secondary">{{ 'smartDocs.delivery.note' | translate }}</p>
      }
      @default {
        <div class="table-responsive"><table class="table align-middle">
          <caption class="visually-hidden">{{ 'smartDocs.reminders.tab.' + tab() | translate }}</caption>
          <thead><tr><th scope="col">{{ 'smartDocs.reminders.due' | translate }}</th><th scope="col">{{ 'smartDocs.list.name' | translate }}</th><th scope="col">{{ 'smartDocs.reminders.what' | translate }}</th><th scope="col">{{ 'smartDocs.reminders.target' | translate }}</th><th scope="col">{{ 'smartDocs.reminders.status' | translate }}</th><th scope="col"></th></tr></thead>
          <tbody>
            @for (j of jobs(); track j.id) {
              <tr>
                <td>{{ j.dueAt | date: 'medium' }}</td><td><a [routerLink]="['/app/smart-documents', j.documentId]">{{ j.documentTitle }}</a></td><td>{{ j.label }}</td><td dir="ltr">{{ j.targetDate }}</td>
                <td>{{ 'smartDocs.job.' + j.status | translate }}@if (j.lastError || j.reason) { <div class="small text-body-secondary">{{ j.lastError ?? j.reason }}</div> }</td>
                <td>@if ((j.status === 'failed' || j.status === 'skipped') && auth.can('documents.manage')) { <button type="button" class="btn btn-outline-primary btn-sm" (click)="retry(j)">{{ 'common.retry' | translate }}</button> }</td>
              </tr>
            } @empty { <tr><td colspan="6" class="text-body-secondary">{{ 'smartDocs.reminders.none' | translate }}</td></tr> }
          </tbody>
        </table></div>
      }
    }

    @if (editing(); as ed) { <app-reminder-rule-editor [rule]="ed.rule" [types]="types()" [lookups]="lookups()" [config]="config()" [timezone]="config()?.timezone ?? 'Africa/Cairo'" (closed)="editing.set(null)" (saved)="saved()" /> }
    @if (deleting(); as r) { <app-confirm-dialog [title]="'common.delete' | translate" [message]="'smartDocs.rules.deleteMessage' | translate: { name: r.name }" [confirmLabel]="'common.delete' | translate" [danger]="true" (confirmed)="remove(r)" (cancelled)="deleting.set(null)" /> }
  `,
})
export class SmartReminders {
  private readonly api = inject(SmartDocsApi);
  private readonly translate = inject(TranslateService);
  protected readonly auth = inject(AuthService);
  protected readonly tabs: Tab[] = ['upcoming', 'failed', 'rules', 'history'];
  protected readonly tab = signal<Tab>('upcoming');
  protected readonly jobs = signal<ReminderJob[]>([]);
  protected readonly rules = signal<ReminderRule[]>([]);
  protected readonly deliveries = signal<Delivery[]>([]);
  protected readonly types = signal<DocTypeDef[]>([]);
  protected readonly lookups = signal<Lookups | null>(null);
  protected readonly config = signal<SmartConfig | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly editing = signal<{ rule: ReminderRule | null } | null>(null);
  protected readonly deleting = signal<ReminderRule | null>(null);

  constructor() {
    const t = inject(ActivatedRoute).snapshot.queryParamMap.get('tab');
    if (t && (this.tabs as string[]).includes(t)) this.tab.set(t as Tab);
    this.api.types().subscribe({ next: (x) => this.types.set(x), error: () => undefined });
    this.api.lookups().subscribe({ next: (x) => this.lookups.set(x), error: () => undefined });
    this.api.config().subscribe({ next: (x) => this.config.set(x), error: () => undefined });
    this.load();
  }

  protected select(t: Tab): void { this.tab.set(t); this.load(); }
  protected load(): void {
    this.error.set(null);
    const fail = (e: unknown) => this.error.set(apiErrorMessage(e) ?? (this.translate.instant('smartDocs.loadFailed') as string));
    switch (this.tab()) {
      case 'upcoming': this.api.reminders({ pageSize: 100 }).subscribe({ next: (p) => this.jobs.set(p.data), error: fail }); break;
      case 'failed': this.api.reminders({ status: 'failed', pageSize: 100 }).subscribe({ next: (p) => this.jobs.set(p.data), error: fail }); break;
      case 'rules': this.api.rules().subscribe({ next: (r) => this.rules.set(r), error: fail }); break;
      case 'history': this.api.deliveries({ pageSize: 100 }).subscribe({ next: (p) => this.deliveries.set(p.data), error: fail }); break;
    }
  }

  protected offsets(r: ReminderRule): string {
    return r.offsets.map((o) => this.translate.instant(`smartDocs.reminders.offset.${o.direction}`, { n: o.amount, unit: this.translate.instant('smartDocs.unit.' + o.unit) }) as string).join(', ');
  }
  protected edit(rule: ReminderRule | null): void { this.editing.set({ rule }); }
  protected saved(): void { this.editing.set(null); this.load(); }
  protected askDelete(r: ReminderRule): void { this.deleting.set(r); }
  protected remove(r: ReminderRule): void { this.deleting.set(null); this.api.deleteRule(r.id).subscribe({ next: () => this.load(), error: (e) => this.error.set(apiErrorMessage(e)) }); }
  protected retry(j: ReminderJob): void { this.api.retry(j.id).subscribe({ next: () => this.load(), error: (e) => this.error.set(apiErrorMessage(e)) }); }
}
