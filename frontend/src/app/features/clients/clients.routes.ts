import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/permission.guard';
import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';

export const CLIENT_ROUTES: Routes = [
  { path: '', pathMatch: 'full', canActivate: [permissionGuard], data: { permission: 'clients.view' }, loadComponent: () => import('./list/client-list').then((m) => m.ClientList) },
  {
    path: 'new',
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permission: 'clients.create' },
    loadComponent: () => import('./form/client-form').then((m) => m.ClientForm),
  },
  { path: ':id', canActivate: [permissionGuard], data: { permission: 'clients.view' }, loadComponent: () => import('./detail/client-detail').then((m) => m.ClientDetail) },
  {
    path: ':id/edit',
    canActivate: [permissionGuard],
    canDeactivate: [unsavedChangesGuard],
    data: { permission: 'clients.update' },
    loadComponent: () => import('./form/client-form').then((m) => m.ClientForm),
  },
];
