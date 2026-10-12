import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/permission.guard';

export const TASK_ROUTES: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./task-list/task-list').then((m) => m.TaskList) },
  { path: 'new', canActivate: [permissionGuard], data: { permission: 'tasks.manage' }, loadComponent: () => import('./task-form/task-form').then((m) => m.TaskForm) },
  { path: ':id', loadComponent: () => import('./task-detail/task-detail').then((m) => m.TaskDetail) },
  { path: ':id/edit', canActivate: [permissionGuard], data: { permission: 'tasks.manage' }, loadComponent: () => import('./task-form/task-form').then((m) => m.TaskForm) },
];
