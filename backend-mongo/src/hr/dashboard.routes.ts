import { Router } from 'express';
import { can } from '../auth/session.js';
import { addDays, orgOf, todayIso, wrap } from './common.js';
import { Contract, Employee } from './models.js';

export const dashboardRouter = Router();

const mmdd = (d: string) => d.slice(5);
/** Days from `today` to the next occurrence of the month/day in `date` (0 = today). */
function daysUntilAnniversary(date: string, today: string): number {
  const [y] = today.split('-').map(Number);
  let next = `${y}-${mmdd(date)}`;
  if (mmdd(date) === '02-29' && !new Date(y, 1, 29).getMonth()) next = `${y}-02-28`;
  if (next < today) next = `${y + 1}-${mmdd(date)}`;
  return Math.round((Date.parse(next) - Date.parse(today)) / 86_400_000);
}

/** Every figure is computed from the caller's organization's records at request time. */
dashboardRouter.get('/dashboard', can('hr.employees.view'), wrap(async (req, res) => {
  const org = orgOf(req);
  const today = todayIso();
  const expiringDays = Math.min(365, Math.max(1, Number(req.query.expiringInDays) || 60));
  const since12m = addDays(today, -365);
  const since30 = addDays(today, -30);

  const [statusCounts, byDept, byBranch, byType, active, hiresByMonth, expiring, terminated12m] = await Promise.all([
    Employee.aggregate([{ $match: { organizationId: org } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Employee.aggregate([{ $match: { organizationId: org, status: 'active' } }, { $group: { _id: '$departmentId', n: { $sum: 1 } } }, { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }]),
    Employee.aggregate([{ $match: { organizationId: org, status: 'active' } }, { $group: { _id: '$branchId', n: { $sum: 1 } } }, { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'd' } }]),
    Employee.aggregate([{ $match: { organizationId: org, status: 'active' } }, { $group: { _id: '$employmentType', n: { $sum: 1 } } }]),
    Employee.find({ organizationId: org, status: 'active' }, { firstName: 1, lastName: 1, dateOfBirth: 1, hireDate: 1, probationEndDate: 1, employeeNo: 1 }).lean(),
    Employee.aggregate([{ $match: { organizationId: org, hireDate: { $gte: addDays(today, -183) } } }, { $group: { _id: { $substr: ['$hireDate', 0, 7] }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Contract.find({ organizationId: org, status: 'active', endDate: { $gte: today, $lte: addDays(today, expiringDays) } }).sort({ endDate: 1 }).limit(50).lean(),
    Employee.countDocuments({ organizationId: org, status: 'terminated', 'exit.date': { $gte: since12m } }),
  ]);

  const status = Object.fromEntries(statusCounts.map((s) => [s._id, s.n as number]));
  const name = (e: any) => `${e.firstName} ${e.lastName}`;
  const headcount = status.active ?? 0;
  res.json({
    data: {
      asOf: today,
      total: Object.values(status).reduce((n: number, v) => n + (v as number), 0) - (status.archived ?? 0),
      active: headcount, inactive: status.inactive ?? 0, terminated: status.terminated ?? 0,
      newHires30d: active.filter((e) => e.hireDate >= since30).length,
      onProbation: active.filter((e) => e.probationEndDate && e.probationEndDate >= today).length,
      contractsExpiring: { days: expiringDays, count: expiring.length, items: expiring.map((c: any) => ({ id: String(c._id), number: c.number, employeeId: String(c.employeeId), endDate: c.endDate })) },
      turnover12m: { terminations: terminated12m, rate: headcount + terminated12m ? Math.round((terminated12m / (headcount + terminated12m)) * 1000) / 10 : 0 },
      byDepartment: byDept.map((d) => ({ id: d._id ? String(d._id) : null, name: d.d[0]?.name ?? null, count: d.n })).sort((a, b) => b.count - a.count),
      byBranch: byBranch.map((d) => ({ id: d._id ? String(d._id) : null, name: d.d[0]?.name ?? null, count: d.n })).sort((a, b) => b.count - a.count),
      byEmploymentType: byType.map((t) => ({ type: t._id, count: t.n })),
      hiresByMonth: hiresByMonth.map((h) => ({ month: h._id, count: h.n })),
      upcomingBirthdays: active.filter((e) => e.dateOfBirth).map((e) => ({ id: String(e._id), name: name(e), date: e.dateOfBirth!, in: daysUntilAnniversary(e.dateOfBirth!, today) })).filter((e) => e.in <= 30).sort((a, b) => a.in - b.in),
      upcomingAnniversaries: active.map((e) => ({ id: String(e._id), name: name(e), date: e.hireDate, in: daysUntilAnniversary(e.hireDate, today), years: Number(today.slice(0, 4)) - Number(e.hireDate.slice(0, 4)) })).filter((e) => e.in <= 30 && e.years > 0).sort((a, b) => a.in - b.in),
    },
  });
}));
