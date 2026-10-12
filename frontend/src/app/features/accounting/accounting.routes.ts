import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/permission.guard';
import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';

const guard = (permission: string) => ({ canActivate: [permissionGuard], data: { permission } });

export const ACCOUNTING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/accounting-layout').then((m) => m.AccountingLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'journals' },
      { path: 'accounts', ...guard('ledger.view'), loadComponent: () => import('./accounts/accounts-page').then((m) => m.AccountsPage) },
      { path: 'periods', ...guard('ledger.view'), loadComponent: () => import('./periods/periods-page').then((m) => m.PeriodsPage) },
      { path: 'journals', pathMatch: 'full', ...guard('journals.view'), loadComponent: () => import('./journals/journal-list').then((m) => m.JournalList) },
      {
        path: 'journals/new',
        canActivate: [permissionGuard],
        canDeactivate: [unsavedChangesGuard],
        data: { permission: 'journals.create' },
        loadComponent: () => import('./journals/journal-form').then((m) => m.JournalForm),
      },
      { path: 'journals/:id', ...guard('journals.view'), loadComponent: () => import('./journals/journal-detail').then((m) => m.JournalDetail) },
      {
        path: 'journals/:id/edit',
        canActivate: [permissionGuard],
        canDeactivate: [unsavedChangesGuard],
        data: { permission: 'journals.create' },
        loadComponent: () => import('./journals/journal-form').then((m) => m.JournalForm),
      },
      { path: 'reports', ...guard('reports.view'), loadChildren: () => import('./reports/reports.routes').then((m) => m.REPORT_ROUTES) },
    ],
  },
];
