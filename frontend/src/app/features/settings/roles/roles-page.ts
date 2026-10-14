import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { apiErrorMessage, fieldErrors } from '../../../core/http/api-errors';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { Modal } from '../../../shared/components/modal/modal';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { RolesApiService } from './roles-api.service';
import { PermissionModule, Role, actionLabelKey, moduleLabelKey } from './roles.models';

/** Role Permissions Manager: pick a role, tick what it may do in each module, save. */
@Component({
  selector: 'app-roles-page',
  imports: [TranslatePipe, PageHeader, Modal, ConfirmDialog],
  template: `
    <app-page-header [title]="'roles.title' | translate">
      <button type="button" class="btn btn-primary" (click)="openNew()"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'roles.new' | translate }}</button>
    </app-page-header>
    <p class="text-body-secondary">{{ 'roles.intro' | translate }}</p>

    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (!roles()) {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    } @else {
      <div class="row g-4">
        <div class="col-lg-4 col-xl-3">
          <div class="list-group shadow-sm" role="listbox" [attr.aria-label]="'roles.list' | translate">
            @for (r of roles(); track r.id) {
              <button type="button" role="option" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" [class.active]="r.id === selectedId()" [attr.aria-selected]="r.id === selectedId()" (click)="select(r)">
                <span>
                  @if (r.locked) {
                    <i class="fa-solid fa-lock me-1" aria-hidden="true"></i>
                  }
                  {{ r.name }}
                </span>
                <span class="badge rounded-pill" [class]="r.id === selectedId() ? 'text-bg-light' : 'text-bg-secondary'" [attr.title]="'roles.users' | translate">{{ r.userCount }}</span>
              </button>
            }
          </div>
        </div>

        <div class="col-lg-8 col-xl-9">
          @if (selected(); as role) {
            <div class="card">
              <div class="card-body">
                <div class="row g-3 mb-3">
                  <div class="col-md-5">
                    <label for="role-name" class="form-label">{{ 'roles.name' | translate }}</label>
                    <input id="role-name" class="form-control" [value]="name()" [disabled]="role.system" (input)="name.set($any($event.target).value)" [class.is-invalid]="!!errors()['name']" />
                    @if (errors()['name']) {
                      <div class="invalid-feedback">{{ errors()['name'] }}</div>
                    }
                  </div>
                  <div class="col-md-7">
                    <label for="role-desc" class="form-label">{{ 'roles.description' | translate }}</label>
                    <input id="role-desc" class="form-control" [value]="description()" [disabled]="role.locked" (input)="description.set($any($event.target).value)" />
                  </div>
                </div>

                @if (role.locked) {
                  <div class="alert alert-info" role="status"><i class="fa-solid fa-lock me-2" aria-hidden="true"></i>{{ 'roles.lockedNote' | translate }}</div>
                }

                <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                  <h2 class="h6 mb-0">{{ 'roles.permissions' | translate }} <span class="badge text-bg-secondary">{{ draft().size }}/{{ total() }}</span></h2>
                  @if (!role.locked) {
                    <div class="btn-group btn-group-sm">
                      <button type="button" class="btn btn-outline-secondary" (click)="setAll(true)">{{ 'roles.selectAll' | translate }}</button>
                      <button type="button" class="btn btn-outline-secondary" (click)="setAll(false)">{{ 'roles.clearAll' | translate }}</button>
                    </div>
                  }
                </div>

                <div class="table-responsive">
                  <table class="table align-middle mb-0">
                    <caption class="visually-hidden">{{ 'roles.permissions' | translate }}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{{ 'roles.moduleCol' | translate }}</th>
                        <th scope="col">{{ 'roles.allowed' | translate }}</th>
                        <th scope="col" class="text-center">{{ 'roles.all' | translate }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (m of catalogue(); track m.module) {
                        <tr>
                          <th scope="row" class="fw-semibold text-nowrap">{{ moduleKey(m.module) | translate }}</th>
                          <td>
                            <div class="d-flex flex-wrap">
                              @for (a of m.actions; track a.key) {
                                <div class="form-check form-check-inline">
                                  <input class="form-check-input" type="checkbox" [id]="'p-' + a.key" [checked]="draft().has(a.key)" [disabled]="role.locked" (change)="toggle(a.key)" />
                                  <label class="form-check-label" [for]="'p-' + a.key">{{ actionKey(a.action) | translate }}</label>
                                </div>
                              }
                            </div>
                          </td>
                          <td class="text-center">
                            <input class="form-check-input" type="checkbox" [checked]="moduleAll(m)" [indeterminate]="moduleSome(m)" [disabled]="role.locked" [attr.aria-label]="moduleKey(m.module) | translate" (change)="toggleModule(m)" />
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>

                @if (serverError(); as e) {
                  <div class="alert alert-danger mt-3" role="alert">{{ e }}</div>
                }
                @if (saved()) {
                  <div class="alert alert-success mt-3" role="status">{{ 'roles.saved' | translate }}</div>
                }
                @if (!role.locked) {
                  <div class="d-flex flex-wrap justify-content-between gap-2 mt-3">
                    <div>
                      @if (!role.system) {
                        <button type="button" class="btn btn-outline-danger" (click)="confirmDelete.set(true)"><i class="fa-solid fa-trash me-1" aria-hidden="true"></i>{{ 'common.delete' | translate }}</button>
                      }
                    </div>
                    <div class="d-flex gap-2">
                      <button type="button" class="btn btn-outline-secondary" [disabled]="!dirty()" (click)="select(role)">{{ 'roles.reset' | translate }}</button>
                      <button type="button" class="btn btn-primary" [disabled]="!dirty() || busy()" (click)="save(role)">{{ 'common.save' | translate }}</button>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    }

    @if (creating()) {
      <app-modal [title]="'roles.new' | translate" (closed)="creating.set(false)">
        <form (submit)="$event.preventDefault(); create()" novalidate>
          <label for="new-name" class="form-label">{{ 'roles.name' | translate }} *</label>
          <input id="new-name" class="form-control mb-3" [value]="newName()" (input)="newName.set($any($event.target).value)" [class.is-invalid]="!!errors()['name']" />
          @if (errors()['name']) {
            <div class="invalid-feedback d-block mb-2">{{ errors()['name'] }}</div>
          }
          <label for="new-desc" class="form-label">{{ 'roles.description' | translate }}</label>
          <input id="new-desc" class="form-control" [value]="newDescription()" (input)="newDescription.set($any($event.target).value)" />
          @if (serverError(); as e) {
            <div class="alert alert-danger mt-3" role="alert">{{ e }}</div>
          }
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button type="button" class="btn btn-outline-secondary" (click)="creating.set(false)">{{ 'common.cancel' | translate }}</button>
            <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ 'common.save' | translate }}</button>
          </div>
        </form>
      </app-modal>
    }

    @if (confirmDelete() && selected(); as role) {
      <app-confirm-dialog [title]="'roles.deleteTitle' | translate" [message]="('roles.deleteMessage' | translate) + ' ' + role.name" [confirmLabel]="'common.delete' | translate" [danger]="true" (cancelled)="confirmDelete.set(false)" (confirmed)="remove(role)" />
    }
  `,
})
export class RolesPage {
  private readonly api = inject(RolesApiService);

  protected readonly roles = signal<Role[] | null>(null);
  protected readonly catalogue = signal<PermissionModule[]>([]);
  protected readonly failed = signal(false);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly draft = signal<ReadonlySet<string>>(new Set());
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly busy = signal(false);
  protected readonly saved = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly creating = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly newName = signal('');
  protected readonly newDescription = signal('');

  protected readonly moduleKey = moduleLabelKey;
  protected readonly actionKey = actionLabelKey;
  protected readonly selected = computed(() => this.roles()?.find((r) => r.id === this.selectedId()) ?? null);
  protected readonly total = computed(() => this.catalogue().reduce((n, m) => n + m.actions.length, 0));
  protected readonly dirty = computed(() => {
    const role = this.selected();
    if (!role) return false;
    const same = role.permissions.length === this.draft().size && role.permissions.every((p) => this.draft().has(p));
    return !same || this.name() !== role.name || this.description() !== role.description;
  });

  constructor() {
    forkJoin({ roles: this.api.roles(), catalogue: this.api.catalogue() }).subscribe({
      next: ({ roles, catalogue }) => {
        this.catalogue.set(catalogue);
        this.roles.set(roles);
        if (roles[0]) this.select(roles[0]);
      },
      error: () => this.failed.set(true),
    });
  }

  protected select(role: Role): void {
    this.selectedId.set(role.id);
    this.draft.set(new Set(role.permissions));
    this.name.set(role.name);
    this.description.set(role.description);
    this.clearMessages();
  }

  protected toggle(key: string): void {
    const next = new Set(this.draft());
    if (!next.delete(key)) next.add(key);
    this.draft.set(next);
    this.saved.set(false);
  }

  protected setAll(on: boolean): void {
    this.draft.set(on ? new Set(this.catalogue().flatMap((m) => m.actions.map((a) => a.key))) : new Set());
    this.saved.set(false);
  }

  protected moduleAll(m: PermissionModule): boolean {
    return m.actions.every((a) => this.draft().has(a.key));
  }

  protected moduleSome(m: PermissionModule): boolean {
    return !this.moduleAll(m) && m.actions.some((a) => this.draft().has(a.key));
  }

  protected toggleModule(m: PermissionModule): void {
    const next = new Set(this.draft());
    const all = this.moduleAll(m);
    m.actions.forEach((a) => (all ? next.delete(a.key) : next.add(a.key)));
    this.draft.set(next);
    this.saved.set(false);
  }

  protected openNew(): void {
    this.newName.set('');
    this.newDescription.set('');
    this.clearMessages();
    this.creating.set(true);
  }

  protected create(): void {
    this.clearMessages();
    this.busy.set(true);
    this.api.create({ name: this.newName(), description: this.newDescription(), permissions: [] }).subscribe({
      next: (role) => {
        this.busy.set(false);
        this.creating.set(false);
        this.roles.update((list) => [...(list ?? []), role]);
        this.select(role);
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  protected save(role: Role): void {
    this.clearMessages();
    this.busy.set(true);
    this.api.update(role.id, { name: this.name(), description: this.description(), permissions: [...this.draft()] }).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.roles.update((list) => (list ?? []).map((r) => (r.id === updated.id ? updated : r)));
        this.select(updated);
        this.saved.set(true);
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  protected remove(role: Role): void {
    this.confirmDelete.set(false);
    this.clearMessages();
    this.api.remove(role.id).subscribe({
      next: () => {
        const rest = (this.roles() ?? []).filter((r) => r.id !== role.id);
        this.roles.set(rest);
        if (rest[0]) this.select(rest[0]);
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  private fail(e: unknown): void {
    this.busy.set(false);
    this.errors.set(fieldErrors(e));
    this.serverError.set(apiErrorMessage(e) ?? 'Error');
  }

  private clearMessages(): void {
    this.errors.set({});
    this.serverError.set(null);
    this.saved.set(false);
  }
}
