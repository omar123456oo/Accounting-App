import type { Request } from 'express';
import { Types } from 'mongoose';
import { User } from '../models/index.js';
import { HttpError, orgOf, todayIso } from '../hr/common.js';
import { DocRecord } from './models.js';
import { conditionsHold, type Transition, type WorkflowDef } from './workflow-rules.js';
import { Delegation, Notification, Workflow } from './workflow.models.js';

export interface Identity { userId: string; name: string; roles: string[] }
/** The caller, plus whoever has delegated to them today. */
export interface Actor { self: Identity; delegators: Identity[] }
export interface ActiveWorkflow extends WorkflowDef { name: string }

/** The fields of a record the rules need. */
export interface RecordLike {
  _id?: unknown; name: string; data?: unknown; createdBy?: unknown; workflowState?: string | null; stateEnteredAt?: Date | null;
  approvals?: Array<{ transition?: string | null; userId?: unknown }>; history?: Array<Record<string, any>>;
}

const idStr = (v: unknown): string => String(v);
export const recordLink = (doctype: string, name: string): string => `/app/records/${doctype}/${encodeURIComponent(name)}`;
const dataOf = (r: RecordLike): Record<string, unknown> => ((r.data ?? {}) as Record<string, unknown>);
export const stateOf = (wf: WorkflowDef, r: RecordLike): string => r.workflowState || wf.initialState;
const keyOf = (t: Pick<Transition, 'from' | 'action'>): string => `${t.from}>${t.action}`;

export async function activeWorkflow(org: Types.ObjectId, doctype: string): Promise<ActiveWorkflow | null> {
  const w = await Workflow.findOne({ organizationId: org, doctype, active: true }).lean();
  return w ? (w as unknown as ActiveWorkflow) : null;
}

/** Who is acting: the caller's roles, and the roles of anyone whose delegation to the caller is in force today. */
export async function loadActor(req: Request): Promise<Actor> {
  const org = orgOf(req);
  const me = await User.findOne({ _id: req.auth!.userId, organizationId: org }).select('name roles').lean();
  const self: Identity = { userId: idStr(req.auth!.userId), name: me?.name ?? req.auth!.name, roles: me?.roles ?? [] };
  const today = todayIso();
  const given = await Delegation.find({ organizationId: org, toUserId: req.auth!.userId, startDate: { $lte: today }, endDate: { $gte: today } }).lean();
  const users = given.length ? await User.find({ _id: { $in: given.map((d) => d.fromUserId) }, organizationId: org }).select('name roles').lean() : [];
  return { self, delegators: users.map((u) => ({ userId: idStr(u._id), name: u.name, roles: u.roles })) };
}

const qualifies = (t: Transition, id: Identity, creator: string | undefined): boolean =>
  (t.allowedUsers.includes(id.userId) || t.allowedRoles.some((r) => id.roles.includes(r))) && !(t.preventSelfApproval && creator && id.userId === creator);

/** The first identity (the caller before delegators) allowed to perform `t` on a record created by `creator`. */
export function qualifier(t: Transition, actor: Actor, creator: string | undefined): Identity | null {
  return [actor.self, ...actor.delegators].find((id) => qualifies(t, id, creator)) ?? null;
}

/** Transitions out of the record's current state whose conditions hold now (before checking who is asking). */
export const candidates = (wf: WorkflowDef, r: RecordLike): Transition[] =>
  wf.transitions.filter((t) => t.from === stateOf(wf, r) && conditionsHold(t.conditions, dataOf(r)));

/** What the caller may do now, one entry per action. A person who already gave their approval is not offered it again. */
export function actionsFor(wf: WorkflowDef, r: RecordLike, actor: Actor): Array<{ action: string; label: string; requireComment: boolean }> {
  const creator = r.createdBy ? idStr(r.createdBy) : undefined;
  const out = new Map<string, { action: string; label: string; requireComment: boolean }>();
  for (const t of candidates(wf, r)) {
    if (out.has(t.action) || !qualifier(t, actor, creator)) continue;
    if (t.approvals > 1 && (r.approvals ?? []).some((a) => a.transition === keyOf(t) && idStr(a.userId) === actor.self.userId)) continue;
    out.set(t.action, { action: t.action, label: t.label, requireComment: t.requireComment });
  }
  return [...out.values()];
}

export function alreadyApproved(r: RecordLike, t: Transition, userId: string): boolean {
  return (r.approvals ?? []).some((a) => a.transition === keyOf(t) && idStr(a.userId) === userId);
}
export const approvalKey = keyOf;

/** Everything the screen needs about a record's workflow, worked out for the caller. */
export function workflowBlock(wf: ActiveWorkflow, r: RecordLike, actor: Actor) {
  const state = wf.states.find((s) => s.name === stateOf(wf, r));
  return {
    state: stateOf(wf, r),
    stateLabel: state?.label ?? stateOf(wf, r),
    editable: !!state?.editable,
    actions: actionsFor(wf, r, actor),
    history: (r.history ?? []).map((h) => ({ at: h.at, actor: h.actorId ? idStr(h.actorId) : null, actorName: h.actorName ?? null, action: h.action, from: h.from ?? null, to: h.to ?? null, comment: h.comment ?? null, onBehalfOf: h.onBehalfOf ?? null })),
  };
}

/** A record in a locked state cannot be edited or deleted. Types without an active workflow are never locked. */
export function assertEditable(wf: ActiveWorkflow | null, r: RecordLike): void {
  if (!wf) return;
  const state = wf.states.find((s) => s.name === stateOf(wf, r));
  if (!state?.editable) throw new HttpError(409, `This record is in "${state?.label ?? stateOf(wf, r)}" and cannot be changed.`);
}

/** User ids who can act on the record in `state` (roles are resolved to people). */
export async function approversOf(org: Types.ObjectId, wf: WorkflowDef, state: string, r: RecordLike): Promise<Set<string>> {
  const roles = new Set<string>(); const users = new Set<string>();
  for (const t of wf.transitions.filter((x) => x.from === state && conditionsHold(x.conditions, dataOf(r)))) { t.allowedRoles.forEach((x) => roles.add(x)); t.allowedUsers.forEach((x) => users.add(x)); }
  const byRole = roles.size ? await User.find({ organizationId: org, type: 'staff', roles: { $in: [...roles] } }).select('_id').lean() : [];
  byRole.forEach((u) => users.add(idStr(u._id)));
  return users;
}

export async function notify(org: Types.ObjectId, userIds: Iterable<string>, n: { kind: 'workflow' | 'escalation'; title: string; body?: string; link: string }): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length) await Notification.insertMany(unique.map((u) => ({ organizationId: org, userId: new Types.ObjectId(u), ...n })));
}

/**
 * Raises the escalation rules: a record that has sat in a state for longer than the rule allows is reported once per time
 * it entered that state. Meant to be called on a schedule (see scripts/workflow-escalate.ts). Returns how many records escalated.
 */
export async function runEscalations(now: Date = new Date()): Promise<number> {
  let count = 0;
  for (const wf of await Workflow.find({ active: true, 'escalations.0': { $exists: true } }).lean()) {
    const org = wf.organizationId as Types.ObjectId;
    for (const rule of wf.escalations) {
      const cutoff = new Date(now.getTime() - rule.afterHours * 3_600_000);
      const inState = rule.state === wf.initialState ? [{ workflowState: rule.state }, { workflowState: null }] : [{ workflowState: rule.state }];
      const due = await DocRecord.find({ organizationId: org, doctype: wf.doctype, $or: inState, stateEnteredAt: { $lte: cutoff }, escalatedAt: null }).lean();
      for (const r of due) {
        const claimed = await DocRecord.findOneAndUpdate(
          { _id: r._id, escalatedAt: null, stateEnteredAt: r.stateEnteredAt },
          { $set: { escalatedAt: now }, $push: { history: { at: now, actorName: 'system', action: 'escalated', from: rule.state, to: rule.state } } },
        );
        if (!claimed) continue; // another run got there first
        const people = new Set<string>(rule.notifyUsers);
        const byRole = rule.notifyRoles.length ? await User.find({ organizationId: org, type: 'staff', roles: { $in: rule.notifyRoles } }).select('_id').lean() : [];
        byRole.forEach((u) => people.add(idStr(u._id)));
        if (rule.remindApprovers) (await approversOf(org, wf as unknown as WorkflowDef, rule.state, r)).forEach((u) => people.add(u));
        await notify(org, people, { kind: 'escalation', title: `${wf.doctype} ${r.name} has waited ${rule.afterHours}h in "${rule.state}"`, link: recordLink(wf.doctype, r.name) });
        count++;
      }
    }
  }
  return count;
}
