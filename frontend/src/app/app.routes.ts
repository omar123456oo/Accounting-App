import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { clientGuard, staffGuard } from './core/auth/user-type.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app' },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'mfa-setup',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/mfa-setup/mfa-setup').then((m) => m.MfaSetupPage),
  },
  {
    path: 'app',
    canActivate: [staffGuard],
    loadChildren: () => import('./layout/shell/shell.routes').then((m) => m.SHELL_ROUTES),
  },
  {
    path: 'portal',
    canActivate: [clientGuard],
    loadChildren: () => import('./features/portal/portal.routes').then((m) => m.PORTAL_ROUTES),
  },
  { path: '**', redirectTo: 'app' },
];
