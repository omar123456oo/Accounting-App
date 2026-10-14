import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/permission.guard';

const guard = (permission: string) => ({ canActivate: [permissionGuard], data: { permission } });

export const HR_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./hr-layout').then((m) => m.HrLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'leave' },
      { path: 'dashboard', ...guard('hr.employees.view'), loadComponent: () => import('../hrm/hrm-dashboard').then((m) => m.HrmDashboard) },
      { path: 'organization', ...guard('hr.employees.view'), loadComponent: () => import('../hrm/organization-page').then((m) => m.OrganizationPage) },
      { path: 'contracts', ...guard('hr.contracts.view'), loadComponent: () => import('../hrm/contracts-page').then((m) => m.ContractsPage) },
      { path: 'leave', loadComponent: () => import('./leave-page').then((m) => m.LeavePage) },
      { path: 'employees', pathMatch: 'full', ...guard('hr.view'), loadComponent: () => import('./employee-list').then((m) => m.EmployeeList) },
      // Anyone may open their own file; the server refuses other people's unless the user holds hr.view.
      { path: 'employees/:id', loadComponent: () => import('./employee-detail').then((m) => m.EmployeeDetail) },
      { path: 'payroll', ...guard('payroll.view'), loadComponent: () => import('./payroll-page').then((m) => m.PayrollPage) },
      { path: 'settings', ...guard('hr.manage'), loadComponent: () => import('./hr-settings-page').then((m) => m.HrSettingsPage) },
    ],
  },
];
