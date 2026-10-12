import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/permission.guard';
import { FrameConfig } from '../accounting/layout/frame';

export const FS_FRAME: FrameConfig = {
  base: '/app/statements',
  sectionsKey: 'fs.sections',
  tabPrefix: 'fs.tabs.',
  tabs: [
    { key: 'income', permission: 'reports.view' },
    { key: 'balance', permission: 'reports.view' },
    { key: 'cashflow', permission: 'reports.view' },
    { key: 'equity', permission: 'reports.view' },
    { key: 'mapping', permission: 'mappings.manage' },
  ],
  recordPattern: '$^',
};

const page = () => import('./statement-page').then((m) => m.StatementPage);

export const FS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('../accounting/layout/accounting-layout').then((m) => m.AccountingLayout),
    data: { frame: FS_FRAME },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'income' },
      { path: 'income', data: { kind: 'income' }, loadComponent: page },
      { path: 'balance', data: { kind: 'balance' }, loadComponent: page },
      { path: 'cashflow', data: { kind: 'cashflow' }, loadComponent: page },
      { path: 'equity', data: { kind: 'equity' }, loadComponent: page },
      { path: 'mapping', canActivate: [permissionGuard], data: { permission: 'mappings.manage' }, loadComponent: () => import('./fs-mapping-page').then((m) => m.FsMappingPage) },
    ],
  },
];
