import { isLegalTransition } from '../../features/clients/client-status';
import { Client, ClientChangeEvent, ClientStatus, Page } from '../../features/clients/client.models';
import { CLIENT_RULES, SUB_RULES, pick, validate } from './mock-clients-rules';
import { ClientStore, seedClientStore } from './mock-clients-data';
import { DEMO_USERS, DemoUser } from './mock-users';
import { MockModule, MockRequest as MockClientRequest, MockResult, clean, fail, invalid, need } from './mock-types';


const CRITICAL = ['legalName', 'taxRegistrationNo', 'commercialRegistrationNo', 'status', 'legalForm', 'assignedAccountantIds'] as const;
const SORTABLE = ['legalName', 'status', 'legalForm', 'createdAt', 'updatedAt'] as const;
const SUB = ['contacts', 'branches', 'bank-accounts', 'agreements', 'notes'] as const;
type Sub = (typeof SUB)[number];

const show = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : v === undefined || v === null ? '' : String(v));

/**
 * In-memory implementation of the client-management API contracts. Permissions and client-assignment scoping
 * are enforced here exactly as the server must: the UI only hides controls for convenience.
 */
export class MockClients implements MockModule {
  private readonly store: ClientStore = seedClientStore();
  private seq = 1000;

  handle(req: MockClientRequest, user: DemoUser): MockResult {
    if (user.profile.type !== 'staff') return fail(403, 'forbidden');
    const parts = req.path.split('/');
    if (parts[0] === 'assignable-users' && req.method === 'GET') {
      // Task assignment needs the staff list too, so tasks.view is enough.
      return (user.profile.permissions.includes('tasks.view') ? null : this.need(user, 'clients.view')) ?? this.assignable();
    }
    if (parts[0] !== 'clients') return fail(404, 'notFound');
    const [, id, sub, subId] = parts;
    if (!id) return this.collection(req, user);
    const client = this.store.clients.find((c) => c.id === id);
    if (!client || !this.visible(client, user)) return this.need(user, 'clients.view') ?? fail(404, 'notFound');
    if (!sub) return this.item(req, user, client);
    if (sub === 'archive' && req.method === 'POST') return this.archive(req, user, client);
    if (sub === 'history' && req.method === 'GET') {
      return this.need(user, 'clients.view') ?? { status: 200, body: { data: this.store.history.filter((h) => h.clientId === id).reverse() } };
    }
    if ((SUB as readonly string[]).includes(sub)) return this.subResource(req, user, client, sub as Sub, subId);
    return fail(404, 'notFound');
  }

  private need = need;

  /** The client when it exists and the user may see it (office-wide or assigned); otherwise undefined, so callers answer 404. */
  find(id: string, user: DemoUser): Client | undefined {
    const client = this.store.clients.find((c) => c.id === id);
    return client && this.visible(client, user) ? client : undefined;
  }

  /** Moves the client along the existing status rules and records the change in its history. False when the move is illegal. */
  applyStatus(client: Client, to: ClientStatus, user: DemoUser): boolean {
    if (!isLegalTransition(client.status, to)) return false;
    const events = this.diff(client, { status: to }, user);
    client.status = to;
    client.updatedAt = new Date().toISOString();
    this.store.history.push(...events);
    return true;
  }

  /** Ids of the accountants assigned to a client (empty when nobody is). */
  accountantsOf(id: string): string[] {
    return [...(this.store.clients.find((c) => c.id === id)?.assignedAccountantIds ?? [])];
  }

  /** Legal name for lists that show the client next to a document, task or approval. */
  clientName(id: string): string {
    return this.store.clients.find((c) => c.id === id)?.legalName ?? '';
  }

  private visible(client: Client, user: DemoUser): boolean {
    return !!user.officeWide || client.assignedAccountantIds.includes(user.profile.id);
  }

  private assignable(): MockResult {
    const data = DEMO_USERS.filter((u) => u.profile.type === 'staff').map((u) => ({ id: u.profile.id, name: u.profile.name }));
    return { status: 200, body: { data } };
  }

  private collection(req: MockClientRequest, user: DemoUser): MockResult {
    if (req.method === 'GET') return this.need(user, 'clients.view') ?? this.list(req.query, user);
    if (req.method !== 'POST') return fail(405, 'notFound');
    const denied = this.need(user, 'clients.create');
    if (denied) return denied;
    const errors = validate(req.body, CLIENT_RULES, false);
    if (Object.keys(errors).length) return invalid(errors);
    const now = new Date().toISOString();
    const { status: _ignored, ...fields } = pick(req.body, CLIENT_RULES);
    const assigned = (fields['assignedAccountantIds'] as string[] | undefined) ?? [];
    const client = clean({
      ...fields,
      id: `c-${++this.seq}`,
      taxProfile: this.taxProfile(req.body),
      status: 'lead' as ClientStatus,
      // A creator without an office-wide role must stay able to see the client they just made.
      assignedAccountantIds: user.officeWide || assigned.includes(user.profile.id) ? assigned : [...assigned, user.profile.id],
      createdAt: now,
      updatedAt: now,
      archived: false,
    }) as unknown as Client;
    this.store.clients.push(client);
    return { status: 201, body: { data: client } };
  }

  private list(q: URLSearchParams, user: DemoUser): MockResult {
    const page = Math.max(1, Number(q.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q.get('pageSize')) || 10));
    const term = (q.get('q') ?? '').trim().toLowerCase();
    const status = q.get('status');
    const legalForm = q.get('legalForm');
    const sort = (SORTABLE as readonly string[]).includes(q.get('sort') ?? '') ? (q.get('sort') as keyof Client) : 'legalName';
    const dir = q.get('dir') === 'desc' ? -1 : 1;
    const withArchived = q.get('includeArchived') === 'true';
    const rows = this.store.clients
      .filter((c) => this.visible(c, user) && (withArchived || !c.archived))
      .filter((c) => !status || c.status === status)
      .filter((c) => !legalForm || c.legalForm === legalForm)
      .filter((c) => !term || [c.legalName, c.tradeName, c.taxRegistrationNo, c.commercialRegistrationNo].some((v) => v?.toLowerCase().includes(term)))
      .sort((a, b) => dir * String(a[sort]).localeCompare(String(b[sort])) || a.id.localeCompare(b.id));
    const body: Page<Client> = {
      data: rows.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, pageSize, total: rows.length },
    };
    return { status: 200, body };
  }

  private item(req: MockClientRequest, user: DemoUser, client: Client): MockResult {
    if (req.method === 'GET') return this.need(user, 'clients.view') ?? { status: 200, body: { data: client } };
    if (req.method !== 'PUT' && req.method !== 'PATCH') return fail(405, 'notFound');
    const denied = this.need(user, 'clients.update');
    if (denied) return denied;
    const errors = validate(req.body, CLIENT_RULES, req.method === 'PATCH');
    if (!errors['status'] && typeof req.body['status'] === 'string' && req.body['status'] !== client.status && !isLegalTransition(client.status, req.body['status'] as ClientStatus)) {
      errors['status'] = ['invalidTransition'];
    }
    if (Object.keys(errors).length) return invalid(errors);
    const changes = pick(req.body, CLIENT_RULES);
    if ('taxProfile' in req.body) Object.assign(changes, { taxProfile: this.taxProfile(req.body) });
    const events = this.diff(client, changes, user);
    Object.assign(client, changes, { updatedAt: new Date().toISOString() });
    for (const k of Object.keys(client) as (keyof Client)[]) if (client[k] === undefined) delete client[k];
    this.store.history.push(...events);
    return { status: 200, body: { data: client } };
  }

  private taxProfile(body: Record<string, unknown>): Client['taxProfile'] {
    const t = body['taxProfile'] as { vatRegistered?: unknown; taxType?: unknown } | undefined;
    return t && typeof t.vatRegistered === 'boolean' ? { vatRegistered: t.vatRegistered, taxType: String(t.taxType ?? '').trim() } : undefined;
  }

  private diff(client: Client, changes: Record<string, unknown>, user: DemoUser): ClientChangeEvent[] {
    const at = new Date().toISOString();
    return CRITICAL.filter((f) => f in changes && show(changes[f]) !== show(client[f])).map((field) => ({
      id: `h-${++this.seq}`,
      clientId: client.id,
      field,
      oldValue: show(client[field]),
      newValue: show(changes[field]),
      changedBy: user.profile.name,
      changedAt: at,
    }));
  }

  private archive(req: MockClientRequest, user: DemoUser, client: Client): MockResult {
    const denied = this.need(user, 'clients.archive');
    if (denied) return denied;
    client.archived = req.body['archived'] !== false;
    client.updatedAt = new Date().toISOString();
    return { status: 200, body: { data: client } };
  }

  private subResource(req: MockClientRequest, user: DemoUser, client: Client, sub: Sub, subId?: string): MockResult {
    const rows = this.store[sub] as unknown as Array<{ id: string; clientId: string } & Record<string, unknown>>;
    const mine = rows.filter((r) => r.clientId === client.id);
    if (req.method === 'GET' && !subId) return this.need(user, 'clients.view') ?? { status: 200, body: { data: mine } };
    const denied = this.need(user, 'clients.update');
    if (denied) return denied;
    if (req.method === 'POST' && !subId) {
      const errors = validate(req.body, SUB_RULES[sub], false);
      if (Object.keys(errors).length) return invalid(errors);
      const now = new Date().toISOString();
      const extra = sub === 'notes' ? { createdBy: user.profile.name, createdAt: now } : {};
      const defaults = sub === 'bank-accounts' ? { currency: 'EGP' } : sub === 'contacts' ? { isAuthorizedRepresentative: false } : {};
      const row = clean({ ...defaults, ...pick(req.body, SUB_RULES[sub]), ...extra, id: `${sub.slice(0, 2)}-${++this.seq}`, clientId: client.id });
      rows.push(row);
      return { status: 201, body: { data: row } };
    }
    const row = mine.find((r) => r.id === subId);
    if (!row) return fail(404, 'notFound');
    if (req.method === 'DELETE') {
      rows.splice(rows.indexOf(row), 1);
      return { status: 204 };
    }
    if (req.method === 'PUT') {
      const errors = validate(req.body, SUB_RULES[sub], false);
      if (Object.keys(errors).length) return invalid(errors);
      Object.assign(row, pick(req.body, SUB_RULES[sub]));
      for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
      return { status: 200, body: { data: row } };
    }
    return fail(405, 'notFound');
  }
}
