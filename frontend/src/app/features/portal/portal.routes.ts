import { Routes } from '@angular/router';

export const PORTAL_ROUTES: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./portal-home').then((m) => m.PortalHome) },
];
