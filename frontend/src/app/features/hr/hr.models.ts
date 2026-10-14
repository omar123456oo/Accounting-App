export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYEE_STATUSES = ['active', 'terminated'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

/** One person's HR file. The employee id is the user id. National ID is only returned to people who manage HR. */
export interface EmployeeProfile {
  userId: string;
  name: string;
  email: string;
  jobTitle: string;
  department: string;
  phone: string;
  hireDate: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  managerId?: string;
  managerName?: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  nationalId?: string;
  notes: string;
  /** True when an approved leave covers today. */
  onLeaveToday: boolean;
}

export type EmployeeInput = Partial<Pick<EmployeeProfile, 'jobTitle' | 'department' | 'phone' | 'hireDate' | 'employmentType' | 'status' | 'managerId' | 'address' | 'emergencyContactName' | 'emergencyContactPhone' | 'nationalId' | 'notes'>>;

export interface EmployeeListParams {
  q?: string;
  status?: EmployeeStatus | '';
  department?: string;
}

export const COMPONENT_KINDS = ['allowance', 'deduction'] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

/** An allowance or a deduction on top of the base salary. Amounts are decimal strings, never numbers. */
export interface PayComponent {
  name: string;
  kind: ComponentKind;
  amount: string;
}

export interface SalaryChange {
  at: string;
  by: string;
  effectiveFrom: string;
  baseSalary: string;
  allowances: string;
  deductions: string;
}

export interface Salary {
  userId: string;
  currency: string;
  baseSalary: string;
  components: PayComponent[];
  effectiveFrom: string;
  history: SalaryChange[];
}

export interface SalaryInput {
  baseSalary: string;
  effectiveFrom: string;
  components: PayComponent[];
}

export interface LeaveType {
  id: string;
  nameAr: string;
  nameEn: string;
  /** Days per year; null means no limit (for example unpaid leave). */
  entitlementDays: number | null;
  paid: boolean;
  active: boolean;
}

export type LeaveTypeInput = Omit<LeaveType, 'id'>;

export interface LeaveBalance {
  typeId: string;
  year: number;
  entitlement: number | null;
  used: number;
  pending: number;
  remaining: number | null;
}

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export interface LeaveApplication {
  id: string;
  userId: string;
  userName: string;
  typeId: string;
  from: string;
  to: string;
  /** Working days: weekends and listed holidays are not counted. */
  days: number;
  reason: string;
  status: LeaveStatus;
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}

export interface LeaveInput {
  typeId: string;
  from: string;
  to: string;
  reason: string;
  /** Apply on someone else's behalf; needs hr.manage. */
  userId?: string;
}

export interface LeaveListParams {
  status?: LeaveStatus | '';
  userId?: string;
}

export interface HrSettings {
  /** 0 = Sunday ... 6 = Saturday. */
  weekendDays: number[];
  holidays: string[];
  /** Unpaid leave deducts base salary / this many days per day. An office policy, not a legal figure. */
  unpaidLeaveDivisor: number;
}

export interface PayrollSlip {
  userId: string;
  name: string;
  month: string;
  baseSalary: string;
  allowances: PayComponent[];
  deductions: PayComponent[];
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: string;
  gross: string;
  totalDeductions: string;
  net: string;
}

export interface PayrollRun {
  month: string;
  status: 'draft' | 'final';
  generatedAt: string;
  generatedBy: string;
  finalizedAt?: string;
  finalizedBy?: string;
  slips: PayrollSlip[];
  totals: { gross: string; deductions: string; net: string };
}

export interface PayrollRunSummary {
  month: string;
  status: 'draft' | 'final';
  employees: number;
  net: string;
}
