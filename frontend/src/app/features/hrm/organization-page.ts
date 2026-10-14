import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { Modal } from '../../shared/components/modal/modal';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { HrmApiService } from './hrm-api.service';
import { DepartmentNode, OrgKind } from './hrm.models';

type Row = { id: string; code: string; active: boolean } & Record<string, unknown>;
interface Named {
  id: string;
  name: string;
}
interface Field {
  key: string;
  type: 'text' | 'number' | 'department' | 'grade';
  required?: boolean;
}

const KINDS: Array<{ kind: OrgKind; label: string; fields: Field[]; name: string }> = [
  { kind: 'departments', label: 'hrm.org.departments', name: 'name', fields: [{ key: 'code', type: 'text', required: true }, { key: 'name', type: 'text', required: true }, { key: 'nameAr', type: 'text' }, { key: 'costCenter', type: 'text' }, { key: 'parentId', type: 'department' }] },
  { kind: 'branches', label: 'hrm.org.branches', name: 'name', fields: [{ key: 'code', type: 'text', required: true }, { key: 'name', type: 'text', required: true }, { key: 'nameAr', type: 'text' }, { key: 'address', type: 'text' }] },
  { kind: 'grades', label: 'hrm.org.grades', name: 'name', fields: [{ key: 'code', type: 'text', required: true }, { key: 'name', type: 'text', required: true }, { key: 'level', type: 'number', required: true }] },
  { kind: 'positions', label: 'hrm.org.positions', name: 'title', fields: [{ key: 'code', type: 'text', required: true }, { key: 'title', type: 'text', required: true }, { key: 'titleAr', type: 'text' }, { key: 'departmentId', type: 'department' }, { key: 'gradeId', type: 'grade' }] },
];

/** Departments (as a tree), branches, grades and positions. Units are closed, never deleted, so history stays readable. */
@Component({
  selector: 'app-organization-page',
  imports: [TranslatePipe, PageHeader, StatusBadge, Modal],
  template: `
    <app-page-header [title]="'hrm.org.title' | translate">
      @if (canManage()) {
        <button type="button" class="btn btn-primary" (click)="openForm()"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'hrm.org.add' | translate }}</button>
      }
    </app-page-header>
    <ul class="nav nav-tabs mb-3" role="tablist">
      @for (k of kinds; track k.kind) {
        <li class="nav-item" role="presentation">
          <button type="button" role="tab" class="nav-link" [class.active]="k.kind === kind()" [attr.aria-selected]="k.kind === kind()" (click)="select(k.kind)">{{ k.label | translate }}</button>
        </li>
      }
    </ul>
    @if (error(); as e) {
      <div class="alert alert-danger" role="alert">{{ e }}</div>
    }

    @if (kind() === 'departments') {
      <ul class="list-group mb-3">
        @for (n of flat(); track n.node.id) {
          <li class="list-group-item d-flex align-items-center gap-2" [style.padding-inline-start.rem]="1 + n.depth * 1.5">
            <span class="fw-semibold">{{ n.node.name }}</span>
            <span class="text-body-secondary small" dir="ltr">{{ n.node.code }}</span>
            <span class="badge text-bg-light ms-auto">{{ 'hrm.org.headcount' | translate: { n: n.node.headcount } }}</span>
            @if (!n.node.active) { <app-status-badge [label]="'hrm.org.closed' | translate" tone="secondary" /> }
            @if (canManage()) {
              <button type="button" class="btn btn-outline-secondary btn-sm" (click)="openForm(n.node)">{{ 'common.edit' | translate }}<span class="visually-hidden"> {{ n.node.name }}</span></button>
            }
          </li>
        } @empty {
          <li class="list-group-item text-body-secondary">{{ 'hrm.org.none' | translate }}</li>
        }
      </ul>
    } @else {
      <div class="table-responsive">
        <table class="table align-middle">
          <caption class="visually-hidden">{{ current().label | translate }}</caption>
          <thead>
            <tr>
              @for (f of current().fields; track f.key) { <th scope="col">{{ 'hrm.org.fields.' + f.key | translate }}</th> }
              <th scope="col">{{ 'hrm.org.status' | translate }}</th>
              <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr>
                @for (f of current().fields; track f.key) { <td>{{ show(r, f) }}</td> }
                <td><app-status-badge [label]="(r.active ? 'hrm.org.open' : 'hrm.org.closed') | translate" [tone]="r.active ? 'success' : 'secondary'" /></td>
                <td class="text-end text-nowrap">
                  @if (canManage()) {
                    <button type="button" class="btn btn-outline-secondary btn-sm me-1" (click)="openForm(r)">{{ 'common.edit' | translate }}<span class="visually-hidden"> {{ r.code }}</span></button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" (click)="toggle(r)">{{ (r.active ? 'hrm.org.close' : 'hrm.org.reopen') | translate }}<span class="visually-hidden"> {{ r.code }}</span></button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td [attr.colspan]="current().fields.length + 2" class="text-center text-body-secondary py-4">{{ 'hrm.org.none' | translate }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (form(); as f) {
      <app-modal [title]="(f.id ? 'hrm.org.edit' : 'hrm.org.add') | translate" (closed)="form.set(null)">
        <form (submit)="$event.preventDefault(); save()">
          @for (fld of current().fields; track fld.key) {
            <div class="mb-3">
              <label [for]="'org-' + fld.key" class="form-label">{{ 'hrm.org.fields.' + fld.key | translate }}</label>
              @switch (fld.type) {
                @case ('department') {
                  <select [id]="'org-' + fld.key" class="form-select" [value]="f.values[fld.key] ?? ''" (change)="set(fld.key, $any($event.target).value)">
                    <option value="">-</option>
                    @for (d of departments(); track d.id) { @if (d.id !== f.id) { <option [value]="d.id">{{ d.name }}</option> } }
                  </select>
                }
                @case ('grade') {
                  <select [id]="'org-' + fld.key" class="form-select" [value]="f.values[fld.key] ?? ''" (change)="set(fld.key, $any($event.target).value)">
                    <option value="">-</option>
                    @for (g of grades(); track g.id) { <option [value]="g.id">{{ g.name }}</option> }
                  </select>
                }
                @default {
                  <input [id]="'org-' + fld.key" class="form-control" [type]="fld.type" [value]="f.values[fld.key] ?? ''" (input)="set(fld.key, $any($event.target).value)" [class.is-invalid]="!!errors()[fld.key]" [attr.aria-invalid]="!!errors()[fld.key]" />
                }
              }
              @if (errors()[fld.key]; as msg) { <div class="invalid-feedback d-block" role="alert">{{ msg }}</div> }
            </div>
          }
          @if (errors()['active']; as msg) { <div class="alert alert-danger" role="alert">{{ msg }}</div> }
          <div class="d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-outline-secondary" (click)="form.set(null)">{{ 'common.cancel' | translate }}</button>
            <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ 'common.save' | translate }}</button>
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class OrganizationPage {
  private readonly api = inject(HrmApiService);
  private readonly auth = inject(AuthService);
  protected readonly kinds = KINDS;
  protected readonly kind = signal<OrgKind>('departments');
  protected readonly current = computed(() => KINDS.find((k) => k.kind === this.kind())!);
  protected readonly canManage = computed(() => this.auth.can('hr.org.manage'));
  protected readonly rows = signal<Row[]>([]);
  protected readonly tree = signal<DepartmentNode[]>([]);
  protected readonly departments = signal<Named[]>([]);
  protected readonly grades = signal<Named[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  protected readonly form = signal<{ id?: string; values: Record<string, unknown> } | null>(null);

  protected readonly flat = computed(() => {
    const out: Array<{ node: DepartmentNode; depth: number }> = [];
    const walk = (nodes: DepartmentNode[], depth: number) => nodes.forEach((n) => (out.push({ node: n, depth }), walk(n.children, depth + 1)));
    walk(this.tree(), 0);
    return out;
  });

  constructor() {
    this.reload();
  }

  protected select(k: OrgKind): void {
    this.kind.set(k);
    this.error.set(null);
    this.reload();
  }

  private reload(): void {
    const fail = (e: unknown) => this.error.set(apiErrorMessage(e));
    if (this.kind() === 'departments') this.api.departmentTree().subscribe({ next: (t) => this.tree.set(t), error: fail });
    else this.api.org<Row>(this.kind()).subscribe({ next: (r) => this.rows.set(r), error: fail });
    this.api.org<Named>('departments').subscribe((r) => this.departments.set(r));
    this.api.org<Named>('grades').subscribe((r) => this.grades.set(r));
  }

  protected show(r: Row, f: Field): string {
    const v = r[f.key];
    if (f.type === 'department') return this.departments().find((d) => d.id === v)?.name ?? '';
    if (f.type === 'grade') return this.grades().find((g) => g.id === v)?.name ?? '';
    return v == null ? '' : String(v);
  }

  protected openForm(r?: Row | DepartmentNode): void {
    this.errors.set({});
    this.form.set({ id: r?.id, values: r ? { ...(r as unknown as Record<string, unknown>) } : {} });
  }

  protected set(key: string, value: string): void {
    this.form.update((f) => f && { ...f, values: { ...f.values, [key]: value } });
  }

  protected save(): void {
    const f = this.form();
    if (!f) return;
    const body: Record<string, unknown> = {};
    for (const fld of this.current().fields) body[fld.key] = fld.type === 'number' ? Number(f.values[fld.key]) : (f.values[fld.key] ?? '');
    this.busy.set(true);
    this.api.saveOrg(this.kind(), body, f.id).subscribe({
      next: () => (this.busy.set(false), this.form.set(null), this.reload()),
      error: (e: unknown) => (this.busy.set(false), this.errors.set(fieldErrors(e))),
    });
  }

  protected toggle(r: Row): void {
    this.error.set(null);
    this.api.saveOrg(this.kind(), { active: !r.active }, r.id).subscribe({ next: () => this.reload(), error: (e: unknown) => this.error.set(fieldErrors(e)['active'] ?? apiErrorMessage(e)) });
  }
}
