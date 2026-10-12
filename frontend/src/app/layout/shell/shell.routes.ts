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
      { path: 'journals', canActivate: [permissionGuard], data: { permission: 'journals.view' }, loadComponent: comingSoon },
      { path: 'reports', canActivate: [permissionGuard], data: { permission: 'reports.view' }, loadComponent: comingSoon },
      { path: 'settings', canActivate: [permissionGuard], data: { permission: 'settings.manage' }, loadComponent: comingSoon },
    ],
  },
];
