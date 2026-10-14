import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { PermissionModule, Role, RoleInput, StaffUserRoles } from './roles.models';

const BASE = '/api/v1/staff';

@Injectable({ providedIn: 'root' })
export class RolesApiService {
  private readonly http = inject(HttpClient);

  roles(): Observable<Role[]> {
    return this.http.get<{ data: Role[] }>(`${BASE}/roles`).pipe(map((r) => r.data));
  }

  catalogue(): Observable<PermissionModule[]> {
    return this.http.get<{ data: PermissionModule[] }>(`${BASE}/permission-catalogue`).pipe(map((r) => r.data));
  }

  create(input: RoleInput): Observable<Role> {
    return this.http.post<{ data: Role }>(`${BASE}/roles`, input).pipe(map((r) => r.data));
  }

  update(id: string, input: RoleInput): Observable<Role> {
    return this.http.put<{ data: Role }>(`${BASE}/roles/${id}`, input).pipe(map((r) => r.data));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/roles/${id}`);
  }

  users(): Observable<StaffUserRoles[]> {
    return this.http.get<{ data: StaffUserRoles[] }>(`${BASE}/role-users`).pipe(map((r) => r.data));
  }

  assign(userId: string, roleIds: string[]): Observable<StaffUserRoles> {
    return this.http.put<{ data: StaffUserRoles }>(`${BASE}/role-users/${userId}`, { roleIds }).pipe(map((r) => r.data));
  }
}
