import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/permission.guard';

/** Mounted at /app/doctypes (outside Settings, whose guard uses a permission name the backend does not define). The server checks admin.settings on every call; the guard only hides the screens. */
export const DOCTYPE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', canActivate: [permissionGuard], data: { permission: 'admin.settings' }, loadComponent: () => import('./doctype-list').then((m) => m.DocTypeList) },
  { path: ':name/customize', canActivate: [permissionGuard], data: { permission: 'admin.settings' }, loadComponent: () => import('./customize-form').then((m) => m.CustomizeForm) },
];

/** Mounted at /app/records. No static permission: the server hides types the person may not view (404). */
export const RECORD_ROUTES: Routes = [
  { path: ':doctype', pathMatch: 'full', loadComponent: () => import('./record-list').then((m) => m.RecordList) },
  { path: ':doctype/:name', loadComponent: () => import('./record-form').then((m) => m.RecordForm) },
];
