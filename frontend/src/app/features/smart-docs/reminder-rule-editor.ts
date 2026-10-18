import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { Modal } from '../../shared/components/modal/modal';
import { SmartDocsApi } from './smart-docs-api.service';
import { DocTypeDef, Lookups, Offset, ReminderRule, ReminderRuleInput, SmartConfig, UNITS } from './smart-docs.models';

const DATE_ROLES = ['expiry_date', 'end_date', 'renewal_date', 'start_date', 'issue_date'];

interface Model {
  name: string; description: string; scope: 'global' | 'type' | 'document'; typeKey: string; documentId: string; mode: 'add' | 'override'; dateField: string; offsets: Offset[];
  recurring: boolean; every: number; unit: Offset['unit']; max: number | null; time: string; timezone: string;
  owner: boolean; manager: boolean; users: string[]; roles: string[]; inApp: boolean; email: boolean;
  escalate: boolean; escHours: number; escManager: boolean; escRoles: string[]; escUsers: string[]; subject: string; message: string; active: boolean;
}

/** Create or change a reminder rule: what date it counts from, when it fires, who is told, how, and what happens if nobody reacts. */
@Component({
  selector: 'app-reminder-rule-editor',
  imports: [FormsModule, TranslatePipe, Modal],
  template: `
    <app-modal [title]="(rule() ? 'smartDocs.rules.edit' : 'smartDocs.rules.new') | translate" width="52rem" (closed)="closed.emit()">
      <form (ngSubmit)="save()" novalidate>
        <div class="row g-3">
          <div class="col-md-8"><label class="form-label" for="ru-name">{{ 'smartDocs.rules.name' | translate }} *</label><input id="ru-name" name="name" class="form-control" [(ngModel)]="m.name" required /></div>
          <div class="col-md-4 d-flex align-items-end"><div class="form-check"><input id="ru-active" name="active" type="checkbox" class="form-check-input" [(ngModel)]="m.active" /><label class="form-check-label" for="ru-active">{{ 'smartDocs.rules.active' | translate }}</label></div></div>
          <div class="col-12"><label class="form-label" for="ru-desc">{{ 'smartDocs.rules.description' | translate }}</label><input id="ru-desc" name="desc" class="form-control" [(ngModel)]="m.description" /></div>

          <div class="col-md-4"><label class="form-label" for="ru-scope">{{ 'smartDocs.rules.scope' | translate }}</label>
            <select id="ru-scope" name="scope" class="form-select" [(ngModel)]="m.scope" [disabled]="!!rule() || fixedScope()" (ngModelChange)="m.dateField = ''">
              <option value="global">{{ 'smartDocs.reminders.scope.global' | translate }}</option><option value="type">{{ 'smartDocs.reminders.scope.type' | translate }}</option>@if (m.documentId) { <option value="document">{{ 'smartDocs.reminders.scope.document' | translate }}</option> }</select></div>
          @if (m.scope === 'type') {
            <div class="col-md-4"><label class="form-label" for="ru-type">{{ 'smartDocs.list.type' | translate }}</label>
              <select id="ru-type" name="type" class="form-select" [(ngModel)]="m.typeKey" [disabled]="!!rule()" (ngModelChange)="m.dateField = ''">@for (t of types(); track t.key) { <option [value]="t.key">{{ t.label }}</option> }</select></div>
          }
          <div class="col-md-4"><label class="form-label" for="ru-date">{{ 'smartDocs.rules.dateField' | translate }} *</label>
            <select id="ru-date" name="dateField" class="form-select" [(ngModel)]="m.dateField"><option value=""></option>@for (o of dateOptions(); track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select>
            @if (errors()['dateField']; as e) { <div class="invalid-feedback d-block" role="alert">{{ e }}</div> }</div>
          <div class="col-md-4"><label class="form-label" for="ru-mode">{{ 'smartDocs.rules.mode' | translate }}</label>
            <select id="ru-mode" name="mode" class="form-select" [(ngModel)]="m.mode"><option value="add">{{ 'smartDocs.rules.modeAdd' | translate }}</option><option value="override">{{ 'smartDocs.rules.modeOverride' | translate }}</option></select></div>

          <fieldset class="col-12"><legend class="h6">{{ 'smartDocs.rules.timing' | translate }}</legend>
            @for (o of m.offsets; track $index) {
              <div class="row g-2 mb-2 align-items-end">
                <div class="col-3"><label class="form-label small" [for]="'ru-amt-' + $index">{{ 'smartDocs.rules.amount' | translate }}</label><input [id]="'ru-amt-' + $index" [name]="'amt' + $index" type="number" min="0" class="form-control" [(ngModel)]="o.amount" /></div>
                <div class="col-4"><label class="form-label small" [for]="'ru-unit-' + $index">{{ 'smartDocs.rules.unit' | translate }}</label>
                  <select [id]="'ru-unit-' + $index" [name]="'unit' + $index" class="form-select" [(ngModel)]="o.unit">@for (u of units; track u) { <option [value]="u">{{ 'smartDocs.unit.' + u | translate }}</option> }</select></div>
                <div class="col-3"><label class="form-label small" [for]="'ru-dir-' + $index">{{ 'smartDocs.rules.direction' | translate }}</label>
                  <select [id]="'ru-dir-' + $index" [name]="'dir' + $index" class="form-select" [(ngModel)]="o.direction"><option value="before">{{ 'smartDocs.rules.before' | translate }}</option><option value="after">{{ 'smartDocs.rules.after' | translate }}</option></select></div>
                <div class="col-2"><button type="button" class="btn btn-outline-danger w-100" [disabled]="m.offsets.length <= 1" (click)="removeOffset($index)" [attr.aria-label]="'common.delete' | translate"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div>
              </div>
            }
            @if (errors()['offsets']; as e) { <div class="invalid-feedback d-block" role="alert">{{ e }}</div> }
            <button type="button" class="btn btn-outline-secondary btn-sm" (click)="addOffset()">{{ 'smartDocs.rules.addTiming' | translate }}</button>
            <div class="row g-2 mt-2">
              <div class="col-md-3"><label class="form-label" for="ru-time">{{ 'smartDocs.rules.time' | translate }}</label><input id="ru-time" name="time" type="time" dir="ltr" class="form-control" [(ngModel)]="m.time" /></div>
              <div class="col-md-5"><label class="form-label" for="ru-tz">{{ 'smartDocs.rules.timezone' | translate }}</label><input id="ru-tz" name="tz" dir="ltr" class="form-control" [(ngModel)]="m.timezone" />
                @if (errors()['timezone']; as e) { <div class="invalid-feedback d-block" role="alert">{{ e }}</div> }</div>
              <div class="col-md-4 d-flex align-items-end"><div class="form-check"><input id="ru-rec" name="rec" type="checkbox" class="form-check-input" [(ngModel)]="m.recurring" /><label class="form-check-label" for="ru-rec">{{ 'smartDocs.rules.recurring' | translate }}</label></div></div>
            </div>
            @if (m.recurring) {
              <div class="row g-2 mt-1">
                <div class="col-4"><label class="form-label small" for="ru-every">{{ 'smartDocs.rules.every' | translate }}</label><input id="ru-every" name="every" type="number" min="1" class="form-control" [(ngModel)]="m.every" /></div>
                <div class="col-4"><label class="form-label small" for="ru-runit">{{ 'smartDocs.rules.unit' | translate }}</label><select id="ru-runit" name="runit" class="form-select" [(ngModel)]="m.unit">@for (u of units; track u) { <option [value]="u">{{ 'smartDocs.unit.' + u | translate }}</option> }</select></div>
                <div class="col-4"><label class="form-label small" for="ru-max">{{ 'smartDocs.rules.max' | translate }}</label><input id="ru-max" name="max" type="number" min="1" max="60" class="form-control" [(ngModel)]="m.max" /></div>
              </div>
              @if (errors()['recurring']; as e) { <div class="invalid-feedback d-block" role="alert">{{ e }}</div> }
            }
          </fieldset>

          <fieldset class="col-12"><legend class="h6">{{ 'smartDocs.rules.recipients' | translate }}</legend>
            <div class="d-flex flex-wrap gap-3 mb-2">
              <div class="form-check"><input id="ru-owner" name="owner" type="checkbox" class="form-check-input" [(ngModel)]="m.owner" /><label class="form-check-label" for="ru-owner">{{ 'smartDocs.rules.owner' | translate }}</label></div>
              <div class="form-check"><input id="ru-mgr" name="mgr" type="checkbox" class="form-check-input" [(ngModel)]="m.manager" /><label class="form-check-label" for="ru-mgr">{{ 'smartDocs.rules.manager' | translate }}</label></div>
            </div>
            <div class="row g-2">
              <div class="col-md-6"><label class="form-label" for="ru-users">{{ 'smartDocs.rules.users' | translate }}</label><select id="ru-users" name="users" multiple class="form-select" [(ngModel)]="m.users">@for (u of lookups()?.users ?? []; track u.id) { <option [value]="u.id">{{ u.name }}</option> }</select></div>
              <div class="col-md-6"><label class="form-label" for="ru-roles">{{ 'smartDocs.rules.roles' | translate }}</label><select id="ru-roles" name="roles" multiple class="form-select" [(ngModel)]="m.roles">@for (r of lookups()?.roles ?? []; track r) { <option [value]="r">{{ r }}</option> }</select></div>
            </div>
            @if (errors()['recipients']; as e) { <div class="invalid-feedback d-block" role="alert">{{ e }}</div> }
          </fieldset>

          <fieldset class="col-12"><legend class="h6">{{ 'smartDocs.rules.channels' | translate }}</legend>
            <div class="d-flex flex-wrap gap-3">
              <div class="form-check"><input id="ru-inapp" name="inapp" type="checkbox" class="form-check-input" [(ngModel)]="m.inApp" /><label class="form-check-label" for="ru-inapp">{{ 'smartDocs.channel.in_app' | translate }}</label></div>
              <div class="form-check"><input id="ru-email" name="email" type="checkbox" class="form-check-input" [(ngModel)]="m.email" /><label class="form-check-label" for="ru-email">{{ 'smartDocs.channel.email' | translate }}</label></div>
            </div>
            @if (m.email && config()?.mail?.configured === false) { <div class="form-text text-warning-emphasis">{{ 'smartDocs.rules.noMail' | translate }}</div> }
            @if (errors()['channels']; as e) { <div class="invalid-feedback d-block" role="alert">{{ e }}</div> }
          </fieldset>

          <fieldset class="col-12"><legend class="h6">{{ 'smartDocs.rules.escalation' | translate }}</legend>
            <div class="form-check mb-2"><input id="ru-esc" name="esc" type="checkbox" class="form-check-input" [(ngModel)]="m.escalate" /><label class="form-check-label" for="ru-esc">{{ 'smartDocs.rules.escalate' | translate }}</label></div>
            @if (m.escalate) {
              <div class="row g-2">
                <div class="col-md-3"><label class="form-label" for="ru-eh">{{ 'smartDocs.rules.escHours' | translate }}</label><input id="ru-eh" name="eh" type="number" min="1" class="form-control" [(ngModel)]="m.escHours" /></div>
                <div class="col-md-3 d-flex align-items-end"><div class="form-check"><input id="ru-em" name="em" type="checkbox" class="form-check-input" [(ngModel)]="m.escManager" /><label class="form-check-label" for="ru-em">{{ 'smartDocs.rules.manager' | translate }}</label></div></div>
                <div class="col-md-3"><label class="form-label" for="ru-er">{{ 'smartDocs.rules.roles' | translate }}</label><select id="ru-er" name="er" multiple class="form-select" [(ngModel)]="m.escRoles">@for (r of lookups()?.roles ?? []; track r) { <option [value]="r">{{ r }}</option> }</select></div>
                <div class="col-md-3"><label class="form-label" for="ru-eu">{{ 'smartDocs.rules.users' | translate }}</label><select id="ru-eu" name="eu" multiple class="form-select" [(ngModel)]="m.escUsers">@for (u of lookups()?.users ?? []; track u.id) { <option [value]="u.id">{{ u.name }}</option> }</select></div>
              </div>
              @if (errors()['escalation'] || errors()['escalation.afterHours']; as e) { <div class="invalid-feedback d-block" role="alert">{{ e }}</div> }
            }
          </fieldset>

          <div class="col-12"><label class="form-label" for="ru-subj">{{ 'smartDocs.rules.subject' | translate }}</label><input id="ru-subj" name="subj" class="form-control" [(ngModel)]="m.subject" [placeholder]="'smartDocs.rules.subjectDefault' | translate" /></div>
          <div class="col-12"><label class="form-label" for="ru-msg">{{ 'smartDocs.rules.message' | translate }}</label><textarea id="ru-msg" name="msg" rows="3" class="form-control" [(ngModel)]="m.message"></textarea>
            <div class="form-text">{{ 'smartDocs.rules.placeholders' | translate }}: {{ '{title} {type} {date} {days} {when} {field} {label} {status} {link}' }}</div></div>
        </div>
        @if (error(); as e) { <div class="alert alert-danger mt-3" role="alert">{{ e }}</div> }
        <div class="d-flex justify-content-end gap-2 mt-3"><button type="button" class="btn btn-outline-secondary" (click)="closed.emit()">{{ 'common.cancel' | translate }}</button><button type="submit" class="btn btn-primary" [disabled]="saving()">{{ 'common.save' | translate }}</button></div>
      </form>
    </app-modal>
  `,
})
export class ReminderRuleEditor implements OnInit {
  readonly rule = input<ReminderRule | null>(null);
  readonly types = input<DocTypeDef[]>([]);
  readonly lookups = input<Lookups | null>(null);
  readonly config = input<SmartConfig | null>(null);
  /** Pre-sets for a rule made from a document or a type page. */
  readonly preset = input<{ scope: 'global' | 'type' | 'document'; typeKey?: string; documentId?: string } | null>(null);
  readonly timezone = input('Africa/Cairo');
  readonly saved = output<ReminderRule>();
  readonly closed = output<void>();

  private readonly api = inject(SmartDocsApi);
  private readonly translate = inject(TranslateService);
  protected readonly units = UNITS;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly fixedScope = computed(() => !!this.preset() && !this.rule());
  protected m: Model = this.blank();
  /** The model is a plain object edited through ngModel, so this is a method and not a computed signal. */
  protected dateOptions(): Array<{ value: string; label: string }> {
    const t = this.m.scope === 'type' ? this.types().find((x) => x.key === this.m.typeKey) : null;
    return t ? t.fields.filter((f) => f.type === 'date' && f.active).map((f) => ({ value: f.key, label: f.label })) : DATE_ROLES.map((r) => ({ value: r, label: this.translate.instant('smartDocs.roles.' + r) as string }));
  }

  private blank(): Model {
    return { name: '', description: '', scope: 'global', typeKey: '', documentId: '', mode: 'add', dateField: 'expiry_date', offsets: [{ amount: 30, unit: 'days', direction: 'before' }], recurring: false, every: 1, unit: 'days', max: null, time: '09:00', timezone: 'Africa/Cairo',
      owner: true, manager: false, users: [], roles: [], inApp: true, email: false, escalate: false, escHours: 24, escManager: false, escRoles: [], escUsers: [], subject: '', message: '', active: true };
  }

  ngOnInit(): void {
    const r = this.rule(); const p = this.preset();
    this.m = this.blank(); this.m.timezone = this.timezone();
    if (p) { this.m.scope = p.scope; this.m.typeKey = p.typeKey ?? ''; this.m.documentId = p.documentId ?? ''; }
    if (this.m.scope === 'type' && !this.m.typeKey) this.m.typeKey = this.types()[0]?.key ?? '';
    if (r) {
      this.m = { name: r.name, description: r.description ?? '', scope: r.scope, typeKey: r.typeKey ?? '', documentId: r.documentId ?? '', mode: r.mode, dateField: r.dateField, offsets: r.offsets.map((o) => ({ ...o })),
        recurring: !!r.recurring, every: r.recurring?.every ?? 1, unit: r.recurring?.unit ?? 'days', max: r.recurring?.max ?? null, time: r.time, timezone: r.timezone, owner: r.recipients.owner, manager: r.recipients.manager,
        users: [...r.recipients.users], roles: [...r.recipients.roles], inApp: r.channels.inApp, email: r.channels.email, escalate: !!r.escalation, escHours: r.escalation?.afterHours ?? 24, escManager: r.escalation?.manager ?? false,
        escRoles: [...(r.escalation?.roles ?? [])], escUsers: [...(r.escalation?.users ?? [])], subject: r.subject ?? '', message: r.message ?? '', active: r.active };
    }
  }

  protected addOffset(): void { this.m.offsets = [...this.m.offsets, { amount: 7, unit: 'days', direction: 'before' }]; }
  protected removeOffset(i: number): void { this.m.offsets = this.m.offsets.filter((_, j) => j !== i); }

  protected save(): void {
    const m = this.m;
    const body: ReminderRuleInput & { scope: Model['scope'] } = {
      scope: m.scope, name: m.name.trim(), description: m.description.trim() || null, mode: m.mode, dateField: m.dateField, offsets: m.offsets.map((o) => ({ amount: Number(o.amount), unit: o.unit, direction: o.direction })),
      recurring: m.recurring ? { every: Number(m.every), unit: m.unit, max: m.max ? Number(m.max) : null } : null, time: m.time, timezone: m.timezone.trim(),
      recipients: { users: m.users, roles: m.roles, owner: m.owner, manager: m.manager }, channels: { inApp: m.inApp, email: m.email },
      escalation: m.escalate ? { afterHours: Number(m.escHours), users: m.escUsers, roles: m.escRoles, manager: m.escManager } : null,
      subject: m.subject.trim() || null, message: m.message.trim() || null, active: m.active,
      ...(m.scope === 'type' ? { typeKey: m.typeKey } : {}), ...(m.scope === 'document' ? { documentId: m.documentId } : {}),
    };
    this.saving.set(true); this.error.set(null); this.errors.set({});
    const r = this.rule();
    (r ? this.api.updateRule(r.id, body) : this.api.createRule(body)).subscribe({
      next: (x) => { this.saving.set(false); this.saved.emit(x); },
      error: (e) => { this.saving.set(false); this.errors.set(fieldErrors(e)); this.error.set(apiErrorMessage(e) ?? (this.translate.instant('smartDocs.saveFailed') as string)); },
    });
  }
}
