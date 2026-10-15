import { Router } from 'express';

import { can } from '../auth/session.js';
import { appendAudit } from '../db/audit-chain.js';
import { Role, User } from '../models/index.js';
import { Errors, HttpError, idOf, isDate, notFound, orgOf, text, wrap } from '../hr/common.js';
import { mergedFields, resolveDocType } from './doctypes.js';
import { DocRecord } from './models.js';
import { dto, typeOf } from './records.routes.js';
import { validateDefinition, type Condition, type Escalation, type Transition, type WorkflowDef, type WorkflowState } from './workflow-rules.js';
import { Delegation, Notification, Workflow } from './workflow.models.js';
import { actionsFor, activeWorkflow, alreadyApproved, approvalKey, approversOf, candidates, loadActor, notify, qualifier, recordLink, stateOf } from './workflow.service.js';

export const workflowRouter = Router();

const HEX24 = /^[0-9a-f]{24}$/i;
const strings = (v: unknown, max = 64): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, max)).filter(Boolean) : []);
const bool = (v: unknown): boolean => v === true;

/** The request body as a definition. Malformed parts become validation errors; nothing is evaluated. */
function parseDefinition(body: any, errors: Errors): (WorkflowDef & { name: string; active: boolean }) | null {
  const list = (k: string): any[] => { if (Array.isArray(body?.[k])) return body[k]; errors.add(k, 'Send a list.'); return []; };
  const states: WorkflowState[] = list('states').map((s) => ({ name: String(s?.name ?? ''), label: text(s?.label, 120) ?? '', editable: bool(s?.editable) }));
  const transitions: Transition[] = list('transitions').map((t) => ({
    from: String(t?.from ?? ''), to: String(t?.to ?? ''), action: String(t?.action ?? ''), label: text(t?.label, 120) ?? '',
    allowedRoles: strings(t?.allowedRoles), allowedUsers: strings(t?.allowedUsers, 24),
    approvals: typeof t?.approvals === 'number' ? t.approvals : 1, requireComment: bool(t?.requireComment), preventSelfApproval: bool(t?.preventSelfApproval),
    conditions: (Array.isArray(t?.conditions) ? t.conditions : []).map((c: any): Condition => ({ field: String(c?.field ?? ''), op: String(c?.op ?? '') as Condition['op'], value: c?.value })),
  }));
  const escalations: Escalation[] = (Array.isArray(body?.escalations) ? body.escalations : []).map((e: any) => ({
    state: String(e?.state ?? ''), afterHours: typeof e?.afterHours === 'number' ? e.afterHours : NaN, notifyRoles: strings(e?.notifyRoles), notifyUsers: strings(e?.notifyUsers, 24), remindApprovers: bool(e?.remindApprovers),
  }));
  const name = text(body?.name, 120);
  if (!name) errors.add('name', 'Required.');
  return { name: name ?? '', active: body?.active !== false, states, initialState: String(body?.initialState ?? ''), transitions, escalations };
}

/** Roles and staff of this organization, for the pickers of the workflow editor. Names and roles only. */
workflowRouter.get('/directory', can('admin.settings'), wrap(async (req, res) => {
  const org = orgOf(req);
  const [roles, users] = await Promise.all([Role.find({ organizationId: org }).select('name').sort({ name: 1 }).lean(), User.find({ organizationId: org, type: 'staff' }).select('name roles').sort({ name: 1 }).lean()]);
  res.json({ data: { roles: roles.map((r) => r.name), users: users.map((u) => ({ id: String(u._id), name: u.name, roles: u.roles })) } });
}));

/** Colleagues a person may delegate to: id and name only, never the caller. */
workflowRouter.get('/people', wrap(async (req, res) => {
  const users = await User.find({ organizationId: orgOf(req), type: 'staff', _id: { $ne: req.auth!.userId } }).select('name').sort({ name: 1 }).lean();
  res.json({ data: users.map((u) => ({ id: String(u._id), name: u.name })) });
}));

workflowRouter.get('/workflows/:doctype', can('admin.settings'), wrap(async (req, res) => {
  const dt = await resolveDocType(orgOf(req), String(req.params.doctype));
  if (!dt?.isCustom) throw notFound();
  const w = await Workflow.findOne({ organizationId: orgOf(req), doctype: dt.name }).lean();
  if (!w) throw notFound();
  const { name, active, states, initialState, transitions, escalations } = w;
  res.json({ data: { name, active, states, initialState, transitions, escalations } });
}));

workflowRouter.put('/workflows/:doctype', can('admin.settings'), wrap(async (req, res) => {
  const org = orgOf(req);
  const dt = await resolveDocType(org, String(req.params.doctype));
  if (!dt?.isCustom) throw notFound();
  const errors = new Errors();
  const def = parseDefinition(req.body, errors);
  if (def) {
    for (const [k, msgs] of Object.entries(validateDefinition(def, (await mergedFields(org, dt)).map((f) => f.fieldname)))) msgs.forEach((m) => errors.add(k, m));
    // people and roles must exist in this organization
    const roles = new Set([...def.transitions.flatMap((t) => t.allowedRoles), ...def.escalations.flatMap((e) => e.notifyRoles)]);
    if (roles.size) {
      const known = new Set((await Role.find({ organizationId: org, name: { $in: [...roles] } }).select('name').lean()).map((r) => r.name));
      for (const r of roles) if (!known.has(r)) errors.add('transitions', `Unknown role "${r}".`);
    }
    const users = new Set([...def.transitions.flatMap((t) => t.allowedUsers), ...def.escalations.flatMap((e) => e.notifyUsers)]);
    const badIds = [...users].filter((u) => !HEX24.test(u));
    badIds.forEach((u) => errors.add('transitions', `"${u}" is not a user id.`));
    const goodIds = [...users].filter((u) => HEX24.test(u));
    if (goodIds.length) {
      const known = new Set((await User.find({ _id: { $in: goodIds }, organizationId: org, type: 'staff' }).select('_id').lean()).map((u) => String(u._id)));
      for (const u of goodIds) if (!known.has(u)) errors.add('transitions', `Unknown user ${u}.`);
    }
    const seenEsc = new Set<string>();
    for (const e of def.escalations) { if (seenEsc.has(e.state)) errors.add('escalations', `Only one escalation per state ("${e.state}").`); seenEsc.add(e.state); }
    // a state that still holds records cannot disappear
    const before = await Workflow.findOne({ organizationId: org, doctype: dt.name }).lean();
    const keep = new Set(def.states.map((s) => s.name));
    const removed = (before?.states ?? []).map((s) => s.name).filter((n) => !keep.has(n));
    if (removed.length) {
      const counts = await DocRecord.aggregate([{ $match: { organizationId: org, doctype: dt.name, workflowState: { $in: removed } } }, { $group: { _id: '$workflowState', n: { $sum: 1 } } }]);
      for (const c of counts) errors.add('states', `Cannot remove "${c._id}": ${c.n} record(s) are in it.`);
    }
  }
  errors.throwIfAny();
  const { name, active, states, initialState, transitions, escalations } = def!;
  const before = await Workflow.findOne({ organizationId: org, doctype: dt.name }).lean();
  await Workflow.findOneAndUpdate({ organizationId: org, doctype: dt.name }, { $set: { name, active, states, initialState, transitions, escalations } }, { upsert: true, new: true });
  await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'workflow.updated', entityType: 'Workflow', entityId: dt.name, before: before ? { active: before.active, states: before.states, transitions: before.transitions } : null, after: { active, states, transitions }, ip: req.ip });
  res.json({ data: { name, active, states, initialState, transitions, escalations } });
}));

// ---- acting on a record ------------------------------------------------------------------------------------------------------
workflowRouter.post('/records/:doctype/:name/actions', wrap(async (req, res) => {
  const dt = await typeOf(req);
  const org = orgOf(req);
  const wf = await activeWorkflow(org, dt.name);
  if (!wf) throw new HttpError(422, 'This document type has no active workflow.', { action: ['This document type has no active workflow.'] });
  const name = String(req.params.name);
  const rec = await DocRecord.findOne({ organizationId: org, doctype: dt.name, name }).lean();
  if (!rec) throw notFound();
  const action = typeof req.body?.action === 'string' ? req.body.action : '';
  const comment = text(req.body?.comment, 2000);
  const state = stateOf(wf, rec);
  const stateLabel = (n: string) => wf.states.find((s) => s.name === n)?.label ?? n;

  const options = candidates(wf, rec).filter((t) => t.action === action);
  if (!options.length) throw new HttpError(422, 'This action is not available.', { action: [`"${action}" is not available from "${stateLabel(state)}".`] });
  const actor = await loadActor(req);
  const creator = rec.createdBy ? String(rec.createdBy) : undefined;
  const chosen = options.map((t) => ({ t, via: qualifier(t, actor, creator) })).find((x) => x.via);
  if (!chosen) throw new HttpError(403, 'Forbidden.');
  const { t, via } = chosen;
  if (t.requireComment && !comment) throw new HttpError(422, 'A comment is required.', { comment: ['A comment is required for this action.'] });

  const now = new Date();
  const entry = { at: now, actorId: req.auth!.userId, actorName: actor.self.name, action: t.action, from: state, to: t.to, comment, ...(via!.userId !== actor.self.userId ? { onBehalfOf: via!.name } : {}) };
  // Every write is guarded by the time the record entered its state: if someone else moved it first, this one loses.
  const guard = { _id: rec._id, organizationId: org, stateEnteredAt: rec.stateEnteredAt ?? null };
  const conflict = () => new HttpError(409, 'This record was changed by someone else. Reload and try again.');
  const me = actor.self.userId;

  if (t.approvals > 1) {
    if (alreadyApproved(rec as never, t, me)) throw new HttpError(422, 'You have already approved this.', { action: ['You have already approved this.'] });
    const pushed = await DocRecord.findOneAndUpdate({ ...guard, 'approvals.userId': { $ne: req.auth!.userId } }, { $push: { approvals: { transition: approvalKey(t), userId: req.auth!.userId, at: now } } }, { new: true }).lean();
    if (!pushed) throw conflict();
    const given = (pushed.approvals ?? []).filter((a) => a.transition === approvalKey(t)).length;
    if (given < t.approvals) {
      const partial = await DocRecord.findOneAndUpdate({ _id: rec._id }, { $push: { history: { ...entry, to: state } } }, { new: true }).lean();
      await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'workflow.action', entityType: 'DocRecord', entityId: `${dt.name}/${name}`, before: { state }, after: { state, action: t.action, pending: t.approvals - given, comment }, ip: req.ip });
      res.json({ data: dto(dt, partial!, wf, actor), pending: t.approvals - given });
      return;
    }
  }

  const updated = await DocRecord.findOneAndUpdate(guard, { $set: { workflowState: t.to, stateEnteredAt: now, approvals: [], escalatedAt: null }, $push: { history: entry } }, { new: true }).lean();
  if (!updated) throw conflict();
  await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'workflow.action', entityType: 'DocRecord', entityId: `${dt.name}/${name}`, before: { state }, after: { state: t.to, action: t.action, comment, ...(entry.onBehalfOf ? { onBehalfOf: entry.onBehalfOf } : {}) }, ip: req.ip });

  const link = recordLink(dt.name, name);
  const approvers = await approversOf(org, wf, t.to, updated as never);
  approvers.delete(me);
  if (creator) approvers.delete(creator);
  await notify(org, approvers, { kind: 'workflow', title: `${dt.label} ${name}: ${stateLabel(t.to)}`, body: comment, link });
  if (creator && creator !== me) await notify(org, [creator], { kind: 'workflow', title: `${dt.label} ${name} is now ${stateLabel(t.to)}`, body: comment, link });
  res.json({ data: dto(dt, updated, wf, await loadActor(req)) });
}));

// ---- inbox: records waiting for the caller ---------------------------------------------------------------------------------
workflowRouter.get('/workflow/inbox', wrap(async (req, res) => {
  const org = orgOf(req);
  const actor = await loadActor(req);
  const people = [actor.self, ...actor.delegators];
  const items: unknown[] = [];
  for (const w of await Workflow.find({ organizationId: org, active: true }).lean()) {
    const dt = await resolveDocType(org, w.doctype);
    if (!dt || !req.auth!.permissions.includes(dt.viewPermission)) continue;
    const wf = w as unknown as Awaited<ReturnType<typeof activeWorkflow>> & object;
    const states = wf.states.map((s) => s.name).filter((s) => wf.transitions.some((t) => t.from === s && people.some((p) => t.allowedUsers.includes(p.userId) || t.allowedRoles.some((r) => p.roles.includes(r)))));
    if (!states.length) continue;
    const recs = await DocRecord.find({ organizationId: org, doctype: dt.name, $or: [{ workflowState: { $in: states } }, ...(states.includes(wf.initialState) ? [{ workflowState: null }] : [])] }).sort({ stateEnteredAt: 1, _id: 1 }).limit(200).lean();
    for (const r of recs) {
      const actions = actionsFor(wf, r as never, actor);
      if (!actions.length) continue;
      const base = dto(dt, r);
      items.push({ doctype: dt.name, doctypeLabel: dt.label, name: r.name, title: base.title, state: stateOf(wf, r), stateLabel: wf.states.find((s) => s.name === stateOf(wf, r))?.label, actions, since: r.stateEnteredAt ?? r.createdAt, route: recordLink(dt.name, r.name) });
    }
  }
  res.json({ data: items });
}));

// ---- delegations -------------------------------------------------------------------------------------------------------------
const delegationDto = async (d: any) => ({ id: String(d._id), toUserId: String(d.toUserId), toName: (await User.findById(d.toUserId).select('name').lean())?.name ?? null, startDate: d.startDate, endDate: d.endDate });

workflowRouter.get('/workflow/delegations', wrap(async (req, res) => {
  const rows = await Delegation.find({ organizationId: orgOf(req), fromUserId: req.auth!.userId }).sort({ startDate: -1 }).lean();
  res.json({ data: await Promise.all(rows.map(delegationDto)) });
}));

workflowRouter.post('/workflow/delegations', wrap(async (req, res) => {
  const org = orgOf(req);
  const errors = new Errors();
  const { toUserId, startDate, endDate } = req.body ?? {};
  const to = idOf(toUserId);
  if (!to) errors.add('toUserId', 'Choose a person.');
  else if (String(to) === String(req.auth!.userId)) errors.add('toUserId', 'You cannot delegate to yourself.');
  else if (!(await User.exists({ _id: to, organizationId: org, type: 'staff' }))) errors.add('toUserId', 'Unknown person.');
  if (!isDate(startDate)) errors.add('startDate', 'Use the format YYYY-MM-DD.');
  if (!isDate(endDate)) errors.add('endDate', 'Use the format YYYY-MM-DD.');
  else if (isDate(startDate) && endDate < startDate) errors.add('endDate', 'The end cannot be before the start.');
  errors.throwIfAny();
  const d = await Delegation.create({ organizationId: org, fromUserId: req.auth!.userId, toUserId: to, startDate, endDate });
  await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'workflow.delegation.created', entityType: 'Delegation', entityId: String(d._id), after: { toUserId: String(to), startDate, endDate }, ip: req.ip });
  res.status(201).json({ data: await delegationDto(d) });
}));

workflowRouter.delete('/workflow/delegations/:id', wrap(async (req, res) => {
  const id = idOf(req.params.id);
  const gone = id && (await Delegation.findOneAndDelete({ _id: id, organizationId: orgOf(req), fromUserId: req.auth!.userId }).lean());
  if (!gone) throw notFound();
  await appendAudit({ organizationId: orgOf(req), actorId: req.auth!.userId, action: 'workflow.delegation.ended', entityType: 'Delegation', entityId: String(id), before: { toUserId: String(gone.toUserId), startDate: gone.startDate, endDate: gone.endDate }, ip: req.ip });
  res.status(204).end();
}));

// ---- notifications --------------------------------------------------------------------------------------------------------------
workflowRouter.get('/notifications', wrap(async (req, res) => {
  const filter: Record<string, unknown> = { organizationId: orgOf(req), userId: req.auth!.userId };
  if (req.query.unread === '1') filter.readAt = null;
  const rows = await Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(50).lean();
  res.json({ data: rows.map((n) => ({ id: String(n._id), kind: n.kind, title: n.title, body: n.body ?? null, link: n.link ?? null, readAt: n.readAt ?? null, createdAt: n.createdAt })) });
}));

workflowRouter.post('/notifications/:id/read', wrap(async (req, res) => {
  const id = idOf(req.params.id);
  const n = id && (await Notification.findOneAndUpdate({ _id: id, organizationId: orgOf(req), userId: req.auth!.userId }, { $set: { readAt: new Date() } }, { new: true }).lean());
  if (!n) throw notFound();
  res.json({ data: { id: String(n._id), readAt: n.readAt } });
}));

