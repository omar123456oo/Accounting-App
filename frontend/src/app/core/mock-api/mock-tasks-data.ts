import { Task } from '../../features/workflows/workflows.models';
import { addDays, DEMO_TODAY } from './mock-clock';

/** Stored shape: the server derives names and the overdue flag when it answers. */
export type StoredTask = Omit<Task, 'clientName' | 'assigneeName' | 'overdue'> & { createdBy: string };

const day = (offset: number) => addDays(DEMO_TODAY, offset);
const created = [{ actor: 'Demo Owner', action: 'created' as const, at: '2026-10-01T08:00:00.000Z' }];

function task(id: string, title: string, assigneeId: string, priority: StoredTask['priority'], dueOffset: number, status: StoredTask['status'], extra: Partial<StoredTask> = {}): StoredTask {
  return { id, title, assigneeId, priority, dueDate: day(dueOffset), status, dependsOnTaskIds: [], comments: [], history: [...created], createdBy: 'u-owner', ...extra };
}

/** DEMO ONLY. Fictional tasks; due dates are relative to the mock's fixed "today". */
export function seedTasks(): StoredTask[] {
  return [
    task('t-001', 'DEMO Prepare the September VAT return', 'u-accountant', 'high', -2, 'todo', { clientId: 'c-001', dependsOnTaskIds: ['t-002'] }),
    task('t-002', 'DEMO Collect the bank statements', 'u-accountant', 'normal', 3, 'in_progress', { clientId: 'c-001', description: 'DEMO: ask the client for the September statements.' }),
    task('t-003', 'DEMO Review the payroll register', 'u-chief', 'urgent', -1, 'blocked', { clientId: 'c-002' }),
    task('t-004', 'DEMO Archive the 2025 working files', 'u-owner', 'low', 20, 'todo'),
    task('t-005', 'DEMO Close the old client file', 'u-owner', 'normal', -10, 'done', { clientId: 'c-008' }),
    task('t-006', 'DEMO Follow up with Delta Farms', 'u-accountant', 'normal', 7, 'todo', { clientId: 'c-003' }),
    task('t-007', 'DEMO Follow up on open bills', 'u-owner', 'high', 2, 'todo', { clientId: 'c-009' }),
  ];
}
