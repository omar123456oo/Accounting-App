import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/permission.guard';
import { Shell } from './shell';

const comingSoon = () => import('../../features/placeholder/coming-soon').then((m) => m.ComingSoon);

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
      { path: 'accounting', loadChildren: () => import('../../features/accounting/accounting.routes').then((m) => m.ACCOUNTING_ROUTES) },
      { path: 'statements', loadChildren: () => import('../../features/reports-fs/fs.routes').then((m) => m.FS_ROUTES), canActivate: [permissionGuard], data: { permission: 'reports.view' } },
      { path: 'invoicing', loadChildren: () => import('../../features/invoicing/invoicing.routes').then((m) => m.INVOICING_ROUTES), canActivate: [permissionGuard], data: { permission: 'invoices.view' } },
      { path: 'payables', loadChildren: () => import('../../features/payables/payables.routes').then((m) => m.PAYABLES_ROUTES), canActivate: [permissionGuard], data: { permission: 'bills.view' } },
      { path: 'settings', canActivate: [permissionGuard], data: { permission: 'settings.manage' }, loadComponent: comingSoon },
    ],
  },
];
