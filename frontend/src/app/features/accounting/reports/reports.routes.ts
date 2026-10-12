import { Routes } from '@angular/router';

export const REPORT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./reports-layout').then((m) => m.ReportsLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'trial-balance' },
      { path: 'trial-balance', loadComponent: () => import('./trial-balance').then((m) => m.TrialBalancePage) },
      { path: 'general-ledger', loadComponent: () => import('./general-ledger').then((m) => m.GeneralLedgerPage) },
      { path: 'journal-register', loadComponent: () => import('./journal-register').then((m) => m.JournalRegisterPage) },
      { path: 'ar-aging', data: { side: 'ar' }, loadComponent: () => import('./aging-report').then((m) => m.AgingReportPage) },
      { path: 'ap-aging', data: { side: 'ap' }, loadComponent: () => import('./aging-report').then((m) => m.AgingReportPage) },
      { path: 'revenue', loadComponent: () => import('./revenue-report').then((m) => m.RevenueReportPage) },
      { path: 'reconciliation', loadComponent: () => import('./reconciliation-report').then((m) => m.ReconciliationReportPage) },
    ],
  },
];
