import { Routes } from '@angular/router';

export const DOCUMENT_ROUTES: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./document-list/document-list').then((m) => m.DocumentList) },
];
