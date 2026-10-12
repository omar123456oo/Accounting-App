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
    ],
  },
];
