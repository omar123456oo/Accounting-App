import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin, map, switchMap } from 'rxjs';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { CoreApiService } from './core-api.service';
import { DocTypeMeta } from './core.models';
import { WorkflowApiService } from './workflow-api.service';
import { EditorDefinition, EditorTransition, emptyDefinition, fromEditor, newState, newTransition, toEditor } from './workflow-form';
import { Directory, Escalation, OPS, Op, WorkflowState } from './workflow.models';

/** Edit the approval workflow of a document type: states, who may move a record between them, and escalation. */
@Component({
  selector: 'app-workflow-editor',
  imports: [FormsModule, RouterLink, TranslatePipe, PageHeader],
  template: `
    <app-page-header [title]="meta() ? ('core.workflow.editorTitle' | translate: { label: meta()!.label }) : ('core.workflow.editorTitlePlain' | translate)">
      <a class="btn btn-outline-secondary" routerLink="/app/doctypes">{{ 'core.docTypes.back' | translate }}</a>
    </app-page-header>

    @if (loadFailed()) {
      <div class="alert alert-danger" role="alert">{{ 'core.loadFailed' | translate }}</div>
    } @else if (model(); as m) {
      <section class="card mb-3"><div class="card-body row g-3">
        <div class="col-md-6">
          <label class="form-label" for="wf-name">{{ 'core.workflow.name' | translate }} *</label>
          <input id="wf-name" class="form-control" [ngModel]="m.name" (ngModelChange)="set({ name: $event })" />
        </div>
        <div class="col-md-6 form-check mt-md-4 ps-md-5">
          <input id="wf-active" type="checkbox" class="form-check-input" [ngModel]="m.active" (ngModelChange)="set({ active: $event })" />
          <label class="form-check-label" for="wf-active">{{ 'core.workflow.active' | translate }}</label>
          <div class="form-text">{{ 'core.workflow.activeHint' | translate }}</div>
        </div>
      </div></section>

      <section class="card mb-3" aria-labelledby="st-title"><div class="card-body">
        <h2 class="h5" id="st-title">{{ 'core.workflow.states' | translate }}</h2>
        @for (s of m.states; track $index) {
          <div class="row g-2 align-items-end mb-2">
            <div class="col-md-3"><label class="form-label" [for]="'st-n-' + $index">{{ 'core.workflow.stateId' | translate }}</label><input class="form-control" dir="ltr" [id]="'st-n-' + $index" [ngModel]="s.name" (ngModelChange)="patchState($index, { name: $event })" /></div>
            <div class="col-md-3"><label class="form-label" [for]="'st-l-' + $index">{{ 'core.fields.label' | translate }}</label><input class="form-control" [id]="'st-l-' + $index" [ngModel]="s.label" (ngModelChange)="patchState($index, { label: $event })" /></div>
            <div class="col-auto form-check ms-2"><input type="checkbox" class="form-check-input" [id]="'st-e-' + $index" [ngModel]="s.editable" (ngModelChange)="patchState($index, { editable: $event })" /><label class="form-check-label" [for]="'st-e-' + $index">{{ 'core.workflow.editable' | translate }}</label></div>
            <div class="col-auto form-check"><input type="radio" class="form-check-input" name="initial" [id]="'st-i-' + $index" [checked]="m.initialState === s.name" (change)="set({ initialState: s.name })" /><label class="form-check-label" [for]="'st-i-' + $index">{{ 'core.workflow.initial' | translate }}</label></div>
            <div class="col text-end"><button type="button" class="btn btn-outline-danger btn-sm" (click)="removeState($index)" [attr.aria-label]="'core.fields.remove' | translate"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div>
          </div>
        }
        <button type="button" class="btn btn-outline-primary btn-sm" (click)="addState()"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'core.workflow.addState' | translate }}</button>
      </div></section>

      <section class="card mb-3" aria-labelledby="tr-title"><div class="card-body">
        <h2 class="h5" id="tr-title">{{ 'core.workflow.transitions' | translate }}</h2>
        @for (t of m.transitions; track $index; let ti = $index) {
          <fieldset class="border rounded p-3 mb-3">
            <legend class="float-none w-auto fs-6 px-2 mb-0">{{ t.label || t.action || ('core.fields.new' | translate) }}</legend>
            <div class="row g-2">
              <div class="col-md-3"><label class="form-label" [for]="'tr-a-' + $index">{{ 'core.workflow.actionId' | translate }}</label><input class="form-control" dir="ltr" [id]="'tr-a-' + $index" [ngModel]="t.action" (ngModelChange)="patchT($index, { action: $event })" /></div>
              <div class="col-md-3"><label class="form-label" [for]="'tr-l-' + $index">{{ 'core.workflow.buttonLabel' | translate }}</label><input class="form-control" [id]="'tr-l-' + $index" [ngModel]="t.label" (ngModelChange)="patchT($index, { label: $event })" /></div>
              <div class="col-md-3"><label class="form-label" [for]="'tr-f-' + $index">{{ 'core.workflow.from' | translate }}</label><select class="form-select" dir="ltr" [id]="'tr-f-' + $index" [ngModel]="t.from" (ngModelChange)="patchT($index, { from: $event })">@for (n of stateNames(); track n) { <option [value]="n">{{ n }}</option> }</select></div>
              <div class="col-md-3"><label class="form-label" [for]="'tr-t-' + $index">{{ 'core.workflow.to' | translate }}</label><select class="form-select" dir="ltr" [id]="'tr-t-' + $index" [ngModel]="t.to" (ngModelChange)="patchT($index, { to: $event })">@for (n of stateNames(); track n) { <option [value]="n">{{ n }}</option> }</select></div>

              <div class="col-md-6">
                <div class="form-label">{{ 'core.workflow.roles' | translate }}</div>
                @for (r of directory()?.roles ?? []; track r) {
                  <div class="form-check form-check-inline"><input type="checkbox" class="form-check-input" [id]="'tr-r-' + $index + '-' + r" [checked]="t.allowedRoles.includes(r)" (change)="toggle($index, 'allowedRoles', r)" /><label class="form-check-label" dir="ltr" [for]="'tr-r-' + $index + '-' + r">{{ r }}</label></div>
                }
              </div>
              <div class="col-md-6">
                <label class="form-label" [for]="'tr-u-' + $index">{{ 'core.workflow.users' | translate }}</label>
                <select class="form-select" [id]="'tr-u-' + $index" (change)="addUser($index, $any($event.target).value); $any($event.target).value = ''">
                  <option value="">{{ 'core.workflow.addPerson' | translate }}</option>
                  @for (u of directory()?.users ?? []; track u.id) { <option [value]="u.id">{{ u.name }}</option> }
                </select>
                @for (id of t.allowedUsers; track id) {
                  <span class="badge text-bg-light border me-1 mt-1">{{ userName(id) }} <button type="button" class="btn-close btn-close-sm ms-1" style="font-size:.6rem" [attr.aria-label]="'core.fields.remove' | translate" (click)="toggle($index, 'allowedUsers', id)"></button></span>
                }
              </div>

              <div class="col-md-3"><label class="form-label" [for]="'tr-p-' + $index">{{ 'core.workflow.approvals' | translate }}</label><input type="number" min="1" max="10" class="form-control" dir="ltr" [id]="'tr-p-' + $index" [ngModel]="t.approvals" (ngModelChange)="patchT($index, { approvals: $event })" /><div class="form-text">{{ 'core.workflow.approvalsHint' | translate }}</div></div>
              <div class="col-auto form-check mt-4 ms-2"><input type="checkbox" class="form-check-input" [id]="'tr-c-' + $index" [ngModel]="t.requireComment" (ngModelChange)="patchT($index, { requireComment: $event })" /><label class="form-check-label" [for]="'tr-c-' + $index">{{ 'core.workflow.requireComment' | translate }}</label></div>
              <div class="col-auto form-check mt-4"><input type="checkbox" class="form-check-input" [id]="'tr-s-' + $index" [ngModel]="t.preventSelfApproval" (ngModelChange)="patchT($index, { preventSelfApproval: $event })" /><label class="form-check-label" [for]="'tr-s-' + $index">{{ 'core.workflow.noSelf' | translate }}</label></div>

              <div class="col-12">
                <div class="form-label">{{ 'core.workflow.conditions' | translate }}</div>
                @for (c of t.conditions; track $index; let ci = $index) {
                  <div class="row g-2 mb-1">
                    <div class="col-md-4"><select class="form-select" dir="ltr" [attr.aria-label]="'core.workflow.field' | translate" [ngModel]="c.field" (ngModelChange)="patchCond(ti, ci, { field: $event })">@for (f of fieldNames(); track f) { <option [value]="f">{{ f }}</option> }</select></div>
                    <div class="col-md-3"><select class="form-select" dir="ltr" [attr.aria-label]="'core.workflow.operator' | translate" [ngModel]="c.op" (ngModelChange)="patchCond(ti, ci, { op: $event })">@for (o of ops; track o) { <option [value]="o">{{ 'core.workflow.ops.' + o | translate }}</option> }</select></div>
                    <div class="col-md-4"><input class="form-control" dir="ltr" [attr.aria-label]="'core.workflow.value' | translate" [ngModel]="c.valueText" (ngModelChange)="patchCond(ti, ci, { valueText: $event })" /></div>
                    <div class="col-md-1"><button type="button" class="btn btn-outline-danger btn-sm" (click)="removeCond(ti, ci)" [attr.aria-label]="'core.fields.remove' | translate"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>
                  </div>
                }
                <button type="button" class="btn btn-outline-secondary btn-sm" (click)="addCond($index)">{{ 'core.workflow.addCondition' | translate }}</button>
              </div>
              <div class="col-12 text-end"><button type="button" class="btn btn-outline-danger btn-sm" (click)="removeT($index)">{{ 'core.fields.remove' | translate }}</button></div>
            </div>
          </fieldset>
        }
        <button type="button" class="btn btn-outline-primary btn-sm" (click)="addT()"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'core.workflow.addTransition' | translate }}</button>
      </div></section>

      <section class="card mb-3" aria-labelledby="es-title"><div class="card-body">
        <h2 class="h5" id="es-title">{{ 'core.workflow.escalations' | translate }}</h2>
        <p class="text-body-secondary small">{{ 'core.workflow.escalationsHint' | translate }}</p>
        @for (e of m.escalations; track $index) {
          <div class="row g-2 align-items-end mb-2">
            <div class="col-md-3"><label class="form-label" [for]="'es-s-' + $index">{{ 'core.workflow.state' | translate }}</label><select class="form-select" dir="ltr" [id]="'es-s-' + $index" [ngModel]="e.state" (ngModelChange)="patchE($index, { state: $event })">@for (n of stateNames(); track n) { <option [value]="n">{{ n }}</option> }</select></div>
            <div class="col-md-2"><label class="form-label" [for]="'es-h-' + $index">{{ 'core.workflow.afterHours' | translate }}</label><input type="number" min="1" class="form-control" dir="ltr" [id]="'es-h-' + $index" [ngModel]="e.afterHours" (ngModelChange)="patchE($index, { afterHours: $event })" /></div>
            <div class="col-md-4"><div class="form-label">{{ 'core.workflow.notifyRoles' | translate }}</div>@for (r of directory()?.roles ?? []; track r) { <div class="form-check form-check-inline"><input type="checkbox" class="form-check-input" [id]="'es-r-' + $index + '-' + r" [checked]="e.notifyRoles.includes(r)" (change)="toggleE($index, r)" /><label class="form-check-label" dir="ltr" [for]="'es-r-' + $index + '-' + r">{{ r }}</label></div> }</div>
            <div class="col-auto form-check"><input type="checkbox" class="form-check-input" [id]="'es-a-' + $index" [ngModel]="e.remindApprovers" (ngModelChange)="patchE($index, { remindApprovers: $event })" /><label class="form-check-label" [for]="'es-a-' + $index">{{ 'core.workflow.remindApprovers' | translate }}</label></div>
            <div class="col text-end"><button type="button" class="btn btn-outline-danger btn-sm" (click)="removeE($index)" [attr.aria-label]="'core.fields.remove' | translate"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div>
          </div>
        }
        <button type="button" class="btn btn-outline-primary btn-sm" (click)="addE()"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'core.workflow.addEscalation' | translate }}</button>
      </div></section>

      @if (errors().length) {
        <div class="alert alert-danger" role="alert"><ul class="mb-0">@for (e of errors(); track $index) { <li>{{ e }}</li> }</ul></div>
      }
      @if (saved()) { <div class="alert alert-success" role="status">{{ 'core.customize.saved' | translate }}</div> }
      <div class="d-flex justify-content-end"><button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">{{ 'common.save' | translate }}</button></div>
    } @else {
      <p role="status">{{ 'common.loading' | translate }}</p>
    }
  `,
})
export class WorkflowEditor {
  private readonly core = inject(CoreApiService);
  private readonly api = inject(WorkflowApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private type = '';
  protected readonly ops: readonly Op[] = OPS;

  protected readonly meta = signal<DocTypeMeta | null>(null);
  protected readonly directory = signal<Directory | null>(null);
  protected readonly model = signal<EditorDefinition | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly stateNames = computed(() => (this.model()?.states ?? []).map((s) => s.name).filter(Boolean));
  protected readonly fieldNames = computed(() => (this.meta()?.fields ?? []).map((f) => f.fieldname));

  constructor() {
    this.route.paramMap
      .pipe(
        map((p) => (this.type = p.get('name') ?? '')),
        switchMap((t) => forkJoin({ meta: this.core.meta(t), wf: this.api.workflow(t), directory: this.api.directory() })),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: ({ meta, wf, directory }) => {
          this.meta.set(meta);
          this.directory.set(directory);
          this.model.set(toEditor(wf ?? emptyDefinition(meta.label)));
        },
        error: () => this.loadFailed.set(true),
      });
  }

  private update(fn: (m: EditorDefinition) => EditorDefinition): void {
    this.model.update((m) => (m ? fn(m) : m));
    this.saved.set(false);
  }
  protected set(change: Partial<EditorDefinition>): void { this.update((m) => ({ ...m, ...change })); }

  protected userName(id: string): string { return this.directory()?.users.find((u) => u.id === id)?.name ?? id; }

  // states
  protected addState(): void { this.update((m) => ({ ...m, states: [...m.states, newState(m.states)] })); }
  protected removeState(i: number): void { this.update((m) => ({ ...m, states: m.states.filter((_, k) => k !== i) })); }
  protected patchState(i: number, c: Partial<WorkflowState>): void {
    this.update((m) => {
      const old = m.states[i].name;
      const states = m.states.map((s, k) => (k === i ? { ...s, ...c } : s));
      // renaming a state keeps the transitions, escalations and initial state that point at it
      if (c.name !== undefined && c.name !== old) {
        return {
          ...m, states, initialState: m.initialState === old ? c.name : m.initialState,
          transitions: m.transitions.map((t) => ({ ...t, from: t.from === old ? c.name! : t.from, to: t.to === old ? c.name! : t.to })),
          escalations: m.escalations.map((e) => ({ ...e, state: e.state === old ? c.name! : e.state })),
        };
      }
      return { ...m, states };
    });
  }

  // transitions
  protected addT(): void { this.update((m) => ({ ...m, transitions: [...m.transitions, newTransition(m.states.map((s) => s.name))] })); }
  protected removeT(i: number): void { this.update((m) => ({ ...m, transitions: m.transitions.filter((_, k) => k !== i) })); }
  protected patchT(i: number, c: Partial<EditorTransition>): void { this.update((m) => ({ ...m, transitions: m.transitions.map((t, k) => (k === i ? { ...t, ...c } : t)) })); }
  protected toggle(i: number, key: 'allowedRoles' | 'allowedUsers', value: string): void {
    this.update((m) => ({ ...m, transitions: m.transitions.map((t, k) => (k === i ? { ...t, [key]: t[key].includes(value) ? t[key].filter((x) => x !== value) : [...t[key], value] } : t)) }));
  }
  protected addUser(i: number, id: string): void { if (id && !this.model()!.transitions[i].allowedUsers.includes(id)) this.toggle(i, 'allowedUsers', id); }
  protected addCond(i: number): void { this.patchT(i, { conditions: [...this.model()!.transitions[i].conditions, { field: this.fieldNames()[0] ?? '', op: 'eq', valueText: '' }] }); }
  protected removeCond(i: number, c: number): void { this.patchT(i, { conditions: this.model()!.transitions[i].conditions.filter((_, k) => k !== c) }); }
  protected patchCond(i: number, c: number, change: Partial<EditorTransition['conditions'][number]>): void {
    this.patchT(i, { conditions: this.model()!.transitions[i].conditions.map((x, k) => (k === c ? { ...x, ...change } : x)) });
  }

  // escalations
  protected addE(): void { this.update((m) => ({ ...m, escalations: [...m.escalations, { state: m.states[0]?.name ?? '', afterHours: 24, notifyRoles: [], notifyUsers: [], remindApprovers: false }] })); }
  protected removeE(i: number): void { this.update((m) => ({ ...m, escalations: m.escalations.filter((_, k) => k !== i) })); }
  protected patchE(i: number, c: Partial<Escalation>): void { this.update((m) => ({ ...m, escalations: m.escalations.map((e, k) => (k === i ? { ...e, ...c } : e)) })); }
  protected toggleE(i: number, role: string): void {
    const e = this.model()!.escalations[i];
    this.patchE(i, { notifyRoles: e.notifyRoles.includes(role) ? e.notifyRoles.filter((r) => r !== role) : [...e.notifyRoles, role] });
  }

  protected save(): void {
    const m = this.model();
    if (!m) return;
    this.saving.set(true);
    this.saved.set(false);
    this.errors.set([]);
    this.api.saveWorkflow(this.type, fromEditor(m)).subscribe({
      next: (saved) => { this.saving.set(false); this.saved.set(true); this.model.set(toEditor(saved)); },
      error: (e: unknown) => {
        this.saving.set(false);
        const body = e instanceof HttpErrorResponse ? (e.error as { message?: string; errors?: Record<string, string[]> } | null) : null;
        const all = Object.values(body?.errors ?? {}).flat();
        this.errors.set(all.length ? all : [body?.message ?? (this.translate.instant('core.saveFailed') as string)]);
      },
    });
  }
}
