import { Routes } from '@angular/router';

export const PORTAL_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./portal-layout').then((m) => m.PortalLayout),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./portal-home').then((m) => m.PortalHome) },
      { path: 'invoices', loadComponent: () => import('./portal-invoices').then((m) => m.PortalInvoices) },
      { path: 'documents', loadComponent: () => import('./portal-documents').then((m) => m.PortalDocuments) },
      { path: 'tickets', loadComponent: () => import('./portal-tickets').then((m) => m.PortalTickets) },
      { path: 'tickets/:id', loadComponent: () => import('./portal-tickets').then((m) => m.PortalTickets) },
      { path: 'appointments', loadComponent: () => import('./portal-appointments').then((m) => m.PortalAppointments) },
    ],
  },
];
