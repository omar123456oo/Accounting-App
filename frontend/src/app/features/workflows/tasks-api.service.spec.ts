import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { addDays, setMockToday } from '../../core/mock-api/mock-clock';
import { failure, mockHttpProviders, signInDemo } from '../../testing/test-utils';
import { TasksApiService } from './tasks-api.service';
import { TaskInput } from './workflows.models';

const NEW: TaskInput = { title: 'DEMO New task', assigneeId: 'u-accountant', priority: 'normal', dueDate: '2026-11-01', dependsOnTaskIds: [] };

describe('TasksApiService on the mock API', () => {
  let api: TasksApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: mockHttpProviders() });
    api = TestBed.inject(TasksApiService);
  });
  afterEach(() => setMockToday(null));

  const ids = async (params = {}) => (await firstValueFrom(api.list({ pageSize: 100, ...params }))).data.map((t) => t.id).sort();

  it('needs tasks.view (403) to read and tasks.manage to change', async () => {
    await signInDemo('client@demo.test');
    expect((await failure(firstValueFrom(api.list()))).status).toBe(403);
    expect((await failure(firstValueFrom(api.create(NEW)))).status).toBe(403);
  });

  it('scopes staff without an office-wide role: client tasks only for assigned clients, others only their own', async () => {
    await signInDemo('accountant@demo.test');
    const visible = await ids();
    expect(visible).toEqual(expect.arrayContaining(['t-001', 't-002', 't-006']));
    expect(visible).not.toContain('t-007');
    expect(visible).not.toContain('t-004');
    expect((await failure(firstValueFrom(api.get('t-007')))).status).toBe(404);
    expect((await failure(firstValueFrom(api.get('t-004')))).status).toBe(404);
    expect((await failure(firstValueFrom(api.create({ ...NEW, clientId: 'c-009' })))).status).toBe(404);
    await signInDemo('owner@demo.test');
    expect(await ids()).toEqual(expect.arrayContaining(['t-004', 't-007']));
  });

  it('filters my tasks, open tasks, overdue tasks and searches', async () => {
    await signInDemo('accountant@demo.test');
    expect(await ids({ mine: true })).toEqual(['t-001', 't-002', 't-006']);
    expect(await ids({ mine: true, status: 'open' })).toEqual(['t-001', 't-002', 't-006']);
    expect(await ids({ overdue: true })).toEqual(['t-001', 't-003']);
    expect(await ids({ priority: 'urgent' })).toEqual(['t-003']);
    expect(await ids({ q: 'bank' })).toEqual(['t-002']);
    expect(await ids({ clientId: 'c-002' })).toEqual(['t-003']);
  });

  it('computes overdue on the server from a business date tests can move; finished tasks are never overdue', async () => {
    await signInDemo('owner@demo.test');
    expect((await firstValueFrom(api.get('t-001'))).overdue).toBe(true);
    expect((await firstValueFrom(api.get('t-002'))).overdue).toBe(false);
    setMockToday(addDays((await firstValueFrom(api.get('t-002'))).dueDate, 1));
    expect((await firstValueFrom(api.get('t-002'))).overdue).toBe(true);
    expect((await firstValueFrom(api.get('t-005'))).overdue).toBe(false);
  });

  it('creates and edits a task, recording history, and validates fields with 422', async () => {
    await signInDemo('accountant@demo.test');
    const made = await firstValueFrom(api.create({ ...NEW, clientId: 'c-001', description: 'DEMO text' }));
    expect(made).toMatchObject({ status: 'todo', clientId: 'c-001', assigneeName: 'Demo Accountant' });
    expect(made.history[0]).toMatchObject({ action: 'created', actor: 'Demo Accountant' });
    const edited = await firstValueFrom(api.update(made.id, { priority: 'urgent', title: 'DEMO Renamed' }));
    expect(edited).toMatchObject({ priority: 'urgent', title: 'DEMO Renamed' });
    expect(edited.history.at(-1)?.action).toBe('updated');
    const bad = await failure(firstValueFrom(api.create({ ...NEW, title: '', dueDate: 'tomorrow', priority: 'x' as 'low', assigneeId: 'nobody' })));
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.error.errors)).toEqual(expect.arrayContaining(['title', 'dueDate', 'priority', 'assigneeId']));
  });

  it('refuses to finish a task while a dependency is not done (422) and allows it afterwards', async () => {
    await signInDemo('accountant@demo.test');
    const e = await failure(firstValueFrom(api.update('t-001', { status: 'done' })));
    expect(e.status).toBe(422);
    expect(e.error.errors.status).toBeTruthy();
    expect((await firstValueFrom(api.get('t-001'))).status).toBe('todo');
    await firstValueFrom(api.update('t-002', { status: 'done' }));
    const done = await firstValueFrom(api.update('t-001', { status: 'done' }));
    expect(done.status).toBe('done');
    expect(done.history.at(-1)).toMatchObject({ action: 'status_changed', from: 'todo', to: 'done' });
  });

  it('rejects dependencies on itself, unknown tasks, hidden tasks and cycles', async () => {
    await signInDemo('accountant@demo.test');
    for (const deps of [['t-002'], ['t-999'], ['t-007']]) {
      const made = await firstValueFrom(api.create(NEW));
      const attempt = deps[0] === 't-002' ? [made.id] : deps;
      const e = await failure(firstValueFrom(api.update(made.id, { dependsOnTaskIds: attempt })));
      expect(e.status).toBe(422);
      expect(e.error.errors.dependsOnTaskIds).toBeTruthy();
    }
    // t-001 depends on t-002, so t-002 may not depend on t-001.
    expect((await failure(firstValueFrom(api.update('t-002', { dependsOnTaskIds: ['t-001'] })))).status).toBe(422);
  });

  it('reassigns only with a reason and records who, to whom and why', async () => {
    await signInDemo('accountant@demo.test');
    const noReason = await failure(firstValueFrom(api.reassign('t-006', 'u-chief', ' ')));
    expect(noReason.status).toBe(422);
    expect(noReason.error.errors.reason).toBeTruthy();
    expect((await failure(firstValueFrom(api.reassign('t-006', 'ghost', 'Away')))).status).toBe(422);
    const moved = await firstValueFrom(api.reassign('t-006', 'u-chief', 'Annual leave'));
    expect(moved).toMatchObject({ assigneeId: 'u-chief', assigneeName: 'Demo Chief Accountant' });
    expect(moved.history.at(-1)).toMatchObject({ action: 'reassigned', actor: 'Demo Accountant', from: 'Demo Accountant', to: 'Demo Chief Accountant', reason: 'Annual leave' });
  });

  it('adds comments with the author and a history entry', async () => {
    await signInDemo('accountant@demo.test');
    expect((await failure(firstValueFrom(api.comment('t-002', '  ')))).status).toBe(422);
    const t = await firstValueFrom(api.comment('t-002', 'Statements received'));
    expect(t.comments.at(-1)).toMatchObject({ author: 'Demo Accountant', body: 'Statements received' });
    expect(t.history.at(-1)?.action).toBe('commented');
  });
});
