import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/permission.guard';
import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';
import { FrameConfig } from '../accounting/layout/frame';

const guard = (permission: string) => ({ canActivate: [permissionGuard], data: { permission } });

export const INVOICING_FRAME: FrameConfig = {
  base: '/app/invoicing',
  sectionsKey: 'commercial.invoicing.sections',
  tabPrefix: 'commercial.invoicing.tabs.',
  tabs: [
    { key: 'invoices', permission: 'invoices.view' },
    { key: 'quotations', permission: 'invoices.view' },
    { key: 'customers', permission: 'invoices.view' },
    { key: 'payments', permission: 'invoices.view' },
    { key: 'credit-notes', permission: 'invoices.view' },
    { key: 'recurring', permission: 'invoices.view' },
  ],
  recordPattern: '/(invoices|payments|statements)/[^/?]+',
};

export const INVOICING_ROUTES: Routes = [
  {
    path: '',
    data: { frame: INVOICING_FRAME },
    loadComponent: () => import('../accounting/layout/accounting-layout').then((m) => m.AccountingLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'invoices' },
      { path: 'invoices', pathMatch: 'full', data: { permission: 'invoices.view', side: 'ar' }, canActivate: [permissionGuard], loadComponent: () => import('../commercial/doc-list').then((m) => m.DocList) },
      { path: 'invoices/new', canActivate: [permissionGuard], canDeactivate: [unsavedChangesGuard], data: { permission: 'invoices.create' }, loadComponent: () => import('./invoice-form').then((m) => m.InvoiceForm) },
      { path: 'invoices/:id', ...guard('invoices.view'), loadComponent: () => import('./invoice-detail').then((m) => m.InvoiceDetail) },
      { path: 'invoices/:id/edit', canActivate: [permissionGuard], canDeactivate: [unsavedChangesGuard], data: { permission: 'invoices.create' }, loadComponent: () => import('./invoice-form').then((m) => m.InvoiceForm) },
      { path: 'quotations', pathMatch: 'full', ...guard('invoices.view'), loadComponent: () => import('./quotation-list').then((m) => m.QuotationList) },
      { path: 'quotations/new', canActivate: [permissionGuard], canDeactivate: [unsavedChangesGuard], data: { permission: 'invoices.create', mode: 'quotation' }, loadComponent: () => import('./invoice-form').then((m) => m.InvoiceForm) },
      { path: 'customers', data: { permission: 'invoices.view', side: 'ar' }, canActivate: [permissionGuard], loadComponent: () => import('../commercial/parties-page').then((m) => m.PartiesPage) },
      { path: 'statements/:partyId', data: { permission: 'invoices.view', side: 'ar' }, canActivate: [permissionGuard], loadComponent: () => import('../commercial/statement-page').then((m) => m.StatementPage) },
      { path: 'payments', pathMatch: 'full', data: { permission: 'invoices.view', side: 'ar' }, canActivate: [permissionGuard], loadComponent: () => import('../commercial/payment-list').then((m) => m.PaymentList) },
      { path: 'payments/new', canActivate: [permissionGuard], canDeactivate: [unsavedChangesGuard], data: { permission: 'payments.record', side: 'ar' }, loadComponent: () => import('../commercial/payment-form').then((m) => m.PaymentForm) },
      { path: 'payments/:id', data: { permission: 'invoices.view', side: 'ar' }, canActivate: [permissionGuard], loadComponent: () => import('../commercial/payment-detail').then((m) => m.PaymentDetail) },
      { path: 'credit-notes', data: { permission: 'invoices.view', side: 'ar' }, canActivate: [permissionGuard], loadComponent: () => import('../commercial/credit-list').then((m) => m.CreditList) },
      { path: 'recurring', data: { permission: 'invoices.view', side: 'ar' }, canActivate: [permissionGuard], loadComponent: () => import('../commercial/recurring-page').then((m) => m.RecurringPage) },
    ],
  },
];
