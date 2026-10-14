import { Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/api-errors';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { RolesApiService } from './roles-api.service';
import { Role, StaffUserRoles } from './roles.models';

/** Which roles each staff member holds. Changes apply the next time that person signs in. */
@Component({
  selector: 'app-user-roles-page',
  imports: [TranslatePipe, PageHeader],
  template: `
    <app-page-header [title]="'roles.usersTitle' | translate" />
    <p class="text-body-secondary">{{ 'roles.usersIntro' | translate }}</p>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (users(); as list) {
      @if (serverError(); as e) {
        <div class="alert alert-danger" role="alert">{{ e }}</div>
      }
      @if (saved()) {
        <div class="alert alert-success" role="status">{{ 'roles.assignSaved' | translate }}</div>
      }
      <div class="table-responsive">
        <table class="table align-middle">
          <caption class="visually-hidden">{{ 'roles.usersTitle' | translate }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ 'settings.name' | translate }}</th>
              <th scope="col">{{ 'roles.rolesCol' | translate }}</th>
              <th scope="col" class="text-center">{{ 'roles.permissionsCol' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (u of list; track u.id) {
              <tr>
                <td>
                  <div class="fw-semibold">{{ u.name }}</div>
                  <div class="small text-body-secondary" dir="ltr">{{ u.email }}</div>
                </td>
                <td>
                  @for (r of roles(); track r.id) {
                    <div class="form-check form-check-inline">
                      <input class="form-check-input" type="checkbox" [id]="'ur-' + u.id + '-' + r.id" [checked]="u.roleIds.includes(r.id)" [disabled]="u.id === auth.user()?.id" (change)="toggle(u, r, $any($event.target))" />
                      <label class="form-check-label" [for]="'ur-' + u.id + '-' + r.id">{{ r.name }}</label>
                    </div>
                  }
                  @if (u.id === auth.user()?.id) {
                    <div class="form-text">{{ 'roles.selfNote' | translate }}</div>
                  }
                </td>
                <td class="text-center"><span class="badge text-bg-secondary">{{ u.permissionCount }}</span></td>
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
export class UserRolesPage {
  private readonly api = inject(RolesApiService);
  protected readonly auth = inject(AuthService);

  protected readonly users = signal<StaffUserRoles[] | null>(null);
  protected readonly roles = signal<Role[]>([]);
  protected readonly failed = signal(false);
  protected readonly saved = signal(false);
  protected readonly serverError = signal<string | null>(null);

  constructor() {
    forkJoin({ users: this.api.users(), roles: this.api.roles() }).subscribe({
      next: ({ users, roles }) => {
        this.roles.set(roles);
        this.users.set(users);
      },
      error: () => this.failed.set(true),
    });
  }

  protected toggle(user: StaffUserRoles, role: Role, box: HTMLInputElement): void {
    const roleIds = user.roleIds.includes(role.id) ? user.roleIds.filter((r) => r !== role.id) : [...user.roleIds, role.id];
    this.serverError.set(null);
    this.saved.set(false);
    this.api.assign(user.id, roleIds).subscribe({
      next: (updated) => {
        this.users.update((list) => (list ?? []).map((u) => (u.id === updated.id ? updated : u)));
        this.saved.set(true);
      },
      error: (e: unknown) => {
        this.serverError.set(apiErrorMessage(e) ?? 'Error');
        box.checked = !box.checked;
      },
    });
  }
}
