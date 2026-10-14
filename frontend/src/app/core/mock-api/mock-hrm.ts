import { CONTRACT_TYPES, Contract, DepartmentNode, EMPLOYEE_STATUSES, EmployeeLite, HrDashboard, OrgKind } from '../../features/hrm/hrm.models';
import { addDays, mockToday } from './mock-clock';
import { seedProfiles } from './mock-hr-data';
import { MockAudit } from './mock-audit';
import { FieldErrors } from './mock-clients-rules';
import { MockModule, MockRequest, MockResult, clean, fail, invalid, need, ok } from './mock-types';
import { DEMO_USERS, DemoUser } from './mock-users';

type Row = Record<string, unknown> & { id: string; code: string; active: boolean };
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS: Record<OrgKind, { fields: string[]; required: string[]; employeeField: string }> = {
  departments: { fields: ['code', 'name', 'nameAr', 'costCenter', 'parentId'], required: ['code', 'name'], employeeField: 'departmentId' },
  branches: { fields: ['code', 'name', 'nameAr', 'address'], required: ['code', 'name'], employeeField: 'branchId' },
  grades: { fields: ['code', 'name', 'level'], required: ['code', 'name', 'level'], employeeField: 'gradeId' },
  positions: { fields: ['code', 'title', 'titleAr', 'departmentId', 'gradeId'], required: ['code', 'title'], employeeField: 'positionId' },
};

/**
 * Mock of the HR core API served by backend-mongo (/api/v1/staff/hrm): organization structure, the employee directory,
 * contracts and the HR dashboard. It enforces the same rules as the real service so the screens behave the same in demo mode.
 */
export class MockHrm implements MockModule {
  private readonly org: Record<OrgKind, Row[]> = { departments: [], branches: [], grades: [], positions: [] };
  private readonly employees: EmployeeLite[] = [];
  private readonly contracts: Contract[] = [];
  private seq = 1;

  constructor(private readonly audit: MockAudit) {
    const row = (kind: OrgKind, o: Record<string, unknown>) => this.org[kind].push({ active: true, ...o, id: `${kind}-${this.seq++}` } as Row);
    row('branches', { code: 'CAI', name: 'Cairo HQ', nameAr: 'المقر الرئيسي - القاهرة' });
    row('branches', { code: 'ALX', name: 'Alexandria', nameAr: 'الإسكندرية' });
    for (const [code, name, nameAr] of [['MGT', 'Management', 'الإدارة'], ['ACC', 'Accounting', 'المحاسبة'], ['TAX', 'Tax', 'الضرائب'], ['AUD', 'Audit', 'المراجعة']]) row('departments', { code, name, nameAr });
    row('grades', { code: 'G1', name: 'Junior', level: 1 });
    row('grades', { code: 'G2', name: 'Senior', level: 2 });
    row('grades', { code: 'G3', name: 'Manager', level: 3 });
    row('positions', { code: 'ACCT', title: 'Accountant', titleAr: 'محاسب' });
    const dept = (name: string) => this.org.departments.find((d) => d['name'] === name)?.id ?? null;
    seedProfiles().forEach((p, i) => {
      const user = DEMO_USERS.find((u) => u.profile.id === p.userId);
      const [firstName, ...rest] = (user?.profile.name ?? p.userId).split(' ');
      this.employees.push({ id: p.userId, employeeNo: `EMP-${String(i + 1).padStart(5, '0')}`, firstName, lastName: rest.join(' ') || '-', status: 'active', departmentId: dept(p.department), branchId: this.org.branches[i % 2].id, positionId: null, employmentType: p.employmentType, hireDate: p.hireDate });
    });
    const add = (employeeId: string, type: string, startDate: string, endDate: string | null, status: Contract['status']) =>
      this.contracts.push({ id: `ct-${this.seq++}`, employeeId, number: `${this.employees.find((e) => e.id === employeeId)!.employeeNo}-C1`, version: 1, type, status, startDate, endDate, probationMonths: null, renewalTerms: null, alertDays: 60, previousContractId: null, daysToEnd: null });
    add('u-auditor', 'fixed_term', '2025-11-01', '2026-11-30', 'active');
    add('u-accountant', 'permanent', '2023-02-01', null, 'active');
    add('u-tax', 'fixed_term', '2026-11-01', '2027-10-31', 'draft');
  }

  handle(req: MockRequest, user: DemoUser): MockResult {
    if (user.profile.type !== 'staff') return fail(403, 'forbidden');
    const [, a, b, c] = req.path.split('/');
    const get = req.method === 'GET';
    if (a === 'dashboard' && get) return need(user, 'hr.employees.view') ?? ok({ data: this.dashboard(Number(req.query.get('expiringInDays')) || 60) });
    if (a === 'departments-tree' && get) return need(user, 'hr.employees.view') ?? ok({ data: this.tree() });
    if (a === 'employees' && get && !b) return need(user, 'hr.employees.view') ?? this.listEmployees(req);
    if (a === 'contracts') return this.contract(req, user, b, c);
    if (a && a in KINDS) return this.orgKind(req, user, a as OrgKind, b);
    return fail(404, 'notFound');
  }

  // ---- organization --------------------------------------------------------------------------------------------

  private orgKind(req: MockRequest, user: DemoUser, kind: OrgKind, id?: string): MockResult {
    const rows = this.org[kind];
    if (req.method === 'GET' && !id) return need(user, 'hr.employees.view') ?? ok({ data: structuredClone(req.query.get('active') === 'true' ? rows.filter((r) => r.active) : rows) });
    const denied = need(user, 'hr.org.manage');
    if (denied) return denied;
    const spec = KINDS[kind];
    const current = id ? rows.find((r) => r.id === id) : undefined;
    if (req.method === 'PATCH' && !current) return fail(404, 'notFound');
    const errors: FieldErrors = {};
    const data: Record<string, unknown> = {};
    for (const f of spec.fields) {
      if (!(f in req.body)) { if (!current && spec.required.includes(f)) errors[f] = ['required']; continue; }
      data[f] = f === 'level' ? Number(req.body[f]) : text(req.body[f]) || null;
      if (spec.required.includes(f) && !data[f]) errors[f] = ['required'];
    }
    if (typeof req.body['active'] === 'boolean') data['active'] = req.body['active'];
    if (typeof data['code'] === 'string' && rows.some((r) => r.code === data['code'] && r.id !== id)) errors['code'] = ['hrmDuplicate'];
    if (kind === 'departments' && data['parentId']) {
      for (let cur = data['parentId'] as string | null; cur; cur = (rows.find((r) => r.id === cur)?.['parentId'] as string | null) ?? null) {
        if (cur === id) { errors['parentId'] = ['hrmCycle']; break; }
      }
    }
    if (current && data['active'] === false && current.active && this.employees.some((e) => (e as unknown as Record<string, unknown>)[spec.employeeField] === id && ['active', 'inactive'].includes(e.status))) errors['active'] = ['hrmInUse'];
    if (Object.keys(errors).length) return invalid(errors);
    if (current) Object.assign(current, clean(data));
    else rows.push({ active: true, ...clean(data), id: `${kind}-${this.seq++}` } as Row);
    const saved = current ?? rows[rows.length - 1];
    this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: `hr.${kind}.${current ? 'updated' : 'created'}`, entityType: kind, entityId: saved.id });
    return ok({ data: structuredClone(saved) }, current ? 200 : 201);
  }

  private tree(): DepartmentNode[] {
    const nodes = new Map<string, DepartmentNode>(this.org.departments.map((d) => [d.id, { ...(structuredClone(d) as unknown as DepartmentNode), parentId: (d['parentId'] as string | null) ?? null, headcount: this.employees.filter((e) => e.departmentId === d.id && e.status === 'active').length, children: [] }]));
    const roots: DepartmentNode[] = [];
    for (const n of nodes.values()) (n.parentId && nodes.get(n.parentId) ? nodes.get(n.parentId)!.children : roots).push(n);
    return roots;
  }

  // ---- employees and contracts ---------------------------------------------------------------------------------

  private listEmployees(req: MockRequest): MockResult {
    const q = (req.query.get('q') ?? '').toLowerCase();
    const status = req.query.get('status');
    const rows = this.employees.filter((e) => (!status || e.status === status) && (!q || `${e.firstName} ${e.lastName} ${e.employeeNo}`.toLowerCase().includes(q)));
    const page = Math.max(1, Number(req.query.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.get('pageSize')) || 20));
    return ok({ data: rows.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: rows.length } });
  }

  private dto(c: Contract): Contract {
    return { ...c, daysToEnd: c.endDate ? Math.round((Date.parse(c.endDate) - Date.parse(mockToday())) / 86_400_000) : null };
  }

  private contract(req: MockRequest, user: DemoUser, id?: string, action?: string): MockResult {
    const today = mockToday();
    if (req.method === 'GET' && !id) {
      const denied = need(user, 'hr.contracts.view');
      if (denied) return denied;
      const status = req.query.get('status');
      const days = Number(req.query.get('expiringInDays'));
      let rows = this.contracts.filter((c) => !status || c.status === status);
      if (days > 0) rows = rows.filter((c) => c.status === 'active' && c.endDate && c.endDate >= today && c.endDate <= addDays(today, days));
      return ok({ data: rows.map((c) => this.dto(c)), meta: { page: 1, pageSize: rows.length, total: rows.length } });
    }
    const denied = need(user, 'hr.contracts.manage');
    if (denied) return denied;
    const errors: FieldErrors = {};
    if (req.method === 'POST' && !id) {
      const b = req.body;
      const employee = this.employees.find((e) => e.id === b['employeeId']);
      if (!employee) errors['employeeId'] = ['hrmUnknown'];
      else if (['terminated', 'archived'].includes(employee.status)) errors['employeeId'] = ['hrmLeft'];
      if (!(CONTRACT_TYPES as readonly string[]).includes(text(b['type']))) errors['type'] = ['required'];
      if (!DATE.test(text(b['startDate']))) errors['startDate'] = ['invalidDate'];
      const end = text(b['endDate']);
      if (end && !DATE.test(end)) errors['endDate'] = ['invalidDate'];
      if (['fixed_term', 'probation'].includes(text(b['type'])) && !end) errors['endDate'] = ['required'];
      if (end && end <= text(b['startDate'])) errors['endDate'] = ['hrmAfterStart'];
      if (Object.keys(errors).length) return invalid(errors);
      const n = this.contracts.filter((c) => c.employeeId === employee!.id).length + 1;
      const created: Contract = { id: `ct-${this.seq++}`, employeeId: employee!.id, number: `${employee!.employeeNo}-C${n}`, version: 1, type: text(b['type']), status: 'draft', startDate: text(b['startDate']), endDate: end || null, probationMonths: null, renewalTerms: null, alertDays: 60, previousContractId: null, daysToEnd: null };
      this.contracts.push(created);
      this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'hr.contract.created', entityType: 'contract', entityId: created.id });
      return ok({ data: this.dto(created) }, 201);
    }
    const c = this.contracts.find((x) => x.id === id);
    if (!c) return fail(404, 'notFound');
    if (req.method !== 'POST') return fail(405, 'notFound');
    if (action === 'activate') {
      if (c.status !== 'draft') return invalid({ status: ['invalidTransition'] });
      const clash = this.contracts.some((o) => o.id !== c.id && o.employeeId === c.employeeId && o.status === 'active' && o.id !== c.previousContractId && (!c.endDate || o.startDate <= c.endDate) && (!o.endDate || c.startDate <= o.endDate));
      if (clash) return invalid({ startDate: ['hrmOverlap'] });
      const prev = this.contracts.find((o) => o.id === c.previousContractId);
      if (prev?.status === 'active') prev.status = 'renewed';
      c.status = 'active';
    } else if (action === 'renew') {
      if (c.status !== 'active' || !c.endDate) return invalid({ status: ['invalidTransition'] });
      if (this.contracts.some((o) => o.previousContractId === c.id && ['draft', 'active'].includes(o.status))) return invalid({ status: ['hrmInProgress'] });
      const start = addDays(c.endDate, 1);
      const end = text(req.body['endDate']);
      if (!DATE.test(end) || end <= start) return invalid({ endDate: ['hrmAfterStart'] });
      const next: Contract = { ...c, id: `ct-${this.seq++}`, number: `${c.number.replace(/-V\d+$/, '')}-V${c.version + 1}`, version: c.version + 1, status: 'draft', startDate: start, endDate: end, previousContractId: c.id, daysToEnd: null };
      this.contracts.push(next);
      return ok({ data: this.dto(next) }, 201);
    } else if (action === 'terminate') {
      if (c.status !== 'active') return invalid({ status: ['invalidTransition'] });
      if (!text(req.body['reason'])) return invalid({ reason: ['required'] });
      c.status = 'terminated';
    } else return fail(404, 'notFound');
    this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: `hr.contract.${action}`, entityType: 'contract', entityId: c.id });
    return ok({ data: this.dto(c) });
  }

  // ---- dashboard -----------------------------------------------------------------------------------------------

  private dashboard(expiringDays: number): HrDashboard {
    const today = mockToday();
    const status = (s: string) => this.employees.filter((e) => e.status === s).length;
    const active = this.employees.filter((e) => e.status === 'active');
    const count = (kind: 'departments' | 'branches', field: 'departmentId' | 'branchId') =>
      this.org[kind].map((o) => ({ id: o.id, name: String(o['name']), count: active.filter((e) => e[field] === o.id).length })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count);
    const expiring = this.contracts.filter((c) => c.status === 'active' && c.endDate && c.endDate >= today && c.endDate <= addDays(today, expiringDays));
    const months = new Map<string, number>();
    for (const e of this.employees.filter((x) => x.hireDate >= addDays(today, -183))) months.set(e.hireDate.slice(0, 7), (months.get(e.hireDate.slice(0, 7)) ?? 0) + 1);
    const types = new Map<string, number>();
    for (const e of active) types.set(e.employmentType, (types.get(e.employmentType) ?? 0) + 1);
    return {
      asOf: today, total: this.employees.length - status('archived'), active: active.length, inactive: status('inactive'), terminated: status('terminated'),
      newHires30d: active.filter((e) => e.hireDate >= addDays(today, -30)).length, onProbation: 0,
      contractsExpiring: { days: expiringDays, count: expiring.length, items: expiring.map((c) => ({ id: c.id, number: c.number, employeeId: c.employeeId, endDate: c.endDate! })) },
      turnover12m: { terminations: 0, rate: 0 },
      byDepartment: count('departments', 'departmentId'), byBranch: count('branches', 'branchId'),
      byEmploymentType: [...types].map(([type, n]) => ({ type, count: n })),
      hiresByMonth: [...months].sort().map(([month, n]) => ({ month, count: n })),
      upcomingBirthdays: [], upcomingAnniversaries: active.map((e) => {
        const next = `${today.slice(0, 4)}-${e.hireDate.slice(5)}`;
        const when = next < today ? `${Number(today.slice(0, 4)) + 1}-${e.hireDate.slice(5)}` : next;
        return { id: e.id, name: `${e.firstName} ${e.lastName}`, date: e.hireDate, in: Math.round((Date.parse(when) - Date.parse(today)) / 86_400_000), years: Number(when.slice(0, 4)) - Number(e.hireDate.slice(0, 4)) };
      }).filter((x) => x.in <= 30 && x.years > 0).sort((a, b) => a.in - b.in),
    };
  }
}
void EMPLOYEE_STATUSES;
