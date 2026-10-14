import { COMPONENT_KINDS, EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, EmployeeProfile, HrSettings, LeaveApplication, LeaveBalance, LeaveType, PayComponent, PayrollRun, Salary } from '../../features/hr/hr.models';
import { isPositive, isZero } from '../money/money';
import { mockToday } from './mock-clock';
import { MockAudit } from './mock-audit';
import { NotificationHub } from './mock-notifications';
import { FieldErrors, Rules, validate } from './mock-clients-rules';
import { buildSlip, totalsOf, workingDays, workingDaysInMonth } from './mock-hr-calc';
import { StoredLeave, StoredProfile, seedLeaveTypes, seedLeaves, seedProfiles, seedSalaries, seedSettings } from './mock-hr-data';
import { MockModule, MockRequest, MockResult, clean, fail, invalid, need, ok } from './mock-types';
import { DEMO_USERS, DemoUser } from './mock-users';

const PROFILE_RULES: Rules = {
  jobTitle: { kind: 'text', required: true },
  department: { kind: 'text', required: true },
  phone: { kind: 'text' },
  hireDate: { kind: 'date', required: true },
  employmentType: { kind: EMPLOYMENT_TYPES, required: true },
  status: { kind: EMPLOYEE_STATUSES },
  managerId: { kind: 'text' },
  address: { kind: 'text' },
  emergencyContactName: { kind: 'text' },
  emergencyContactPhone: { kind: 'text' },
  nationalId: { kind: 'digits' },
  notes: { kind: 'text' },
};
const TYPE_RULES: Rules = { nameAr: { kind: 'text', required: true }, nameEn: { kind: 'text', required: true }, paid: { kind: 'bool', required: true }, active: { kind: 'bool', required: true } };
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const nameOf = (id: string): string => DEMO_USERS.find((u) => u.profile.id === id)?.profile.name ?? id;
const emailOf = (id: string): string => DEMO_USERS.find((u) => u.profile.id === id)?.email ?? '';
const has = (u: DemoUser, p: string): boolean => u.profile.permissions.includes(p);
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Human resources: employee files, salaries, leave and monthly payroll. Every rule is enforced here, as the real server must:
 * hr.view/hr.manage for files, payroll.view/payroll.process for money, leave.apply/leave.approve for leave. Anyone may read
 * their own file, salary, balances and (finalised) payslips. Nobody approves their own leave.
 */
export class MockHr implements MockModule {
  private readonly profiles: StoredProfile[] = seedProfiles();
  private readonly salaries: Salary[] = seedSalaries();
  private readonly types: LeaveType[] = seedLeaveTypes();
  private readonly leaves: StoredLeave[] = seedLeaves();
  private readonly runs: PayrollRun[] = [];
  private settings: HrSettings = seedSettings();
  private seq = 100;

  constructor(
    private readonly audit: MockAudit,
    private readonly hub?: NotificationHub,
  ) {}

  handle(req: MockRequest, user: DemoUser): MockResult {
    if (user.profile.type !== 'staff') return fail(403, 'forbidden');
    const [, a, b, c] = req.path.split('/');
    const get = req.method === 'GET';
    switch (a) {
      case 'employees':
        return !b ? (get ? this.listEmployees(req, user) : fail(405, 'notFound')) : c === 'salary' ? this.salary(req, user, b) : this.employee(req, user, b);
      case 'leave-types':
        return this.leaveTypes(req, user, b);
      case 'leave-balances':
        return get ? this.balances(req, user) : fail(405, 'notFound');
      case 'leave':
        return this.leave(req, user, b, c);
      case 'settings':
        return get ? ok({ data: structuredClone(this.settings) }) : req.method === 'PUT' ? this.saveSettings(req, user) : fail(405, 'notFound');
      case 'payroll':
        return this.payroll(req, user, b, c);
      default:
        return fail(404, 'notFound');
    }
  }

  // ---- employee files -------------------------------------------------------------------------------------------

  private view(p: StoredProfile, user: DemoUser): EmployeeProfile {
    const { nationalId, managerId, ...rest } = p;
    const today = mockToday();
    return clean({
      ...rest,
      name: nameOf(p.userId),
      email: emailOf(p.userId),
      ...(managerId ? { managerId, managerName: nameOf(managerId) } : {}),
      // National ID is sensitive: only people who manage HR (and the person themselves) see it.
      ...(nationalId && (has(user, 'hr.manage') || p.userId === user.profile.id) ? { nationalId } : {}),
      onLeaveToday: this.leaves.some((l) => l.userId === p.userId && l.status === 'approved' && l.from <= today && today <= l.to),
    });
  }

  private listEmployees(req: MockRequest, user: DemoUser): MockResult {
    const denied = need(user, 'hr.view');
    if (denied) return denied;
    const q = (req.query.get('q') ?? '').trim().toLowerCase();
    const status = req.query.get('status');
    const department = req.query.get('department');
    const rows = this.profiles
      .map((p) => this.view(p, user))
      .filter((e) => !status || e.status === status)
      .filter((e) => !department || e.department === department)
      .filter((e) => !q || [e.name, e.email, e.jobTitle, e.department].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    return ok({ data: rows });
  }

  private employee(req: MockRequest, user: DemoUser, id: string): MockResult {
    const profile = this.profiles.find((p) => p.userId === id);
    const self = id === user.profile.id;
    if (req.method === 'GET') return (self ? null : need(user, 'hr.view')) ?? (profile ? ok({ data: this.view(profile, user) }) : fail(404, 'notFound'));
    if (req.method !== 'PUT') return fail(405, 'notFound');
    const denied = need(user, 'hr.manage');
    if (denied) return denied;
    if (!profile) return fail(404, 'notFound');
    const errors = validate(req.body, PROFILE_RULES, true);
    const managerId = req.body['managerId'];
    if (typeof managerId === 'string' && managerId && (managerId === id || !this.profiles.some((p) => p.userId === managerId))) errors['managerId'] = ['invalidChoice'];
    if (Object.keys(errors).length) return invalid(errors);
    const changed: string[] = [];
    for (const field of Object.keys(PROFILE_RULES)) {
      if (!(field in req.body)) continue;
      const value = text(req.body[field]);
      const key = field as keyof StoredProfile;
      if ((profile[key] ?? '') !== value) {
        changed.push(field);
        (profile as unknown as Record<string, unknown>)[field] = value === '' && (field === 'managerId' || field === 'nationalId') ? undefined : value;
      }
    }
    // The values are personal data; the trail records which fields changed, not what they held.
    if (changed.length) this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'hr.profile_update', entityType: 'employee', entityId: id, after: { changed } });
    return ok({ data: this.view(profile, user) });
  }

  // ---- salary ---------------------------------------------------------------------------------------------------

  private salary(req: MockRequest, user: DemoUser, id: string): MockResult {
    const self = id === user.profile.id;
    const salary = this.salaries.find((s) => s.userId === id);
    if (req.method === 'GET') return (self ? null : need(user, 'payroll.view')) ?? (salary ? ok({ data: structuredClone(salary) }) : fail(404, 'notFound'));
    if (req.method !== 'PUT') return fail(405, 'notFound');
    const denied = need(user, 'payroll.process');
    if (denied) return denied;
    if (!this.profiles.some((p) => p.userId === id)) return fail(404, 'notFound');
    const parsed = this.parseSalary(req.body);
    if ('errors' in parsed) return invalid(parsed.errors);
    const { baseSalary, effectiveFrom, components } = parsed;
    const sumKind = (k: PayComponent['kind']) => components.filter((c) => c.kind === k).reduce((s, c) => (Number(s) + Number(c.amount)).toFixed(2), '0.00');
    const change = { at: new Date().toISOString(), by: user.profile.name, effectiveFrom, baseSalary, allowances: sumKind('allowance'), deductions: sumKind('deduction') };
    if (salary) Object.assign(salary, { baseSalary, effectiveFrom, components, history: [change, ...salary.history] });
    else this.salaries.push({ userId: id, currency: 'EGP', baseSalary, effectiveFrom, components, history: [change] });
    // Amounts are not copied into the audit trail; who changed whose salary, and when, is.
    this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'hr.salary_update', entityType: 'employee', entityId: id, after: { components: components.length, effectiveFrom } });
    return ok({ data: structuredClone(this.salaries.find((s) => s.userId === id)) });
  }

  private parseSalary(body: Record<string, unknown>): { baseSalary: string; effectiveFrom: string; components: PayComponent[] } | { errors: FieldErrors } {
    const errors = validate(body, { baseSalary: { kind: 'decimal', required: true }, effectiveFrom: { kind: 'date', required: true } }, false);
    if (!errors['baseSalary'] && !isPositive(text(body['baseSalary']))) errors['baseSalary'] = ['amountInvalid'];
    const raw = body['components'];
    const components: PayComponent[] = [];
    if (!Array.isArray(raw) || raw.length > 20) errors['components'] = ['invalidChoice'];
    else {
      for (const c of raw as Record<string, unknown>[]) {
        const bad = validate(c, { name: { kind: 'text', required: true }, kind: { kind: COMPONENT_KINDS, required: true }, amount: { kind: 'decimal', required: true } }, false);
        if (Object.keys(bad).length || !isPositive(text(c['amount']))) {
          errors['components'] = ['amountInvalid'];
          break;
        }
        components.push({ name: text(c['name']), kind: c['kind'] as PayComponent['kind'], amount: text(c['amount']) });
      }
    }
    return Object.keys(errors).length ? { errors } : { baseSalary: text(body['baseSalary']), effectiveFrom: text(body['effectiveFrom']), components };
  }

  // ---- leave types, settings, balances --------------------------------------------------------------------------

  private leaveTypes(req: MockRequest, user: DemoUser, id?: string): MockResult {
    if (req.method === 'GET' && !id) return ok({ data: structuredClone(this.types) });
    const denied = need(user, 'hr.manage');
    if (denied) return denied;
    const days = req.body['entitlementDays'];
    const errors = validate(req.body, TYPE_RULES, false);
    if (days !== null && days !== undefined && (!Number.isInteger(days) || (days as number) < 0 || (days as number) > 366)) errors['entitlementDays'] = ['invalidNumber'];
    if (req.method === 'POST' && !id) {
      if (Object.keys(errors).length) return invalid(errors);
      const type: LeaveType = { id: `lt-${this.seq++}`, nameAr: text(req.body['nameAr']), nameEn: text(req.body['nameEn']), entitlementDays: (days as number | null | undefined) ?? null, paid: req.body['paid'] as boolean, active: req.body['active'] as boolean };
      this.types.push(type);
      this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'hr.leave_type_save', entityType: 'leave_type', entityId: type.id, after: { name: type.nameEn } });
      return ok({ data: type }, 201);
    }
    const type = this.types.find((t) => t.id === id);
    if (!type) return fail(404, 'notFound');
    if (req.method !== 'PUT') return fail(405, 'notFound');
    if (Object.keys(errors).length) return invalid(errors);
    Object.assign(type, { nameAr: text(req.body['nameAr']), nameEn: text(req.body['nameEn']), entitlementDays: (days as number | null | undefined) ?? null, paid: req.body['paid'], active: req.body['active'] });
    this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'hr.leave_type_save', entityType: 'leave_type', entityId: type.id, after: { name: type.nameEn } });
    return ok({ data: structuredClone(type) });
  }

  private saveSettings(req: MockRequest, user: DemoUser): MockResult {
    const denied = need(user, 'hr.manage');
    if (denied) return denied;
    const { weekendDays, holidays, unpaidLeaveDivisor } = req.body;
    const errors: Record<string, ('invalidChoice' | 'invalidDate' | 'invalidNumber')[]> = {};
    if (!Array.isArray(weekendDays) || weekendDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || weekendDays.length > 3) errors['weekendDays'] = ['invalidChoice'];
    if (!Array.isArray(holidays) || holidays.length > 60 || holidays.some((h) => !/^\d{4}-\d{2}-\d{2}$/.test(String(h)))) errors['holidays'] = ['invalidDate'];
    if (!Number.isInteger(unpaidLeaveDivisor) || (unpaidLeaveDivisor as number) < 20 || (unpaidLeaveDivisor as number) > 31) errors['unpaidLeaveDivisor'] = ['invalidNumber'];
    if (Object.keys(errors).length) return invalid(errors);
    this.settings = { weekendDays: [...new Set(weekendDays as number[])].sort(), holidays: [...new Set(holidays as string[])].sort(), unpaidLeaveDivisor: unpaidLeaveDivisor as number };
    this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'hr.settings_update', entityType: 'hr_settings', entityId: 'hr' });
    return ok({ data: structuredClone(this.settings) });
  }

  private balances(req: MockRequest, user: DemoUser): MockResult {
    const userId = req.query.get('userId') || user.profile.id;
    const year = Number(req.query.get('year')) || Number(mockToday().slice(0, 4));
    const denied = userId === user.profile.id ? null : has(user, 'hr.view') || has(user, 'leave.approve') ? null : fail(403, 'forbidden');
    if (denied) return denied;
    if (!this.profiles.some((p) => p.userId === userId)) return fail(404, 'notFound');
    return ok({ data: this.types.filter((t) => t.active).map((t) => this.balanceOf(userId, t, year)) });
  }

  private balanceOf(userId: string, type: LeaveType, year: number): LeaveBalance {
    const mine = this.leaves.filter((l) => l.userId === userId && l.typeId === type.id && Number(l.from.slice(0, 4)) === year);
    const used = mine.filter((l) => l.status === 'approved').reduce((n, l) => n + l.days, 0);
    const pending = mine.filter((l) => l.status === 'pending').reduce((n, l) => n + l.days, 0);
    return { typeId: type.id, year, entitlement: type.entitlementDays, used, pending, remaining: type.entitlementDays === null ? null : type.entitlementDays - used - pending };
  }

  // ---- leave applications ---------------------------------------------------------------------------------------

  private leaveView(l: StoredLeave): LeaveApplication {
    return clean({ ...l, userName: nameOf(l.userId) });
  }

  private leave(req: MockRequest, user: DemoUser, id?: string, action?: string): MockResult {
    if (!id) {
      if (req.method === 'GET') return this.listLeave(req, user);
      return req.method === 'POST' ? this.apply(req, user) : fail(405, 'notFound');
    }
    const found = this.leaves.find((l) => l.id === id);
    const canSeeAll = has(user, 'leave.approve') || has(user, 'hr.view');
    if (!found || (found.userId !== user.profile.id && !canSeeAll)) return fail(404, 'notFound');
    if (req.method === 'GET' && !action) return ok({ data: this.leaveView(found) });
    if (req.method !== 'POST') return fail(405, 'notFound');
    if (action === 'approve' || action === 'reject') return this.decide(req, user, found, action);
    if (action === 'cancel') return this.cancel(user, found);
    return fail(404, 'notFound');
  }

  private listLeave(req: MockRequest, user: DemoUser): MockResult {
    const all = has(user, 'leave.approve') || has(user, 'hr.view');
    const userId = req.query.get('userId');
    const status = req.query.get('status');
    const rows = this.leaves
      .filter((l) => (all ? !userId || l.userId === userId : l.userId === user.profile.id))
      .filter((l) => !status || l.status === status)
      .sort((a, b) => b.from.localeCompare(a.from) || b.id.localeCompare(a.id))
      .map((l) => this.leaveView(l));
    return ok({ data: rows });
  }

  private apply(req: MockRequest, user: DemoUser): MockResult {
    const forOther = typeof req.body['userId'] === 'string' && req.body['userId'] !== user.profile.id;
    const denied = need(user, forOther ? 'hr.manage' : 'leave.apply');
    if (denied) return denied;
    const userId = forOther ? (req.body['userId'] as string) : user.profile.id;
    const profile = this.profiles.find((p) => p.userId === userId);
    if (!profile || profile.status !== 'active') return invalid({ userId: ['notEmployee'] });
    const errors = validate(req.body, { typeId: { kind: 'text', required: true }, from: { kind: 'date', required: true }, to: { kind: 'date', required: true }, reason: { kind: 'text' } }, false);
    const type = this.types.find((t) => t.id === req.body['typeId'] && t.active);
    if (!errors['typeId'] && !type) errors['typeId'] = ['invalidChoice'];
    const from = text(req.body['from']);
    const to = text(req.body['to']);
    if (!errors['from'] && !errors['to']) {
      if (to < from) errors['to'] = ['invalidDate'];
      else if (from.slice(0, 4) !== to.slice(0, 4)) errors['to'] = ['leaveYear'];
    }
    if (Object.keys(errors).length || !type) return invalid(errors);
    const days = workingDays(from, to, this.settings);
    if (days < 1) return invalid({ from: ['leaveNoDays'] });
    if (this.leaves.some((l) => l.userId === userId && (l.status === 'pending' || l.status === 'approved') && l.from <= to && from <= l.to)) return invalid({ from: ['leaveOverlap'] });
    const balance = this.balanceOf(userId, type, Number(from.slice(0, 4)));
    if (balance.remaining !== null && days > balance.remaining) return invalid({ typeId: ['leaveBalance'] });
    const application: StoredLeave = { id: `lv-${this.seq++}`, userId, typeId: type.id, from, to, days, reason: text(req.body['reason']), status: 'pending', createdAt: new Date().toISOString() };
    this.leaves.push(application);
    this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'hr.leave_apply', entityType: 'leave', entityId: application.id, after: { userId, typeId: type.id, from, to, days } });
    return ok({ data: this.leaveView(application) }, 201);
  }

  private decide(req: MockRequest, user: DemoUser, l: StoredLeave, action: 'approve' | 'reject'): MockResult {
    const denied = need(user, 'leave.approve');
    if (denied) return denied;
    if (l.userId === user.profile.id) return fail(409, 'leaveSelf');
    if (l.status !== 'pending') return fail(409, 'alreadyDecided');
    const note = text(req.body['note'] ?? req.body['comment']);
    if (action === 'reject' && !note) return invalid({ note: ['required'] });
    if (action === 'approve') {
      const type = this.types.find((t) => t.id === l.typeId);
      const b = type && this.balanceOf(l.userId, type, Number(l.from.slice(0, 4)));
      // Its own pending days are already counted in `pending`, so approval needs no extra room.
      if (b && b.remaining !== null && b.remaining < 0) return invalid({ typeId: ['leaveBalance'] });
    }
    Object.assign(l, { status: action === 'approve' ? 'approved' : 'rejected', decidedBy: user.profile.name, decidedAt: new Date().toISOString(), ...(note ? { note } : {}) });
    this.hub?.notify(l.userId, `leave.${action === 'approve' ? 'approved' : 'rejected'}`, { from: l.from, to: l.to }, '/app/hr/leave');
    this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: `hr.leave_${action}`, entityType: 'leave', entityId: l.id, after: { userId: l.userId } });
    return ok({ data: this.leaveView(l) });
  }

  private cancel(user: DemoUser, l: StoredLeave): MockResult {
    const own = l.userId === user.profile.id;
    const manager = has(user, 'hr.manage');
    if (!own && !manager) return fail(403, 'forbidden');
    // A person withdraws their own request; only HR managers undo an approved one.
    if (l.status !== 'pending' && !(l.status === 'approved' && manager)) return fail(409, 'invalidTransition');
    l.status = 'cancelled';
    this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'hr.leave_cancel', entityType: 'leave', entityId: l.id, after: { userId: l.userId } });
    return ok({ data: this.leaveView(l) });
  }

  // ---- payroll --------------------------------------------------------------------------------------------------

  private payroll(req: MockRequest, user: DemoUser, a?: string, b?: string): MockResult {
    if (a === 'slips') return req.method === 'GET' ? this.slips(req, user) : fail(405, 'notFound');
    if (a !== 'runs') return fail(404, 'notFound');
    const denied = need(user, 'payroll.view');
    if (denied) return denied;
    if (!b) {
      if (req.method === 'GET') {
        const rows = [...this.runs].sort((x, y) => y.month.localeCompare(x.month)).map((r) => ({ month: r.month, status: r.status, employees: r.slips.length, net: r.totals.net }));
        return ok({ data: rows });
      }
      return req.method === 'POST' ? this.generate(req, user) : fail(405, 'notFound');
    }
    const run = this.runs.find((r) => r.month === b);
    if (req.method === 'GET') return run ? ok({ data: structuredClone(run) }) : fail(404, 'notFound');
    return req.method === 'POST' && req.path.endsWith('/finalize') ? this.finalize(user, b) : fail(404, 'notFound');
  }

  private generate(req: MockRequest, user: DemoUser): MockResult {
    const denied = need(user, 'payroll.process');
    if (denied) return denied;
    const month = text(req.body['month']);
    if (!MONTH.test(month) || month > mockToday().slice(0, 7)) return invalid({ month: ['payrollMonth'] });
    const existing = this.runs.find((r) => r.month === month);
    if (existing?.status === 'final') return fail(409, 'payrollFinal');
    const monthEnd = `${month}-31`;
    const slips = this.profiles
      .filter((p) => p.status === 'active' && p.hireDate <= monthEnd)
      .flatMap((p) => {
        const salary = this.salaries.find((s) => s.userId === p.userId);
        if (!salary || isZero(salary.baseSalary)) return [];
        const unpaid = this.leaves
          .filter((l) => l.userId === p.userId && l.status === 'approved' && this.types.find((t) => t.id === l.typeId)?.paid === false)
          .reduce((n, l) => n + workingDaysInMonth(l.from, l.to, month, this.settings), 0);
        return [buildSlip({ userId: p.userId, name: nameOf(p.userId), month, baseSalary: salary.baseSalary, components: salary.components, unpaidLeaveDays: unpaid }, this.settings)];
      });
    const run: PayrollRun = { month, status: 'draft', generatedAt: new Date().toISOString(), generatedBy: user.profile.name, slips, totals: totalsOf(slips) };
    if (existing) Object.assign(existing, run);
    else this.runs.push(run);
    this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'hr.payroll_generate', entityType: 'payroll_run', entityId: month, after: { employees: slips.length } });
    return ok({ data: structuredClone(run) }, existing ? 200 : 201);
  }

  private finalize(user: DemoUser, month: string): MockResult {
    const denied = need(user, 'payroll.process');
    if (denied) return denied;
    const run = this.runs.find((r) => r.month === month);
    if (!run) return fail(404, 'notFound');
    if (run.status === 'final') return fail(409, 'payrollFinal');
    if (!run.slips.length) return fail(409, 'payrollEmpty');
    Object.assign(run, { status: 'final', finalizedAt: new Date().toISOString(), finalizedBy: user.profile.name });
    this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'hr.payroll_finalize', entityType: 'payroll_run', entityId: month, after: { employees: run.slips.length } });
    return ok({ data: structuredClone(run) });
  }

  /** A person's own payslips (finalised runs only), or anyone's with payroll.view. */
  private slips(req: MockRequest, user: DemoUser): MockResult {
    const userId = req.query.get('userId') || user.profile.id;
    const denied = userId === user.profile.id ? null : need(user, 'payroll.view');
    if (denied) return denied;
    const all = has(user, 'payroll.view');
    const rows = this.runs
      .filter((r) => r.status === 'final' || (all && userId !== user.profile.id))
      .flatMap((r) => r.slips.filter((s) => s.userId === userId))
      .sort((x, y) => y.month.localeCompare(x.month));
    return ok({ data: structuredClone(rows) });
  }
}
