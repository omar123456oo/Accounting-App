import { Types } from 'mongoose';
import { User } from '../models/index.js';
import { Branch, Counter, Department, Employee, Grade, Position } from './models.js';

/** Fictional demo data for development only. Safe to run twice. */
export async function seedHr(org: Types.ObjectId): Promise<void> {
  if (await Employee.exists({ organizationId: org })) return;
  const o = { organizationId: org };
  const [hq, alex] = await Branch.create([{ ...o, code: 'CAI', name: 'Cairo HQ', nameAr: 'المقر الرئيسي - القاهرة' }, { ...o, code: 'ALX', name: 'Alexandria', nameAr: 'الإسكندرية' }]);
  const [g1, g2, g3] = await Grade.create([{ ...o, code: 'G1', name: 'Junior', level: 1 }, { ...o, code: 'G2', name: 'Senior', level: 2 }, { ...o, code: 'G3', name: 'Manager', level: 3 }]);
  const [fin, hr] = await Department.create([{ ...o, code: 'FIN', name: 'Finance', nameAr: 'المالية' }, { ...o, code: 'HR', name: 'Human Resources', nameAr: 'الموارد البشرية' }]);
  const tax = await Department.create({ ...o, code: 'TAX', name: 'Tax', nameAr: 'الضرائب', parentId: fin._id });
  const [pAcc, pHr, pMgr] = await Position.create([
    { ...o, code: 'ACC', title: 'Accountant', titleAr: 'محاسب', departmentId: fin._id, gradeId: g1._id },
    { ...o, code: 'HRS', title: 'HR Specialist', titleAr: 'أخصائي موارد بشرية', departmentId: hr._id, gradeId: g2._id },
    { ...o, code: 'OFM', title: 'Office Manager', titleAr: 'مدير المكتب', gradeId: g3._id },
  ]);
  const users = new Map((await User.find({ organizationId: org }).lean()).map((u) => [u.roles[0], u._id]));
  const base = { organizationId: org, status: 'active', employmentType: 'full_time' };
  const mk = async (n: number, f: Record<string, unknown>) => Employee.create({ ...base, employeeNo: `EMP-${String(n).padStart(5, '0')}`, ...f });
  const boss = await mk(1, { firstName: 'Omar', lastName: 'Demo', userId: users.get('owner'), branchId: hq._id, positionId: pMgr._id, gradeId: g3._id, hireDate: '2020-01-15', dateOfBirth: '1980-10-20' });
  await mk(2, { firstName: 'Salma', lastName: 'Demo', userId: users.get('hr_payroll'), departmentId: hr._id, branchId: hq._id, positionId: pHr._id, gradeId: g2._id, managerId: boss._id, hireDate: '2022-03-01', probationEndDate: '2022-06-01', dateOfBirth: '1990-11-02' });
  const acc = await mk(3, { firstName: 'Karim', lastName: 'Demo', userId: users.get('accountant'), departmentId: tax._id, branchId: alex._id, positionId: pAcc._id, gradeId: g1._id, managerId: boss._id, hireDate: '2025-09-01', probationEndDate: '2026-12-01', dateOfBirth: '1996-10-30' });
  await mk(4, { firstName: 'Nour', lastName: 'Demo', departmentId: fin._id, branchId: hq._id, positionId: pAcc._id, gradeId: g1._id, managerId: acc._id, hireDate: '2026-09-20', employmentType: 'contract' });
  await Counter.updateOne({ organizationId: org, key: 'employeeNo' }, { $set: { seq: 4 } }, { upsert: true });
}
