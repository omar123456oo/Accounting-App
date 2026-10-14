import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/permission.guard';
import { Shell } from './shell';

export const SHELL_ROUTES: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('../../features/dashboard/dashboard').then((m) => m.Dashboard) },
      { path: 'clients', loadChildren: () => import('../../features/clients/clients.routes').then((m) => m.CLIENT_ROUTES), canActivate: [permissionGuard], data: { permission: 'clients.view' } },
      { path: 'documents', loadChildren: () => import('../../features/documents/documents.routes').then((m) => m.DOCUMENT_ROUTES), canActivate: [permissionGuard], data: { permission: 'documents.view' } },
      { path: 'tasks', loadChildren: () => import('../../features/workflows/workflows.routes').then((m) => m.TASK_ROUTES), canActivate: [permissionGuard], data: { permission: 'tasks.view' } },
      { path: 'approvals', canActivate: [permissionGuard], data: { permission: 'workflows.approve' }, loadComponent: () => import('../../features/workflows/approvals/approvals-inbox').then((m) => m.ApprovalsInbox) },
      { path: 'tickets', canActivate: [permissionGuard], data: { permission: 'tickets.manage' }, loadComponent: () => import('../../features/engage/tickets-page').then((m) => m.TicketsPage) },
      { path: 'tickets/:id', canActivate: [permissionGuard], data: { permission: 'tickets.manage' }, loadComponent: () => import('../../features/engage/tickets-page').then((m) => m.TicketsPage) },
      { path: 'appointments', canActivate: [permissionGuard], data: { permission: 'appointments.manage' }, loadComponent: () => import('../../features/engage/appointments-page').then((m) => m.AppointmentsPage) },
      { path: 'timesheets', canActivate: [permissionGuard], data: { permission: 'timesheets.log' }, loadComponent: () => import('../../features/engage/timesheets-page').then((m) => m.TimesheetsPage) },
      { path: 'forecast', canActivate: [permissionGuard], data: { permission: 'forecast.view' }, loadComponent: () => import('../../features/engage/forecast-page').then((m) => m.ForecastPage) },
      { path: 'analytics', canActivate: [permissionGuard], data: { permission: 'reports.view' }, loadComponent: () => import('../../features/analytics/analytics-layout').then((m) => m.AnalyticsLayout) },
      { path: 'hr', loadChildren: () => import('../../features/hr/hr.routes').then((m) => m.HR_ROUTES), canActivate: [permissionGuard], data: { permission: 'leave.apply' } },
      { path: 'doctypes', loadChildren: () => import('../../features/core/core.routes').then((m) => m.DOCTYPE_ROUTES) },
      { path: 'records', loadChildren: () => import('../../features/core/core.routes').then((m) => m.RECORD_ROUTES) },
      { path: 'accounting', loadChildren: () => import('../../features/accounting/accounting.routes').then((m) => m.ACCOUNTING_ROUTES) },
      { path: 'statements', loadChildren: () => import('../../features/reports-fs/fs.routes').then((m) => m.FS_ROUTES), canActivate: [permissionGuard], data: { permission: 'reports.view' } },
      { path: 'invoicing', loadChildren: () => import('../../features/invoicing/invoicing.routes').then((m) => m.INVOICING_ROUTES), canActivate: [permissionGuard], data: { permission: 'invoices.view' } },
      { path: 'payables', loadChildren: () => import('../../features/payables/payables.routes').then((m) => m.PAYABLES_ROUTES), canActivate: [permissionGuard], data: { permission: 'bills.view' } },
      {
        path: 'settings',
        canActivate: [permissionGuard],
        data: { permission: 'settings.manage' },
        children: [
          { path: '', pathMatch: 'full', loadComponent: () => import('../../features/settings/settings-page').then((m) => m.SettingsPage) },
          { path: 'roles', loadComponent: () => import('../../features/settings/roles/roles-page').then((m) => m.RolesPage) },
          { path: 'users', loadComponent: () => import('../../features/settings/roles/user-roles-page').then((m) => m.UserRolesPage) },
        ],
      },
    ],
  },
];
