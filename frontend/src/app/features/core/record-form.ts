import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subscription, forkJoin, of, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { WorkflowPanel } from './workflow-panel';
import { CoreApiService } from './core-api.service';
import { DocRecordView, DocTypeMeta } from './core.models';
import { ClientScript } from './client-script-runtime';
import { FormScripts } from './form-scripts';
import { buildGroup, toPayload, visibleFields } from './record-form-model';
import { ScriptsApiService } from './scripts-api.service';

/** One record of an admin-made document type, drawn from the type's current field list (built-in plus custom fields). */
@Component({
  selector: 'app-record-form',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, ConfirmDialog, WorkflowPanel],
  template: `
    <app-page-header [title]="record() ? record()!.title : meta() ? (('core.record.newTitle' | translate: { label: meta()!.label })) : ('common.loading' | translate)">
      <a class="btn btn-outline-secondary" [routerLink]="['/app/records', type]">{{ 'core.record.back' | translate }}</a>
      @if (canEdit()) {
        @for (b of scripts()?.buttons() ?? []; track b.id) {
          <button type="button" class="btn btn-outline-primary" (click)="clickButton(b.id)">{{ b.label }}</button>
        }
      }
      @if (record() && canEdit()) {
        <button type="button" class="btn btn-outline-danger" (click)="confirmDelete.set(true)">{{ 'common.delete' | translate }}</button>
      }
    </app-page-header>

    @if (loadFailed()) {
      <div class="alert alert-danger" role="alert">{{ 'core.records.notFound' | translate }}</div>
    } @else if (form(); as f) {
      @if (record()?.workflow; as wf) {
        <app-workflow-panel [block]="wf" [doctype]="type" [name]="record()!.name" (changed)="onChanged($event)" />
      }
      @if (scripts()?.warnings(); as w) {
        @if (w.length) { <div class="alert alert-warning small" role="note"><strong>{{ 'core.scripts.loadWarnings' | translate }}</strong><ul class="mb-0">@for (x of w; track $index) { <li>{{ x }}</li> }</ul></div> }
      }
      @if (scriptErrors().length) { <div class="alert alert-danger" role="alert"><ul class="mb-0">@for (x of scriptErrors(); track $index) { <li>{{ x }}</li> }</ul></div> }
      @if (notes().length) { <div class="alert alert-info" role="status"><ul class="mb-0">@for (x of notes(); track $index) { <li>{{ x }}</li> }</ul></div> }
      <form [formGroup]="f" (ngSubmit)="save()" novalidate class="card"><div class="card-body">
        @if (record(); as r) { <p class="text-body-secondary small" dir="ltr">{{ r.name }}</p> }
        <div class="row g-3">
          @for (fd of fields(); track fd.fieldname) {
            @if (!scripts()?.hidden()?.has(fd.fieldname)) {
            <div class="col-md-6">
              @if (fd.fieldtype === 'checkbox') {
                <div class="form-check mt-4">
                  <input type="checkbox" class="form-check-input" [id]="'f-' + fd.fieldname" [formControlName]="fd.fieldname" />
                  <label class="form-check-label" [for]="'f-' + fd.fieldname">{{ fd.label }}</label>
                </div>
              } @else {
                <label class="form-label" [for]="'f-' + fd.fieldname">{{ fd.label }}@if (fd.required || scripts()?.required()?.has(fd.fieldname)) { <span aria-hidden="true"> *</span> }</label>
                @switch (fd.fieldtype) {
                  @case ('select') {
                    <select class="form-select" [id]="'f-' + fd.fieldname" [formControlName]="fd.fieldname" [class.is-invalid]="invalid(fd.fieldname)">
                      <option value=""></option>
                      @for (o of fd.options ?? []; track o) { <option [value]="o">{{ o }}</option> }
                    </select>
                  }
                  @case ('date') { <input type="date" class="form-control" dir="ltr" [id]="'f-' + fd.fieldname" [formControlName]="fd.fieldname" [class.is-invalid]="invalid(fd.fieldname)" /> }
                  @case ('number') { <input type="number" class="form-control" dir="ltr" [id]="'f-' + fd.fieldname" [formControlName]="fd.fieldname" [class.is-invalid]="invalid(fd.fieldname)" /> }
                  @case ('currency') { <input type="number" step="0.01" class="form-control" dir="ltr" [id]="'f-' + fd.fieldname" [formControlName]="fd.fieldname" [class.is-invalid]="invalid(fd.fieldname)" /> }
                  @default { <input type="text" class="form-control" [id]="'f-' + fd.fieldname" [formControlName]="fd.fieldname" [class.is-invalid]="invalid(fd.fieldname)" [attr.dir]="fd.fieldtype === 'link' ? 'ltr' : null" /> }
                }
                @if (serverErrors()[fd.fieldname]; as e) { <div class="invalid-feedback d-block" role="alert">{{ e }}</div> }
                @else if (invalid(fd.fieldname)) { <div class="invalid-feedback d-block" role="alert">{{ 'validation.required' | translate }}</div> }
              }
            </div>
            }
          }
        </div>
        @if (error(); as e) { <div class="alert alert-danger mt-3" role="alert">{{ e }}</div> }
        @if (canEdit()) {
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ 'common.save' | translate }}</button>
          </div>
        } @else {
          <p class="text-body-secondary small mt-3 mb-0">{{ 'core.record.readOnly' | translate }}</p>
        }
      </div></form>
    } @else {
      <p role="status">{{ 'common.loading' | translate }}</p>
    }

    @if (confirmDelete()) {
      <app-confirm-dialog [title]="'common.delete' | translate" [message]="'core.record.deleteMessage' | translate: { name: record()!.name }" [confirmLabel]="'common.delete' | translate" [danger]="true" (cancelled)="confirmDelete.set(false)" (confirmed)="remove()" />
    }
  `,
})
export class RecordForm {
  private readonly api = inject(CoreApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly auth = inject(AuthService);
  private readonly scriptsApi = inject(ScriptsApiService);
  protected type = '';
  private scriptList: ClientScript[] | null = null;
  private changeSubs: Subscription[] = [];

  protected readonly meta = signal<DocTypeMeta | null>(null);
  protected readonly record = signal<DocRecordView | null>(null);
  protected readonly form = signal<ReturnType<typeof buildGroup> | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly confirmDelete = signal(false);
  /** The client scripts of this type, running in their own sandbox (see client-script-runtime.ts). */
  protected readonly scripts = signal<FormScripts | null>(null);
  /** Messages from the client scripts (replaced on each run) and from the server's scripts after a save (kept across the reload). */
  private readonly scriptNotes = signal<string[]>([]);
  private readonly serverNotes = signal<string[]>([]);
  private carry: string[] = [];
  protected readonly notes = computed(() => [...this.serverNotes(), ...this.scriptNotes()]);
  protected readonly scriptErrors = signal<string[]>([]);
  protected readonly fields = computed(() => visibleFields(this.meta()?.fields ?? []));
  /** The person may manage this type and, when a workflow governs it, the record is in a state that allows changes. */
  protected readonly canEdit = computed(() => !!this.meta()?.canManage && (this.record()?.workflow?.editable ?? true));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopScripts());
    this.route.paramMap
      .pipe(
        switchMap((p) => {
          this.type = p.get('doctype') ?? '';
          const name = p.get('name');
          return forkJoin({ meta: this.api.meta(this.type), record: name && name !== 'new' ? this.api.record(this.type, name) : of(null) });
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: ({ meta, record }) => {
          this.meta.set(meta);
          this.record.set(record);
          this.form.set(this.groupFor(meta, record));
          this.serverNotes.set(this.carry);
          this.carry = [];
          this.scriptNotes.set([]);
          this.scriptErrors.set([]);
          this.scriptList = null;
          this.startScripts();
        },
        error: () => this.loadFailed.set(true),
      });
  }

  private groupFor(meta: DocTypeMeta, record: DocRecordView | null) {
    const group = buildGroup(meta.fields, record?.data ?? {});
    if (!meta.canManage || (record?.workflow && !record.workflow.editable)) group.disable();
    return group;
  }

  /** After a workflow action: show the record in its new state, with the form locked or open as that state says. */
  protected onChanged(r: DocRecordView): void {
    this.record.set(r);
    this.form.set(this.groupFor(this.meta()!, r));
    this.serverNotes.set(r.messages ?? []);
    this.startScripts();
  }

  // ---- client scripts ------------------------------------------------------------------------------------------------------
  private stopScripts(): void {
    this.changeSubs.forEach((s) => s.unsubscribe());
    this.changeSubs = [];
    this.scripts()?.dispose();
    this.scripts.set(null);
  }

  /** (Re)starts the scripts for the form as it is now. The list is fetched once per load; a failure just means no scripts. */
  private startScripts(): void {
    this.stopScripts();
    const form = this.form();
    if (!form) return;
    const runtime = new FormScripts({
      group: () => this.form(), fields: () => this.fields(), canEdit: () => this.canEdit(),
      doc: () => ({ name: this.record()?.name ?? '', isNew: !this.record(), state: this.record()?.workflow?.state ?? null }),
      user: () => ({ id: this.auth.user()?.id ?? '', name: this.auth.user()?.name ?? '', roles: [], permissions: this.auth.user()?.permissions ?? [] }),
    });
    this.scripts.set(runtime);
    const begin = async (list: ClientScript[]): Promise<void> => {
      if (!list.length) return;
      await runtime.load(list, this.auth.can('developer.scripts'));
      if (this.scripts() !== runtime) { runtime.dispose(); return; }
      this.runEvent('onload');
      this.runEvent('refresh');
      for (const [name, control] of Object.entries(form.controls)) this.changeSubs.push(control.valueChanges.subscribe(() => this.runEvent(`change:${name}`)));
    };
    if (this.scriptList) void begin(this.scriptList);
    else this.scriptsApi.clientScripts(this.type).subscribe((list) => { this.scriptList = list; void begin(list); });
  }

  private runEvent(event: string) {
    const r = this.scripts()?.run(event);
    if (r && (r.messages.length || event === 'onload' || event === 'refresh')) this.scriptNotes.set(r.messages);
    return r;
  }

  protected clickButton(id: number): void {
    const r = this.scripts()?.click(id);
    if (!r) return;
    this.scriptNotes.set(r.messages);
    this.scriptErrors.set(r.errors);
  }

  protected invalid(name: string): boolean {
    const c = this.form()?.controls[name];
    return !!c && c.invalid && (c.touched || this.form()!.dirty);
  }

  protected save(): void {
    const f = this.form();
    const meta = this.meta();
    if (!f || !meta) return;
    this.scriptErrors.set([]);
    // scripts first: they may fill in values, mark fields required, or refuse the save
    const check = this.scripts()?.run('validate');
    if (check?.errors.length) { this.scriptErrors.set(check.errors); this.scriptNotes.set(check.messages); return; }
    this.scripts()?.run('before_save');
    f.markAllAsTouched();
    if (f.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    this.serverErrors.set({});
    const payload = toPayload(meta.fields, f.getRawValue());
    const existing = this.record();
    const call = existing ? this.api.updateRecord(this.type, existing.name, payload) : this.api.createRecord(this.type, payload);
    call.subscribe({
      next: (r) => {
        this.saving.set(false);
        this.record.set(r);
        this.serverNotes.set(r.messages ?? []);
        this.carry = r.messages ?? []; // the page reloads on the saved record; the messages must still be there
        void this.router.navigate(['/app/records', this.type, r.name]);
      },
      error: (e) => {
        this.saving.set(false);
        const byField = Object.fromEntries(Object.entries(fieldErrors(e)).map(([k, v]) => [k.replace(/^data\./, ''), v]));
        const fromScript = byField['script']; // a server script refused the save
        delete byField['script'];
        this.serverErrors.set(byField);
        this.error.set(fromScript ?? (Object.keys(byField).length ? null : (apiErrorMessage(e) ?? (this.translate.instant('core.saveFailed') as string))));
      },
    });
  }

  protected remove(): void {
    const r = this.record();
    this.confirmDelete.set(false);
    if (!r) return;
    this.api.deleteRecord(this.type, r.name).subscribe({
      next: () => void this.router.navigate(['/app/records', this.type]),
      error: (e) => this.error.set(apiErrorMessage(e) ?? (this.translate.instant('core.saveFailed') as string)),
    });
  }
}
