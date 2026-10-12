import { StoredTask, seedTasks } from './mock-tasks-data';
import { Task, TASK_PRIORITIES, TASK_STATUSES } from '../../features/workflows/workflows.models';
import { mockToday } from './mock-clock';
import { MockClients } from './mock-clients';
import { Rules, validate } from './mock-clients-rules';
import { MockModule, MockRequest, MockResult, clean, fail, invalid, need, ok, pageQuery, paged } from './mock-types';
import { DEMO_USERS, DemoUser } from './mock-users';

const OPEN = ['todo', 'in_progress', 'blocked'];
const RANK = { low: 0, normal: 1, high: 2, urgent: 3 };
const SORTABLE = ['dueDate', 'priority', 'title', 'status', 'assigneeName'] as const;
const FIELDS: Rules = {
  title: { kind: 'text', required: true },
  description: { kind: 'text' },
  clientId: { kind: 'text' },
  priority: { kind: TASK_PRIORITIES, required: true },
  dueDate: { kind: 'date', required: true },
  status: { kind: TASK_STATUSES },
  dependsOnTaskIds: { kind: 'ids' },
};
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const nameOf = (id: string): string => DEMO_USERS.find((u) => u.profile.id === id)?.profile.name ?? id;
const isStaff = (id: unknown): boolean => DEMO_USERS.some((u) => u.profile.id === id && u.profile.type === 'staff');

/** In-memory task service. The dependency rule and scoping are enforced here, as the server must. */
export class MockTasks implements MockModule {
  private readonly tasks = seedTasks();
  private seq = 100;

  constructor(private readonly clients: MockClients) {}

  /** Tasks the user may see: client tasks follow client assignment, general tasks belong to their assignee, creator and office-wide staff. */
  visibleTasks(user: DemoUser): StoredTask[] {
    return this.tasks.filter((t) => this.visible(t, user));
  }

  private visible(t: StoredTask, user: DemoUser): boolean {
    if (t.clientId) return !!this.clients.find(t.clientId, user);
    return !!user.officeWide || t.assigneeId === user.profile.id || t.createdBy === user.profile.id;
  }

  handle(req: MockRequest, user: DemoUser): MockResult {
    if (user.profile.type !== 'staff') return fail(403, 'forbidden');
    const [, id, sub] = req.path.split('/');
    if (!id) {
      if (req.method === 'GET') return need(user, 'tasks.view') ?? this.list(req.query, user);
      return req.method === 'POST' ? (need(user, 'tasks.manage') ?? this.create(req.body, user)) : fail(405, 'notFound');
    }
    const denied = need(user, req.method === 'GET' ? 'tasks.view' : 'tasks.manage');
    if (denied) return denied;
    const task = this.tasks.find((t) => t.id === id);
    if (!task || !this.visible(task, user)) return fail(404, 'notFound');
    if (!sub && req.method === 'GET') return ok({ data: this.dto(task) });
    if (!sub && req.method === 'PATCH') return this.update(task, req.body, user);
    if (sub === 'comments' && req.method === 'POST') return this.comment(task, req.body, user);
    if (sub === 'reassign' && req.method === 'POST') return this.reassign(task, req.body, user);
    return fail(404, 'notFound');
  }

  private overdue(t: StoredTask): boolean {
    return OPEN.includes(t.status) && t.dueDate < mockToday();
  }

  private dto(t: StoredTask): Task {
    const { createdBy: _createdBy, ...rest } = t;
    return structuredClone({
      ...rest,
      ...(t.clientId ? { clientName: this.clients.clientName(t.clientId) } : {}),
      assigneeName: nameOf(t.assigneeId),
      overdue: this.overdue(t),
    });
  }

  private list(q: URLSearchParams, user: DemoUser): MockResult {
    const p = pageQuery(q);
    const term = (q.get('q') ?? '').trim().toLowerCase();
    const status = q.get('status');
    const sort = (SORTABLE as readonly string[]).includes(q.get('sort') ?? '') ? (q.get('sort') as (typeof SORTABLE)[number]) : 'dueDate';
    const key = (t: Task): string | number => (sort === 'priority' ? RANK[t.priority] : t[sort]);
    const rows = this.visibleTasks(user)
      .map((t) => this.dto(t))
      .filter((t) => q.get('mine') !== 'true' || t.assigneeId === user.profile.id)
      .filter((t) => !q.get('clientId') || t.clientId === q.get('clientId'))
      .filter((t) => !status || (status === 'open' ? OPEN.includes(t.status) : t.status === status))
      .filter((t) => !q.get('priority') || t.priority === q.get('priority'))
      .filter((t) => q.get('overdue') !== 'true' || t.overdue)
      .filter((t) => !term || [t.title, t.description, t.clientName].some((v) => v?.toLowerCase().includes(term)))
      .sort((a, b) => {
        const x = key(a);
        const y = key(b);
        return p.dir * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) || a.id.localeCompare(b.id);
      });
    return paged(rows, p);
  }

  private create(body: Record<string, unknown>, user: DemoUser): MockResult {
    const errors = validate(body, FIELDS, false);
    if (!isStaff(body['assigneeId'])) errors['assigneeId'] = ['invalidChoice'];
    const clientId = text(body['clientId']);
    if (clientId && !this.clients.find(clientId, user)) return fail(404, 'notFound');
    const draft = { id: `t-${++this.seq}`, dependsOnTaskIds: (body['dependsOnTaskIds'] as string[] | undefined) ?? [] };
    Object.assign(errors, this.dependencyErrors(draft.id, draft.dependsOnTaskIds, user));
    if (Object.keys(errors).length) return invalid(errors);
    const task: StoredTask = clean({
      id: draft.id,
      title: text(body['title']),
      description: text(body['description']) || undefined,
      clientId: clientId || undefined,
      assigneeId: body['assigneeId'] as string,
      priority: body['priority'] as StoredTask['priority'],
      dueDate: text(body['dueDate']),
      status: 'todo' as const,
      dependsOnTaskIds: draft.dependsOnTaskIds,
      comments: [],
      history: [{ actor: user.profile.name, action: 'created' as const, at: new Date().toISOString() }],
      createdBy: user.profile.id,
    });
    this.tasks.push(task);
    return ok({ data: this.dto(task) }, 201);
  }

  private dependencyErrors(taskId: string, deps: string[], user: DemoUser): Record<string, Array<'dependencyInvalid'>> {
    const known = (id: string) => this.tasks.find((t) => t.id === id && this.visible(t, user));
    const reaches = (from: string, seen = new Set<string>()): boolean => {
      if (from === taskId) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      return (this.tasks.find((t) => t.id === from)?.dependsOnTaskIds ?? []).some((d) => reaches(d, seen));
    };
    return deps.some((d) => d === taskId || !known(d) || reaches(d)) ? { dependsOnTaskIds: ['dependencyInvalid'] } : {};
  }

  private update(task: StoredTask, body: Record<string, unknown>, user: DemoUser): MockResult {
    const errors = validate(body, FIELDS, true);
    const clientId = 'clientId' in body ? text(body['clientId']) : task.clientId;
    if (clientId && clientId !== task.clientId && !this.clients.find(clientId, user)) return fail(404, 'notFound');
    const deps = Array.isArray(body['dependsOnTaskIds']) ? (body['dependsOnTaskIds'] as string[]) : task.dependsOnTaskIds;
    if ('dependsOnTaskIds' in body) Object.assign(errors, this.dependencyErrors(task.id, deps, user));
    const status = (body['status'] as StoredTask['status'] | undefined) ?? task.status;
    if (status === 'done' && !errors['status'] && deps.some((d) => this.tasks.find((t) => t.id === d)?.status !== 'done')) errors['status'] = ['dependencyOpen'];
    if (Object.keys(errors).length) return invalid(errors);
    const at = new Date().toISOString();
    if (status !== task.status) task.history.push({ actor: user.profile.name, action: 'status_changed', from: task.status, to: status, at });
    const others = ['title', 'description', 'priority', 'dueDate', 'dependsOnTaskIds'].filter((f) => f in body && JSON.stringify(body[f]) !== JSON.stringify(task[f as keyof StoredTask]));
    if (others.length || clientId !== task.clientId) task.history.push({ actor: user.profile.name, action: 'updated', at });
    for (const f of ['title', 'priority', 'dueDate'] as const) if (f in body) Object.assign(task, { [f]: typeof body[f] === 'string' ? text(body[f]) : body[f] });
    if ('description' in body) task.description = text(body['description']) || undefined;
    task.clientId = clientId || undefined;
    task.dependsOnTaskIds = deps;
    task.status = status;
    for (const k of Object.keys(task) as (keyof StoredTask)[]) if (task[k] === undefined) delete task[k];
    return ok({ data: this.dto(task) });
  }

  private comment(task: StoredTask, body: Record<string, unknown>, user: DemoUser): MockResult {
    const text_ = text(body['body']);
    if (!text_) return invalid({ body: ['required'] });
    const at = new Date().toISOString();
    task.comments.push({ id: `tc-${++this.seq}`, author: user.profile.name, body: text_, at });
    task.history.push({ actor: user.profile.name, action: 'commented', at });
    return ok({ data: this.dto(task) }, 201);
  }

  private reassign(task: StoredTask, body: Record<string, unknown>, user: DemoUser): MockResult {
    const reason = text(body['reason']);
    const errors: Record<string, Array<'required' | 'invalidChoice'>> = {};
    if (!reason) errors['reason'] = ['required'];
    if (!isStaff(body['assigneeId'])) errors['assigneeId'] = ['invalidChoice'];
    if (Object.keys(errors).length) return invalid(errors);
    const to = body['assigneeId'] as string;
    task.history.push({ actor: user.profile.name, action: 'reassigned', from: nameOf(task.assigneeId), to: nameOf(to), reason, at: new Date().toISOString() });
    task.assigneeId = to;
    return ok({ data: this.dto(task) });
  }
}
