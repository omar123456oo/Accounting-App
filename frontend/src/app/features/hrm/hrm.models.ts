export interface OrgBase {
  id: string;
  code: string;
  active: boolean;
}
export interface Branch extends OrgBase {
  name: string;
  nameAr?: string;
  address?: string;
}
export interface Grade extends OrgBase {
  name: string;
  level: number;
}
export interface Position extends OrgBase {
  title: string;
  titleAr?: string;
  description?: string;
  departmentId?: string | null;
  gradeId?: string | null;
}
export interface Department extends OrgBase {
  name: string;
  nameAr?: string;
  costCenter?: string;
  parentId?: string | null;
  managerId?: string | null;
}
export interface DepartmentNode extends Department {
  headcount: number;
  children: DepartmentNode[];
}

export type OrgKind = 'departments' | 'branches' | 'grades' | 'positions';

export const EMPLOYEE_STATUSES = ['active', 'inactive', 'terminated', 'archived'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export interface EmployeeLite {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  status: EmployeeStatus;
  departmentId: string | null;
  branchId: string | null;
  positionId: string | null;
  employmentType: string;
  hireDate: string;
}

export const CONTRACT_STATUSES = ['draft', 'active', 'renewed', 'expired', 'terminated'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const CONTRACT_TYPES = ['permanent', 'fixed_term', 'probation', 'part_time', 'consultant'] as const;

export interface Contract {
  id: string;
  employeeId: string;
  number: string;
  version: number;
  type: string;
  status: ContractStatus;
  startDate: string;
  endDate: string | null;
  probationMonths: number | null;
  renewalTerms: string | null;
  alertDays: number;
  previousContractId: string | null;
  daysToEnd: number | null;
}

export interface ContractInput {
  employeeId: string;
  type: string;
  startDate: string;
  endDate?: string;
  probationMonths?: number;
  alertDays?: number;
}

export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface CountItem {
  id: string | null;
  name: string | null;
  count: number;
}

export interface HrDashboard {
  asOf: string;
  total: number;
  active: number;
  inactive: number;
  terminated: number;
  newHires30d: number;
  onProbation: number;
  contractsExpiring: { days: number; count: number; items: Array<{ id: string; number: string; employeeId: string; endDate: string }> };
  turnover12m: { terminations: number; rate: number };
  byDepartment: CountItem[];
  byBranch: CountItem[];
  byEmploymentType: Array<{ type: string; count: number }>;
  hiresByMonth: Array<{ month: string; count: number }>;
  upcomingBirthdays: Array<{ id: string; name: string; date: string; in: number }>;
  upcomingAnniversaries: Array<{ id: string; name: string; date: string; in: number; years: number }>;
}
