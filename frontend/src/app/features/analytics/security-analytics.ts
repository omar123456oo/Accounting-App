import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, forkJoin, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { AuditEvent } from '../audit/audit.models';
import { Page } from '../clients/client.models';
import { RolesApiService } from '../settings/roles/roles-api.service';
import { Role, StaffUserRoles } from '../settings/roles/roles.models';
import { AnalyticsFormat } from './analytics-format';
import { BarList, ChartCard, ChartItem, ColumnChart, KpiCard } from './analytics-charts';
import { addDaysIso, countBy, fetchAll, todayIso, topN } from './analytics.helpers';

/** Who did what and who may do what: activity from the audit trail and the spread of roles over people. */
@Component({
  selector: 'app-security-analytics',
  imports: [TranslatePipe, KpiCard, ChartCard, BarList, ColumnChart],
  template: `
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (m(); as d) {
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3"><app-kpi-card icon="clipboard-list" [label]="'analytics.security.events' | translate" [value]="f.int(d.events)" [hint]="'analytics.security.eventsHint' | translate: { days: d.days }" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="user-lock" [label]="'analytics.security.failed' | translate" [value]="f.int(d.failedLogins)" [hint]="'analytics.security.failedHint' | translate: { n: d.lockouts }" [tone]="d.lockouts ? 'danger' : d.failedLogins ? 'warning' : 'success'" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="user-shield" [label]="'analytics.security.roleChanges' | translate" [value]="f.int(d.roleChanges)" [hint]="'analytics.security.roleChangesHint' | translate" /></div>
        @if (d.roles; as r) {
          <div class="col-6 col-lg-3"><app-kpi-card icon="crown" [label]="'analytics.security.superAdmins' | translate" [value]="f.int(r.superAdmins)" [hint]="'analytics.security.superHint' | translate: { n: r.noRole }" [tone]="r.superAdmins > 2 ? 'warning' : 'body'" /></div>
        }
      </div>
      <div class="row g-3">
        <div class="col-lg-6"><app-chart-card [title]="'analytics.security.perDay' | translate"><app-column-chart [items]="d.perDay" [label]="'analytics.security.perDay' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.security.byAction' | translate"><app-bar-list [items]="d.byAction" [label]="'analytics.security.byAction' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.security.byActor' | translate"><app-bar-list [items]="d.byActor" [label]="'analytics.security.byActor' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        @if (d.roles; as r) {
          <div class="col-lg-6"><app-chart-card [title]="'analytics.security.usersPerRole' | translate"><app-bar-list [items]="r.perRole" [label]="'analytics.security.usersPerRole' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        }
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class SecurityAnalytics {
  protected readonly f = inject(AnalyticsFormat);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly rolesApi = inject(RolesApiService);
  protected readonly failed = signal(false);
  private readonly data = signal<{ events: AuditEvent[]; roles: Role[] | null; users: StaffUserRoles[] | null } | null>(null);
  private readonly windowDays = 14;

  protected readonly m = computed(() => {
    const r = this.data();
    if (!r) return null;
    const today = todayIso();
    const since = addDaysIso(today, -(this.windowDays - 1));
    const recent = r.events.filter((e) => e.occurredAt.slice(0, 10) >= since);
    const perDayCount = countBy(recent, (e) => e.occurredAt.slice(0, 10));
    const days = Array.from({ length: this.windowDays }, (_, i) => addDaysIso(since, i));
    const byAction = countBy(recent, (e) => e.action);
    return {
      days: this.windowDays,
      events: recent.length,
      failedLogins: byAction['auth.login_failed'] ?? 0,
      lockouts: byAction['auth.lockout'] ?? 0,
      roleChanges: (byAction['roles.assign'] ?? 0) + (byAction['roles.update'] ?? 0) + (byAction['roles.create'] ?? 0) + (byAction['roles.delete'] ?? 0),
      perDay: days.map((d): ChartItem => ({ label: d.slice(8), value: perDayCount[d] ?? 0 })),
      byAction: topN(Object.entries(byAction), ([, v]) => v, 8).map(([k, v]): ChartItem => ({ label: k, value: v, tone: k.includes('failed') || k.includes('lockout') ? 'danger' : 'primary' })),
      byActor: topN(Object.entries(countBy(recent.filter((e) => e.actorName), (e) => e.actorName)), ([, v]) => v, 8).map(([k, v]): ChartItem => ({ label: k, value: v })),
      roles:
        r.roles && r.users
          ? {
              superAdmins: r.users.filter((u) => u.roleIds.includes('r-super-admin')).length,
              noRole: r.users.filter((u) => u.roleIds.length === 0).length,
              perRole: r.roles.map((role): ChartItem => ({ label: role.name, value: role.userCount })),
            }
          : null,
    };
  });

  constructor() {
    const events$ = fetchAll<AuditEvent>((p) => this.http.get<Page<AuditEvent>>('/api/v1/staff/audit/events', { params: new HttpParams().set('page', p).set('pageSize', 100) }));
    const canRoles = this.auth.can('settings.manage');
    forkJoin({
      events: events$,
      roles: canRoles ? this.rolesApi.roles().pipe(catchError(() => of(null))) : of(null),
      users: canRoles ? this.rolesApi.users().pipe(catchError(() => of(null))) : of(null),
    }).subscribe({ next: (d) => this.data.set(d), error: () => this.failed.set(true) });
  }
}
