import { EmployeeProfile, HrSettings, LeaveApplication, LeaveType, Salary } from '../../features/hr/hr.models';

/**
 * DEMO data only: fictional people, salaries and policy. Leave entitlements and the unpaid-leave divisor are placeholders the
 * office owner must confirm; they are not a statement of Egyptian labour law. No tax or insurance rate is seeded.
 */
export type StoredProfile = Omit<EmployeeProfile, 'name' | 'email' | 'managerName' | 'onLeaveToday'>;

const base = (userId: string, o: Partial<StoredProfile>): StoredProfile => ({
  userId,
  jobTitle: '',
  department: '',
  phone: '',
  hireDate: '2024-01-01',
  employmentType: 'full_time',
  status: 'active',
  address: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  notes: '',
  ...o,
});

export function seedProfiles(): StoredProfile[] {
  return [
    base('u-superadmin', { jobTitle: 'System administrator', department: 'Management', phone: '+20 100 000 0001', hireDate: '2022-03-01', address: 'Cairo (DEMO)', nationalId: '29001010100001', emergencyContactName: 'DEMO Contact', emergencyContactPhone: '+20 100 000 9001' }),
    base('u-owner', { jobTitle: 'Managing partner', department: 'Management', phone: '+20 100 000 0002', hireDate: '2020-01-15', address: 'Giza (DEMO)', nationalId: '28001010100002', emergencyContactName: 'DEMO Contact', emergencyContactPhone: '+20 100 000 9002' }),
    base('u-chief', { jobTitle: 'Chief accountant', department: 'Accounting', phone: '+20 100 000 0003', hireDate: '2021-06-01', managerId: 'u-owner', address: 'Cairo (DEMO)', nationalId: '29101010100003', emergencyContactName: 'DEMO Contact', emergencyContactPhone: '+20 100 000 9003' }),
    base('u-accountant', { jobTitle: 'Accountant', department: 'Accounting', phone: '+20 100 000 0004', hireDate: '2023-02-01', managerId: 'u-chief', address: 'Giza (DEMO)', nationalId: '29501010100004', emergencyContactName: 'DEMO Contact', emergencyContactPhone: '+20 100 000 9004' }),
    base('u-tax', { jobTitle: 'Tax specialist', department: 'Tax', phone: '+20 100 000 0005', hireDate: '2023-09-01', managerId: 'u-chief', address: 'Cairo (DEMO)', nationalId: '29601010100005', emergencyContactName: 'DEMO Contact', emergencyContactPhone: '+20 100 000 9005' }),
    base('u-auditor', { jobTitle: 'Auditor', department: 'Audit', phone: '+20 100 000 0006', hireDate: '2024-04-01', managerId: 'u-owner', employmentType: 'contract', address: 'Alexandria (DEMO)', nationalId: '29701010100006', emergencyContactName: 'DEMO Contact', emergencyContactPhone: '+20 100 000 9006' }),
    base('u-mfa', { jobTitle: 'Office manager', department: 'Management', phone: '+20 100 000 0007', hireDate: '2022-08-01', managerId: 'u-owner', address: 'Cairo (DEMO)', nationalId: '29201010100007', emergencyContactName: 'DEMO Contact', emergencyContactPhone: '+20 100 000 9007' }),
  ];
}

const salary = (userId: string, baseSalary: string, components: Salary['components']): Salary => ({
  userId,
  currency: 'EGP',
  baseSalary,
  components,
  effectiveFrom: '2026-01-01',
  history: [{ at: '2026-01-01T09:00:00.000Z', by: 'Demo Owner', effectiveFrom: '2026-01-01', baseSalary, allowances: components.filter((c) => c.kind === 'allowance').reduce((s, c) => s + Number(c.amount), 0).toFixed(2), deductions: components.filter((c) => c.kind === 'deduction').reduce((s, c) => s + Number(c.amount), 0).toFixed(2) }],
});

export function seedSalaries(): Salary[] {
  const transport = { name: 'Transport allowance', kind: 'allowance' as const, amount: '500.00' };
  return [
    salary('u-superadmin', '30000.00', []),
    salary('u-owner', '45000.00', [{ name: 'Housing allowance', kind: 'allowance', amount: '3000.00' }]),
    salary('u-chief', '24000.00', [transport]),
    salary('u-accountant', '15000.00', [transport, { name: 'Loan repayment', kind: 'deduction', amount: '750.00' }]),
    salary('u-tax', '18000.00', [transport]),
    salary('u-auditor', '14000.00', []),
    salary('u-mfa', '16000.00', [transport]),
  ];
}

export function seedLeaveTypes(): LeaveType[] {
  return [
    { id: 'lt-annual', nameAr: 'إجازة سنوية', nameEn: 'Annual leave', entitlementDays: 21, paid: true, active: true },
    { id: 'lt-sick', nameAr: 'إجازة مرضية', nameEn: 'Sick leave', entitlementDays: 15, paid: true, active: true },
    { id: 'lt-casual', nameAr: 'إجازة عارضة', nameEn: 'Casual leave', entitlementDays: 6, paid: true, active: true },
    { id: 'lt-unpaid', nameAr: 'إجازة بدون أجر', nameEn: 'Unpaid leave', entitlementDays: null, paid: false, active: true },
  ];
}

export const seedSettings = (): HrSettings => ({ weekendDays: [5, 6], holidays: [], unpaidLeaveDivisor: 30 });

export type StoredLeave = Omit<LeaveApplication, 'userName'>;

export function seedLeaves(): StoredLeave[] {
  return [
    { id: 'lv-001', userId: 'u-tax', typeId: 'lt-sick', from: '2026-10-05', to: '2026-10-06', days: 2, reason: 'Flu', status: 'approved', createdAt: '2026-10-05T08:00:00.000Z', decidedBy: 'Demo Owner', decidedAt: '2026-10-05T09:00:00.000Z' },
    { id: 'lv-002', userId: 'u-accountant', typeId: 'lt-unpaid', from: '2026-10-14', to: '2026-10-14', days: 1, reason: 'Personal errand', status: 'approved', createdAt: '2026-10-08T08:00:00.000Z', decidedBy: 'Demo Owner', decidedAt: '2026-10-08T10:00:00.000Z' },
    { id: 'lv-003', userId: 'u-accountant', typeId: 'lt-annual', from: '2026-10-25', to: '2026-10-27', days: 3, reason: 'Family trip', status: 'pending', createdAt: '2026-10-10T08:00:00.000Z' },
  ];
}
