import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin, map, switchMap } from 'rxjs';
import { apiErrorMessage } from '../../core/http/api-errors';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { Modal } from '../../shared/components/modal/modal';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { ClientScriptRuntime } from './client-script-runtime';
import { CoreApiService } from './core-api.service';
import { DocTypeMeta } from './core.models';
import { SERVER_EVENTS, ScriptDef, ScriptInput, ScriptKind, ScriptLogRow, ScriptsApiService, ServerEvent, TestResult } from './scripts-api.service';

interface Draft { id: string | null; kind: ScriptKind; name: string; event: ServerEvent; order: number; enabled: boolean; description: string; code: string }

const SERVER_SAMPLE = `// Runs on the server when the event happens. Available: doc, user, ctx, set(), msg(), log(), throw_error(), db.get(), db.list()
if (doc.data.amount < 0) throw_error("Amount cannot be negative");
`;
const CLIENT_SAMPLE = `// Runs in the browser, in its own sandbox. Available: frm
frm.on("refresh", () => {
  frm.toggle("notes", frm.get("amount") > 100);
});
`;

/** The scripts of one document type: list, edit, test and read the logs. Needs developer.scripts. */
@Component({
  selector: 'app-scripts-page',
  imports: [FormsModule, RouterLink, TranslatePipe, PageHeader, Modal, ConfirmDialog, DatePipe],
  template: `
    <app-page-header [title]="meta() ? ('core.scripts.title' | translate: { label: meta()!.label }) : ('core.scripts.titlePlain' | translate)">
      <a class="btn btn-outline-secondary" routerLink="/app/doctypes">{{ 'core.docTypes.back' | translate }}</a>
      <button type="button" class="btn btn-primary" (click)="openNew('server')">{{ 'core.scripts.newServer' | translate }}</button>
      <button type="button" class="btn btn-outline-primary" (click)="openNew('client')">{{ 'core.scripts.newClient' | translate }}</button>
    </app-page-header>

    @if (loadFailed()) {
      <div class="alert alert-danger" role="alert">{{ 'core.loadFailed' | translate }}</div>
    } @else if (list(); as scripts) {
      <p class="text-body-secondary small">{{ 'core.scripts.intro' | translate }}</p>
      @if (scripts.length === 0) { <p>{{ 'core.scripts.none' | translate }}</p> } @else {
        <div class="table-responsive"><table class="table align-middle">
          <caption class="visually-hidden">{{ 'core.scripts.title' | translate: { label: meta()?.label ?? '' } }}</caption>
          <thead><tr><th scope="col">{{ 'core.scripts.name' | translate }}</th><th scope="col">{{ 'core.scripts.kind' | translate }}</th><th scope="col">{{ 'core.scripts.event' | translate }}</th><th scope="col">{{ 'core.scripts.order' | translate }}</th><th scope="col">{{ 'core.scripts.enabled' | translate }}</th><th scope="col">{{ 'core.scripts.version' | translate }}</th><th scope="col"></th></tr></thead>
          <tbody>
            @for (s of scripts; track s.id) {
              <tr>
                <td dir="ltr"><code>{{ s.name }}</code></td>
                <td>{{ ('core.scripts.kinds.' + s.kind) | translate }}</td>
                <td dir="ltr">{{ s.event ?? '—' }}</td>
                <td>{{ s.order }}</td>
                <td><div class="form-check form-switch"><input type="checkbox" class="form-check-input" role="switch" [id]="'sw-' + s.id" [checked]="s.enabled" (change)="toggle(s)" /><label class="visually-hidden" [for]="'sw-' + s.id">{{ 'core.scripts.enabled' | translate }} {{ s.name }}</label></div></td>
                <td>{{ s.version }}</td>
                <td class="text-end text-nowrap">
                  <button type="button" class="btn btn-outline-secondary btn-sm" (click)="edit(s)">{{ 'common.edit' | translate }}<span class="visually-hidden"> {{ s.name }}</span></button>
                  @if (s.kind === 'server') { <button type="button" class="btn btn-outline-secondary btn-sm ms-1" (click)="openLogs(s)">{{ 'core.scripts.logs' | translate }}<span class="visually-hidden"> {{ s.name }}</span></button> }
                  <button type="button" class="btn btn-outline-danger btn-sm ms-1" (click)="toDelete.set(s)">{{ 'common.delete' | translate }}<span class="visually-hidden"> {{ s.name }}</span></button>
                </td>
              </tr>
            }
          </tbody>
        </table></div>
      }
      @if (actionError(); as e) { <div class="alert alert-danger" role="alert">{{ e }}</div> }
    } @else {
      <p role="status">{{ 'common.loading' | translate }}</p>
    }

    @if (draft(); as d) {
      <app-modal [title]="(d.id ? 'common.edit' : (d.kind === 'server' ? 'core.scripts.newServer' : 'core.scripts.newClient')) | translate" width="56rem" (closed)="draft.set(null)">
        <div class="row g-3">
          <div class="col-md-4"><label class="form-label" for="sc-name">{{ 'core.scripts.name' | translate }} *</label><input id="sc-name" class="form-control" dir="ltr" [ngModel]="d.name" (ngModelChange)="patch({ name: $event })" /></div>
          @if (d.kind === 'server') {
            <div class="col-md-4"><label class="form-label" for="sc-event">{{ 'core.scripts.event' | translate }}</label><select id="sc-event" class="form-select" dir="ltr" [ngModel]="d.event" (ngModelChange)="patch({ event: $event })">@for (e of events; track e) { <option [value]="e">{{ e }}</option> }</select></div>
          }
          <div class="col-md-2"><label class="form-label" for="sc-order">{{ 'core.scripts.order' | translate }}</label><input id="sc-order" type="number" min="0" max="10000" class="form-control" dir="ltr" [ngModel]="d.order" (ngModelChange)="patch({ order: $event })" /></div>
          <div class="col-md-2 form-check form-switch mt-md-4 ps-md-5"><input id="sc-on" type="checkbox" class="form-check-input" role="switch" [ngModel]="d.enabled" (ngModelChange)="patch({ enabled: $event })" /><label class="form-check-label" for="sc-on">{{ 'core.scripts.enabled' | translate }}</label></div>
          <div class="col-12"><label class="form-label" for="sc-desc">{{ 'core.scripts.description' | translate }}</label><input id="sc-desc" class="form-control" [ngModel]="d.description" (ngModelChange)="patch({ description: $event })" /></div>
          <div class="col-12">
            <label class="form-label" for="sc-code">{{ 'core.scripts.code' | translate }} *</label>
            <textarea id="sc-code" class="form-control font-monospace" dir="ltr" rows="14" spellcheck="false" autocapitalize="off" [ngModel]="d.code" (ngModelChange)="patch({ code: $event })"></textarea>
            <details class="mt-2 small"><summary>{{ 'core.scripts.reference' | translate }}</summary>
              @if (d.kind === 'server') { <pre class="mb-0" dir="ltr">{{ serverHelp }}</pre> } @else { <pre class="mb-0" dir="ltr">{{ clientHelp }}</pre> }
            </details>
          </div>
        </div>
        @if (draftError(); as e) { <div class="alert alert-danger mt-3" role="alert">{{ e }}</div> }

        @if (d.id) {
          <section class="border rounded p-3 mt-3" aria-labelledby="sc-test-title">
            <h3 class="h6" id="sc-test-title">{{ 'core.scripts.test' | translate }}</h3>
            @if (d.kind === 'server') {
              <p class="small text-body-secondary mb-2">{{ 'core.scripts.testHintServer' | translate }}</p>
              <label class="form-label" for="sc-sample">{{ 'core.scripts.sample' | translate }}</label>
              <textarea id="sc-sample" class="form-control font-monospace mb-2" dir="ltr" rows="4" spellcheck="false" [ngModel]="sample()" (ngModelChange)="sample.set($event)"></textarea>
            } @else {
              <p class="small text-body-secondary mb-2">{{ 'core.scripts.testHintClient' | translate }}</p>
            }
            <button type="button" class="btn btn-outline-primary btn-sm" [disabled]="testing()" (click)="runTest()">{{ 'core.scripts.run' | translate }}</button>
            @if (result(); as r) {
              <div class="mt-2" role="status" data-testid="test-result">
                <span class="badge" [class]="r.ok ? 'text-bg-success' : 'text-bg-danger'">{{ r.ok ? ('core.scripts.passed' | translate) : r.kind }}</span>
                <span class="small text-body-secondary ms-2">{{ r.durationMs }} ms</span>
                @if (!r.ok) { <div class="text-danger mt-1">{{ r.message }}</div> }
                @if (r.messages.length) { <div class="mt-1"><strong>{{ 'core.scripts.messages' | translate }}</strong><ul class="mb-0">@for (m of r.messages; track $index) { <li>{{ m }}</li> }</ul></div> }
                @if (r.logs.length) { <div class="mt-1"><strong>{{ 'core.scripts.logOutput' | translate }}</strong><pre class="mb-0 small" dir="ltr">{{ r.logs.join('\\n') }}</pre></div> }
                @if (r.ok && r.data) { <div class="mt-1"><strong>{{ 'core.scripts.resultData' | translate }}</strong><pre class="mb-0 small" dir="ltr">{{ r.data }}</pre></div> }
              </div>
            }
          </section>
        } @else {
          <p class="small text-body-secondary mt-3 mb-0">{{ 'core.scripts.saveToTest' | translate }}</p>
        }
        <div class="d-flex justify-content-end gap-2 mt-3">
          <button type="button" class="btn btn-outline-secondary" (click)="draft.set(null)">{{ 'common.cancel' | translate }}</button>
          <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">{{ 'common.save' | translate }}</button>
        </div>
      </app-modal>
    }

    @if (logsFor(); as s) {
      <app-modal [title]="('core.scripts.logsOf' | translate: { name: s.name })" width="56rem" (closed)="logsFor.set(null)">
        @if (logs().length === 0) { <p class="text-body-secondary">{{ 'core.scripts.noLogs' | translate }}</p> } @else {
          <div class="table-responsive"><table class="table table-sm align-middle">
            <thead><tr><th scope="col">{{ 'core.scripts.when' | translate }}</th><th scope="col">{{ 'core.scripts.event' | translate }}</th><th scope="col">{{ 'core.records.name' | translate }}</th><th scope="col">{{ 'core.workflow.status' | translate }}</th><th scope="col">{{ 'core.scripts.output' | translate }}</th></tr></thead>
            <tbody>@for (l of logs(); track $index) {
              <tr><td><bdi>{{ l.at | date: 'medium' }}</bdi></td><td dir="ltr">{{ l.event }}</td><td dir="ltr">{{ l.record || '—' }}</td>
                <td><span class="badge" [class]="l.ok ? 'text-bg-success' : 'text-bg-danger'">{{ l.ok ? ('core.scripts.passed' | translate) : l.kind }}</span> <span class="small text-body-secondary">{{ l.durationMs }} ms</span></td>
                <td class="small">@if (l.message) { <div class="text-danger">{{ l.message }}</div> }@for (x of l.logs; track $index) { <div dir="ltr">{{ x }}</div> }</td></tr>
            }</tbody>
          </table></div>
        }
      </app-modal>
    }

    @if (toDelete(); as s) {
      <app-confirm-dialog [title]="'common.delete' | translate" [message]="'core.scripts.deleteMessage' | translate: { name: s.name }" [confirmLabel]="'common.delete' | translate" [danger]="true" (cancelled)="toDelete.set(null)" (confirmed)="remove(s)" />
    }
  `,
})
export class ScriptsPage {
  private readonly core = inject(CoreApiService);
  private readonly api = inject(ScriptsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private type = '';
  protected readonly events = SERVER_EVENTS;
  protected readonly serverHelp = [
    'doc            { name, isNew, state, data }   change doc.data in before_save; other events cannot change the record',
    'user           { id, name, roles }            the person acting (also ctx.user)',
    'ctx            { user, event, doctype, action?, comment? }',
    'set(f, v)      same as doc.data[f] = v',
    'msg(text)      shown to the person (up to 10)',
    'log(...)       kept in the script logs (up to 50 lines)',
    'throw_error(t) refuses the operation with the text t (before_* events)',
    'await db.get(doctype, name)            a record you may view, or null',
    'await db.list(doctype, { q, limit })   up to 20 records you may view',
    'Limits: 500 ms, 8 MB, 20 lookups, no network, no files. Three timeouts in 10 minutes switch the script off.',
  ].join('\n');
  protected readonly clientHelp = [
    'frm.on(event, fn)        events: onload, refresh, validate, before_save, change:<field>',
    'frm.get(field)           frm.set(field, value)',
    'frm.toggle(field, show)  frm.set_required(field, on)  frm.set_readonly(field, on)',
    'frm.msg(text)            frm.throw(text)  (in validate: refuses the save)',
    'frm.add_button(label, fn)',
    'frm.user { id, name, permissions }     frm.doc { name, isNew, state }',
    'Limits: 150 ms per event, 8 MB, no window, document, cookies, storage or network. Scripts only help the person; the server enforces the rules.',
  ].join('\n');

  protected readonly meta = signal<DocTypeMeta | null>(null);
  protected readonly list = signal<ScriptDef[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly draft = signal<Draft | null>(null);
  protected readonly draftError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly testing = signal(false);
  protected readonly sample = signal('{\n  "title": "Example",\n  "amount": 10\n}');
  protected readonly result = signal<{ ok: boolean; kind?: string; message?: string; messages: string[]; logs: string[]; durationMs: number; data?: string } | null>(null);
  protected readonly toDelete = signal<ScriptDef | null>(null);
  protected readonly logsFor = signal<ScriptDef | null>(null);
  protected readonly logs = signal<ScriptLogRow[]>([]);
  protected readonly fieldNames = computed(() => (this.meta()?.fields ?? []).map((f) => f.fieldname));

  constructor() {
    this.route.paramMap
      .pipe(
        map((p) => (this.type = p.get('name') ?? '')),
        switchMap((t) => forkJoin({ meta: this.core.meta(t), list: this.api.list(t) })),
        takeUntilDestroyed(),
      )
      .subscribe({ next: ({ meta, list }) => { this.meta.set(meta); this.list.set(list); }, error: () => this.loadFailed.set(true) });
  }

  private reload(): void { this.api.list(this.type).subscribe((l) => this.list.set(l)); }

  protected openNew(kind: ScriptKind): void {
    this.draft.set({ id: null, kind, name: '', event: 'before_save', order: 100, enabled: true, description: '', code: kind === 'server' ? SERVER_SAMPLE : CLIENT_SAMPLE });
    this.draftError.set(null);
    this.result.set(null);
  }

  protected edit(s: ScriptDef): void {
    this.draft.set({ id: s.id, kind: s.kind, name: s.name, event: (s.event ?? 'before_save') as ServerEvent, order: s.order, enabled: s.enabled, description: s.description ?? '', code: s.code });
    this.draftError.set(null);
    this.result.set(null);
  }

  protected patch(change: Partial<Draft>): void { this.draft.update((d) => (d ? { ...d, ...change } : d)); }

  protected save(): void {
    const d = this.draft();
    if (!d) return;
    const input: ScriptInput = { name: d.name.trim(), code: d.code, enabled: d.enabled, order: d.order, description: d.description, ...(d.kind === 'server' ? { event: d.event } : {}) };
    this.saving.set(true);
    this.draftError.set(null);
    const call = d.id ? this.api.update(d.id, input) : this.api.create({ ...input, doctype: this.type, kind: d.kind });
    call.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.reload();
        // stay open on a first save so it can be tested straight away
        this.draft.set({ ...d, id: saved.id });
      },
      error: (e) => { this.saving.set(false); this.draftError.set(this.firstMessages(e)); },
    });
  }

  /** Every problem the server listed, so a script with several mistakes is fixed in one go. */
  private firstMessages(e: unknown): string {
    const body = (e as { error?: { errors?: Record<string, string[]>; message?: string } })?.error;
    const all = Object.entries(body?.errors ?? {}).flatMap(([k, v]) => v.map((m) => `${k}: ${m}`));
    return all.length ? all.join('\n') : (apiErrorMessage(e) ?? (this.translate.instant('core.saveFailed') as string));
  }

  protected toggle(s: ScriptDef): void {
    this.actionError.set(null);
    this.api.update(s.id, { enabled: !s.enabled }).subscribe({ next: () => this.reload(), error: (e) => { this.actionError.set(apiErrorMessage(e)); this.reload(); } });
  }

  protected remove(s: ScriptDef): void {
    this.toDelete.set(null);
    this.api.remove(s.id).subscribe({ next: () => this.reload(), error: (e) => this.actionError.set(apiErrorMessage(e)) });
  }

  protected openLogs(s: ScriptDef): void {
    this.logsFor.set(s);
    this.logs.set([]);
    this.api.logs(s.id).subscribe((l) => this.logs.set(l));
  }

  protected runTest(): void {
    const d = this.draft();
    if (!d?.id) return;
    this.result.set(null);
    if (d.kind === 'client') { void this.testClient(d); return; }
    let data: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(this.sample());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object');
      data = parsed as Record<string, unknown>;
    } catch {
      this.result.set({ ok: false, kind: 'error', message: this.translate.instant('core.scripts.badSample') as string, messages: [], logs: [], durationMs: 0 });
      return;
    }
    this.testing.set(true);
    this.api.test(d.id, { data }).subscribe({
      next: (r: TestResult) => { this.testing.set(false); this.result.set({ ok: r.ok, kind: r.ok ? undefined : r.kind, message: r.ok ? undefined : r.message, messages: r.messages, logs: r.logs, durationMs: r.durationMs, data: r.ok ? JSON.stringify(r.doc.data, null, 2) : undefined }); },
      error: (e) => { this.testing.set(false); this.result.set({ ok: false, kind: 'error', message: apiErrorMessage(e) ?? '', messages: [], logs: [], durationMs: 0 }); },
    });
  }

  /** Runs the code of a client script in the same sandbox the form uses, on an empty form, and reports what it would do. */
  private async testClient(d: Draft): Promise<void> {
    this.testing.set(true);
    const t = Date.now();
    try {
      const rt = await ClientScriptRuntime.create([{ name: d.name || 'script', code: d.code }]);
      const snapshot = { values: {}, fields: this.fieldNames(), doc: { name: '', isNew: true, state: null }, user: { id: '', name: '', roles: [], permissions: [] } };
      const onload = rt.emit('onload', snapshot);
      const refresh = rt.emit('refresh', snapshot);
      const problems = [...rt.loadErrors, ...onload.errors, ...refresh.errors];
      const messages = [...onload.messages, ...refresh.messages, ...[...onload.commands, ...refresh.commands].map((c) => `${c.t} ${c.field}${'value' in c ? ' = ' + JSON.stringify(c.value) : ''}`)];
      rt.dispose();
      this.result.set(problems.length ? { ok: false, kind: 'error', message: problems.join(' | '), messages, logs: [], durationMs: Date.now() - t } : { ok: true, messages, logs: [], durationMs: Date.now() - t });
    } catch (e) {
      this.result.set({ ok: false, kind: 'error', message: String((e as Error)?.message ?? e), messages: [], logs: [], durationMs: Date.now() - t });
    } finally { this.testing.set(false); }
  }
}
