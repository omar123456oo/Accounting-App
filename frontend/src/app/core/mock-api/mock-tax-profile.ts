import { Deadline, DeadlineStatus, TaxProfile } from '../../features/tax/tax.models';
import { addDays, endOfMonth, firstOfMonthAfter, mockToday } from './mock-clock';
import { LedgerCtx } from './mock-ledger-store';
import { MockResult, fail, invalid, need, ok } from './mock-types';
import { DEMO_USERS } from './mock-users';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const userName = (id: string): string => DEMO_USERS.find((u) => u.profile.id === id)?.profile.name ?? id;
const DUE_SOON_DAYS = 7;

function days(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function profileOf(ctx: LedgerCtx): TaxProfile {
  const stored = ctx.store.compliance.profiles.get(ctx.entity.id);
  const clientName = ctx.entity.clientId ? ctx.clients.clientName(ctx.entity.clientId) : undefined;
  return structuredClone({ ledgerEntityId: ctx.entity.id, registrationNo: '', regimeLabel: '', identifiers: [], obligations: [], ...stored, ...(ctx.entity.clientId ? { clientId: ctx.entity.clientId, clientName } : {}) });
}

/** Per-ledger (so per-client) tax profile: registration identifiers, a free regime label and the obligations assigned. */
export function handleProfile(ctx: LedgerCtx): MockResult {
  const { req, user, store, entity } = ctx;
  if (req.method === 'GET') return need(user, 'tax.view') ?? ok({ data: profileOf(ctx) });
  if (req.method !== 'PUT') return fail(405, 'notFound');
  const denied = need(user, 'tax.prepare');
  if (denied) return denied;
  const body = req.body;
  const c = store.compliance;
  const errors: Record<string, Array<'required' | 'invalidChoice'>> = {};
  if (!text(body['registrationNo'])) errors['registrationNo'] = ['required'];
  const identifiers = Array.isArray(body['identifiers']) ? (body['identifiers'] as Array<Record<string, unknown>>) : [];
  if (identifiers.some((i) => !text(i['label']) || !text(i['value']))) errors['identifiers'] = ['required'];
  const obligations = Array.isArray(body['obligations']) ? (body['obligations'] as Array<Record<string, unknown>>) : [];
  const staff = new Set(DEMO_USERS.filter((u) => u.profile.type === 'staff').map((u) => u.profile.id));
  if (obligations.some((o) => !c.obligationTypes.some((t) => t.id === o['obligationTypeId']) || !staff.has(text(o['responsibleUserId'])))) errors['obligations'] = ['invalidChoice'];
  if (new Set(obligations.map((o) => o['obligationTypeId'])).size !== obligations.length) errors['obligations'] = ['invalidChoice'];
  if (Object.keys(errors).length) return invalid(errors);
  const before = profileOf(ctx);
  const profile: TaxProfile = {
    ledgerEntityId: entity.id,
    registrationNo: text(body['registrationNo']),
    regimeLabel: text(body['regimeLabel']),
    identifiers: identifiers.map((i) => ({ label: text(i['label']), value: text(i['value']) })),
    obligations: obligations.map((o) => ({ obligationTypeId: text(o['obligationTypeId']), responsibleUserId: text(o['responsibleUserId']), active: o['active'] !== false })),
    updatedAt: new Date().toISOString(),
    updatedBy: user.profile.name,
  };
  c.profiles.set(entity.id, profile);
  c.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'tax.profile_saved', entityType: 'tax_profile', entityId: entity.id, before, after: profile });
  return ok({ data: profileOf(ctx) });
}

/** Periods of a recurrence whose end lies between two dates. Annual periods are calendar years. */
function periods(recurrence: string, from: string, to: string): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = [];
  const step = recurrence === 'monthly' ? 1 : recurrence === 'quarterly' ? 3 : 12;
  let start = recurrence === 'monthly' ? firstOfMonthAfter(from, -1) : recurrence === 'quarterly' ? `${from.slice(0, 5)}${String(Math.floor((Number(from.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01` : `${from.slice(0, 4)}-01-01`;
  start = firstOfMonthAfter(start, -step);
  for (let i = 0; i < 40 && start <= to; i++) {
    const end = endOfMonth(firstOfMonthAfter(start, step - 1));
    out.push({ start, end });
    start = firstOfMonthAfter(start, step);
  }
  return out;
}

/** Deadlines of one ledger, computed from its profile obligations and the filing-calendar rules (all data, all demo here). */
export function deadlinesOf(ctx: LedgerCtx, from: string, to: string): Deadline[] {
  const c = ctx.store.compliance;
  const today = mockToday();
  const out = new Map<string, Deadline>();
  for (const o of profileOf(ctx).obligations.filter((x) => x.active)) {
    const type = c.obligationTypes.find((t) => t.id === o.obligationTypeId);
    if (!type) continue;
    for (const rule of c.calendarRules.filter((r) => r.obligationTypeId === type.id && r.approvalStatus !== 'retired')) {
      for (const p of periods(rule.recurrence, addDays(from, -400), to)) {
        if (p.end < rule.effectiveFrom || (rule.effectiveTo && p.end > rule.effectiveTo)) continue;
        const dueDate = addDays(p.end, rule.dueDayOffset);
        if (dueDate < from || dueDate > to) continue;
        const id = `${type.id}|${p.start}`;
        const seen = out.get(id);
        if (seen && c.calendarRules.find((r) => r.id === seen.ruleId)!.effectiveFrom >= rule.effectiveFrom) continue;
        const current = c.returns.find((r) => r.ledgerEntityId === ctx.entity.id && r.kind === (type.kind as string) && r.periodStart === p.start && r.periodEnd === p.end && !r.supersededById);
        const daysToDue = days(today, dueDate);
        const done = current?.state === 'ready_for_submission';
        const status: DeadlineStatus = done ? 'done' : daysToDue < 0 ? 'overdue' : daysToDue <= DUE_SOON_DAYS ? 'due_soon' : 'upcoming';
        out.set(id, { id, obligationTypeId: type.id, obligationKind: type.kind, nameAr: type.nameAr, nameEn: type.nameEn, periodStart: p.start, periodEnd: p.end, dueDate, daysToDue, status, responsibleUserId: o.responsibleUserId, responsibleName: userName(o.responsibleUserId), ruleId: rule.id, ruleVersion: rule.version, ruleIsDemo: rule.isDemo, ...(current ? { returnId: current.id } : {}), reminders: structuredClone(c.reminders.get(`${ctx.entity.id}|${id}`) ?? []) });
      }
    }
  }
  return [...out.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
}

/** Default window: the last 45 days (to show what is overdue) and the next 120. */
export function handleDeadlines(ctx: LedgerCtx, rest: string[]): MockResult {
  const { req, user } = ctx;
  const today = mockToday();
  if (req.method === 'GET' && rest.length === 0) {
    const denied = need(user, 'tax.view');
    if (denied) return denied;
    const from = req.query.get('from') || addDays(today, -45);
    const to = req.query.get('to') || addDays(today, 120);
    return ok({ data: deadlinesOf(ctx, from, to) });
  }
  if (req.method !== 'POST' || rest[0] !== 'remind') return fail(405, 'notFound');
  const denied = need(user, 'tax.prepare');
  if (denied) return denied;
  const id = text(req.body['deadlineId']);
  const deadline = deadlinesOf(ctx, addDays(today, -400), addDays(today, 400)).find((d) => d.id === id);
  if (!deadline) return fail(404, 'notFound');
  const key = `${ctx.entity.id}|${id}`;
  const note = text(req.body['note']) || undefined;
  const list = ctx.store.compliance.reminders.get(key) ?? [];
  // Mock only: the reminder is logged, nothing is sent to anyone.
  list.push({ at: new Date().toISOString(), actor: user.profile.name, delivery: 'logged_only', ...(note ? { note } : {}) });
  ctx.store.compliance.reminders.set(key, list);
  ctx.store.compliance.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'tax.reminder_logged', entityType: 'tax_deadline', entityId: id, after: { ledgerEntityId: ctx.entity.id } });
  return ok({ data: deadlinesOf(ctx, addDays(today, -400), addDays(today, 400)).find((d) => d.id === id) });
}
