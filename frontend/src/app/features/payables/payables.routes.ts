import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/permission.guard';
import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';
import { FrameConfig } from '../accounting/layout/frame';

const guard = (permission: string, extra: Record<string, unknown> = {}) => ({ canActivate: [permissionGuard], data: { permission, ...extra } });

export const PAYABLES_FRAME: FrameConfig = {
  base: '/app/payables',
  sectionsKey: 'commercial.payables.sections',
  tabPrefix: 'commercial.payables.tabs.',
  tabs: [
    { key: 'bills', permission: 'bills.view' },
    { key: 'payments', permission: 'bills.view' },
    { key: 'schedule', permission: 'bills.view' },
    { key: 'suppliers', permission: ['bills.view', 'suppliers.manage'] },
    { key: 'expenses', permission: ['expenses.claim', 'bills.approve'] },
    { key: 'credits', permission: 'bills.view' },
    { key: 'recurring', permission: 'bills.view' },
  ],
  recordPattern: '/(bills|payments|statements)/[^/?]+',
};

export const PAYABLES_ROUTES: Routes = [
  {
    path: '',
    data: { frame: PAYABLES_FRAME },
    loadComponent: () => import('../accounting/layout/accounting-layout').then((m) => m.AccountingLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'bills' },
      { path: 'bills', pathMatch: 'full', ...guard('bills.view', { side: 'ap' }), loadComponent: () => import('../commercial/doc-list').then((m) => m.DocList) },
      { path: 'bills/new', canActivate: [permissionGuard], canDeactivate: [unsavedChangesGuard], data: { permission: 'bills.create' }, loadComponent: () => import('./bill-form').then((m) => m.BillForm) },
      { path: 'bills/:id', ...guard('bills.view'), loadComponent: () => import('./bill-detail').then((m) => m.BillDetail) },
      { path: 'bills/:id/edit', canActivate: [permissionGuard], canDeactivate: [unsavedChangesGuard], data: { permission: 'bills.update' }, loadComponent: () => import('./bill-form').then((m) => m.BillForm) },
      { path: 'payments', pathMatch: 'full', ...guard('bills.view', { side: 'ap' }), loadComponent: () => import('../commercial/payment-list').then((m) => m.PaymentList) },
      { path: 'payments/new', canActivate: [permissionGuard], canDeactivate: [unsavedChangesGuard], data: { permission: 'payments.record', side: 'ap' }, loadComponent: () => import('../commercial/payment-form').then((m) => m.PaymentForm) },
      { path: 'payments/:id', ...guard('bills.view', { side: 'ap' }), loadComponent: () => import('../commercial/payment-detail').then((m) => m.PaymentDetail) },
      { path: 'schedule', ...guard('bills.view'), loadComponent: () => import('./schedule-page').then((m) => m.SchedulePage) },
      { path: 'suppliers', ...guard('bills.view', { side: 'ap' }), loadComponent: () => import('../commercial/parties-page').then((m) => m.PartiesPage) },
      { path: 'statements/:partyId', ...guard('bills.view', { side: 'ap' }), loadComponent: () => import('../commercial/statement-page').then((m) => m.StatementPage) },
      { path: 'expenses', ...guard('expenses.claim'), loadComponent: () => import('./expenses-page').then((m) => m.ExpensesPage) },
      { path: 'credits', ...guard('bills.view', { side: 'ap' }), loadComponent: () => import('../commercial/credit-list').then((m) => m.CreditList) },
      { path: 'recurring', ...guard('bills.view', { side: 'ap' }), loadComponent: () => import('../commercial/recurring-page').then((m) => m.RecurringPage) },
    ],
  },
];
