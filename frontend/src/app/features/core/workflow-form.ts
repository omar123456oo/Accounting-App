import { Condition, Op, Transition, WorkflowDefinition, WorkflowState } from './workflow.models';

/** A condition as the editor shows it: the value is one text box. */
export interface ConditionRow { field: string; op: Op; valueText: string }

const numeric = (s: string): boolean => s.trim() !== '' && Number.isFinite(Number(s));

/** Reads the text box according to the operator: numbers for comparisons, a list for "in", true/false and numbers where they look like it. */
export function parseValue(op: Op, text: string): unknown {
  const t = text.trim();
  if (op === 'in') return t.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (numeric(x) ? Number(x) : x));
  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') return t === '' ? NaN : Number(t);
  if (t === 'true') return true;
  if (t === 'false') return false;
  return numeric(t) ? Number(t) : t;
}

export const valueToText = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : v === undefined || v === null ? '' : String(v));
export const conditionToRow = (c: Condition): ConditionRow => ({ field: c.field, op: c.op, valueText: valueToText(c.value) });
export const conditionFromRow = (r: ConditionRow): Condition => ({ field: r.field, op: r.op, value: parseValue(r.op, r.valueText) });

export const emptyDefinition = (name: string): WorkflowDefinition => ({
  name, active: true, initialState: 'draft', states: [{ name: 'draft', label: 'Draft', editable: true }], transitions: [], escalations: [],
});

export function newState(existing: readonly WorkflowState[]): WorkflowState {
  const used = new Set(existing.map((s) => s.name));
  let i = 1;
  while (used.has(`state_${i}`)) i++;
  return { name: `state_${i}`, label: '', editable: false };
}

export const newTransition = (stateNames: readonly string[]): EditorTransition => ({
  from: stateNames[0] ?? '', to: stateNames[1] ?? stateNames[0] ?? '', action: '', label: '',
  allowedRoles: [], allowedUsers: [], approvals: 1, requireComment: false, preventSelfApproval: false, conditions: [],
});

/** A transition as the editor holds it: conditions are text rows. */
export type EditorTransition = Omit<Transition, 'conditions'> & { conditions: ConditionRow[] };
export type EditorDefinition = Omit<WorkflowDefinition, 'transitions'> & { transitions: EditorTransition[] };

export const toEditor = (d: WorkflowDefinition): EditorDefinition => ({ ...d, transitions: d.transitions.map((t) => ({ ...t, conditions: t.conditions.map(conditionToRow) })) });
export const fromEditor = (d: EditorDefinition): WorkflowDefinition => ({ ...d, transitions: d.transitions.map((t) => ({ ...t, conditions: t.conditions.map(conditionFromRow) })) });
