import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/permission.guard';

const guard = (permission: string) => ({ canActivate: [permissionGuard], data: { permission } });

/** Mounted at /app/smart-documents. Needs the real API. The server authorises every call; these guards only hide screens. */
export const SMART_DOC_ROUTES: Routes = [
  { path: '', pathMatch: 'full', ...guard('documents.view'), loadComponent: () => import('./smart-docs-dashboard').then((m) => m.SmartDocsDashboard) },
  { path: 'list', ...guard('documents.view'), loadComponent: () => import('./smart-docs-list').then((m) => m.SmartDocsList) },
  { path: 'upload', ...guard('documents.upload'), loadComponent: () => import('./smart-docs-upload').then((m) => m.SmartDocsUpload) },
  { path: 'reminders', ...guard('documents.view'), loadComponent: () => import('./smart-reminders').then((m) => m.SmartReminders) },
  { path: 'types', ...guard('documents.manage'), loadComponent: () => import('./smart-doc-types').then((m) => m.SmartDocTypes) },
  { path: ':id/review', ...guard('documents.view'), loadComponent: () => import('./smart-doc-review').then((m) => m.SmartDocReview) },
  { path: ':id', ...guard('documents.view'), loadComponent: () => import('./smart-doc-detail').then((m) => m.SmartDocDetail) },
];
