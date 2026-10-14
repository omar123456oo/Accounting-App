import { isValidFieldname } from './fields.js';

export const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in'] as const;
export type Op = (typeof OPS)[number];

export interface Condition { field: string; op: Op; value: unknown }
export interface WorkflowState { name: string; label: string; editable: boolean }
export interface Transition {
  from: string;
  to: string;
  action: string;
  label: string;
  allowedRoles: string[];
  allowedUsers: string[];
  /** Distinct people who must approve before the record moves (parallel approval). */
  approvals: number;
  requireComment: boolean;
  /** The person who created the record cannot perform this action (also not through a delegation). */
  preventSelfApproval: boolean;
  /** All must hold for the transition to be offered. */
  conditions: Condition[];
}
export interface Escalation { state: string; afterHours: number; notifyRoles: string[]; notifyUsers: string[]; remindApprovers: boolean }
export interface WorkflowDef { states: WorkflowState[]; initialState: string; transitions: Transition[]; escalations: Escalation[] }

export const MAX_APPROVALS = 10;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Controlled comparison of record data: no expressions, no code. A missing or non-numeric value never satisfies <, <=, > or >=. */
export function conditionsHold(conditions: readonly Condition[], data: Record<string, unknown>): boolean {
  return conditions.every(({ field, op, value }) => {
    const v = data[field];
    switch (op) {
      case 'eq': return v === value;
      case 'ne': return v !== value;
      case 'in': return Array.isArray(value) && value.includes(v);
      case 'gt': return isNum(v) && isNum(value) && v > value;
      case 'gte': return isNum(v) && isNum(value) && v >= value;
      case 'lt': return isNum(v) && isNum(value) && v < value;
      case 'lte': return isNum(v) && isNum(value) && v <= value;
      default: return false;
    }
  });
}

/** Problems with a definition, keyed by the part of the request they belong to. Empty object when valid. */
export function validateDefinition(def: WorkflowDef, fieldNames: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (k: string, m: string) => { (out[k] ??= []).push(m); };
  const names = new Set<string>();
  if (!def.states.length) add('states', 'Add at least one state.');
  for (const s of def.states) {
    if (!isValidFieldname(s.name)) add('states', `State name "${s.name}" must be lowercase letters, digits and underscores, starting with a letter.`);
    else if (names.has(s.name)) add('states', `Duplicate state "${s.name}".`);
    names.add(s.name);
    if (!s.label.trim()) add('states', `State "${s.name}" needs a label.`);
  }
  if (!names.has(def.initialState)) add('initialState', 'The initial state must be one of the states.');
  const seen = new Set<string>();
  def.transitions.forEach((t, i) => {
    const at = `Transition ${i + 1} (${t.action || '?'})`;
    if (!isValidFieldname(t.action)) add('transitions', `${at}: action must be lowercase letters, digits and underscores, starting with a letter.`);
    if (!t.label.trim()) add('transitions', `${at}: label is required.`);
    if (!names.has(t.from) || !names.has(t.to)) add('transitions', `${at}: unknown state.`);
    if (!t.allowedRoles.length && !t.allowedUsers.length) add('transitions', `${at}: name at least one approver (a role or a user).`);
    if (!Number.isInteger(t.approvals) || t.approvals < 1 || t.approvals > MAX_APPROVALS) add('transitions', `${at}: approvals must be a whole number from 1 to ${MAX_APPROVALS}.`);
    for (const cnd of t.conditions) {
      if (!fieldNames.includes(cnd.field)) add('transitions', `${at}: unknown field "${cnd.field}" in a condition.`);
      if (!(OPS as readonly string[]).includes(cnd.op)) add('transitions', `${at}: unknown operator "${cnd.op}".`);
      else if (cnd.op === 'in' && !Array.isArray(cnd.value)) add('transitions', `${at}: "in" needs a list of values.`);
    }
    const key = JSON.stringify([t.from, t.action, t.conditions]);
    if (seen.has(key)) add('transitions', `${at}: the same transition is defined twice.`);
    seen.add(key);
  });
  def.escalations.forEach((e, i) => {
    const at = `Escalation ${i + 1}`;
    if (!names.has(e.state)) add('escalations', `${at}: unknown state.`);
    if (!Number.isFinite(e.afterHours) || e.afterHours < 1 || e.afterHours > 24 * 90) add('escalations', `${at}: afterHours must be between 1 and 2160.`);
    if (!e.notifyRoles.length && !e.notifyUsers.length) add('escalations', `${at}: name who to notify.`);
  });
  return out;
}
