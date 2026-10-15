import { WorkflowDefinition } from './workflow.models';
import { ConditionRow, conditionFromRow, fromEditor, toEditor, conditionToRow, emptyDefinition, newState, newTransition, parseValue } from './workflow-form';

describe('workflow form helpers', () => {
  it('reads a typed value out of the text box for each operator', () => {
    expect(parseValue('lt', '100')).toBe(100);
    expect(parseValue('gte', ' 12.5 ')).toBe(12.5);
    expect(parseValue('gt', 'abc')).toBeNaN();
    expect(parseValue('eq', 'new')).toBe('new');
    expect(parseValue('eq', '42')).toBe(42);
    expect(parseValue('ne', 'true')).toBe(true);
    expect(parseValue('eq', 'false')).toBe(false);
    expect(parseValue('in', 'a, b ,,c')).toEqual(['a', 'b', 'c']);
    expect(parseValue('in', '1,2')).toEqual([1, 2]);
  });

  it('shows a stored value as text and back without loss', () => {
    for (const c of [{ field: 'amount', op: 'lt', value: 100 }, { field: 's', op: 'in', value: ['a', 'b'] }, { field: 'x', op: 'eq', value: true }, { field: 'y', op: 'eq', value: 'new' }] as const) {
      const row: ConditionRow = conditionToRow(c);
      expect(conditionFromRow(row)).toEqual(c);
    }
  });

  it('starts a new workflow with a draft state ready to edit', () => {
    const d: WorkflowDefinition = emptyDefinition('Expense approval');
    expect(d.states).toEqual([{ name: 'draft', label: 'Draft', editable: true }]);
    expect(d.initialState).toBe('draft');
    expect(d.active).toBe(true);
    expect(d.transitions).toEqual([]);
  });

  it('makes a unique state name when adding states', () => {
    expect(newState([{ name: 'state_1', label: '', editable: false }]).name).toBe('state_2');
    expect(newState([]).name).toBe('state_1');
  });

  it('creates a transition between the first two states with one approval and no comment required', () => {
    const t = newTransition(['draft', 'review']);
    expect(t).toMatchObject({ from: 'draft', to: 'review', approvals: 1, requireComment: false, preventSelfApproval: false, allowedRoles: [], allowedUsers: [], conditions: [] });
  });

  it('round-trips a whole definition through the editor form', () => {
    const def: WorkflowDefinition = {
      name: 'W', active: false, initialState: 'draft',
      states: [{ name: 'draft', label: 'Draft', editable: true }, { name: 'review', label: 'Review', editable: false }],
      transitions: [{ from: 'draft', to: 'review', action: 'submit', label: 'Submit', allowedRoles: ['accountant'], allowedUsers: ['u1'], approvals: 2, requireComment: true, preventSelfApproval: true, conditions: [{ field: 'amount', op: 'lt', value: 100 }] }],
      escalations: [{ state: 'review', afterHours: 24, notifyRoles: ['owner'], notifyUsers: [], remindApprovers: true }],
    };
    const editor = toEditor(def);
    expect(editor.transitions[0].conditions).toEqual([{ field: 'amount', op: 'lt', valueText: '100' }]);
    expect(fromEditor(editor)).toEqual(def);
  });
});
