import { PermissionModule, Role, RoleInput, StaffUserRoles } from '../../features/settings/roles/roles.models';
import { MockAudit } from './mock-audit';
import { FieldErrors } from './mock-clients-rules';
import { MockModule, MockRequest, MockResult, clean, fail, invalid, need, ok } from './mock-types';
import { ALL_PERMISSIONS, DEMO_USERS, DemoUser, OWNER_PERMISSIONS, SUPER_ADMIN } from './mock-users';

const PERMISSION = 'settings.manage';
const NAME_MAX = 60;
const SUPER_ROLE = 'r-super-admin';
/** What a role editor may grant: everything except the Super Admin marker. */
const GRANTABLE = ALL_PERMISSIONS.filter((p) => p !== SUPER_ADMIN);

interface StoredRole extends Omit<Role, 'userCount'> {}

const permissionsOf = (email: string): string[] => [...(DEMO_USERS.find((u) => u.email === email)?.profile.permissions ?? [])];

/** Role Permissions Manager of the mock: roles hold permissions, staff users hold roles, a user's permissions are the union. */
export class MockRoles implements MockModule {
  private nextId = 1;
  private readonly roles: StoredRole[] = [
    { id: SUPER_ROLE, name: 'Super Admin', description: 'Full control of the whole system, always. Only a Super Admin can grant or remove it.', system: true, locked: true, permissions: [...ALL_PERMISSIONS] },
    { id: 'r-owner', name: 'Owner', description: 'Full access to every module, including settings.', system: true, locked: true, permissions: [...OWNER_PERMISSIONS] },
    { id: 'r-chief', name: 'Chief accountant', description: 'Approves, posts and closes; office-wide.', system: true, locked: false, permissions: permissionsOf('chief@demo.test') },
    { id: 'r-accountant', name: 'Accountant', description: 'Prepares entries, invoices and bills for assigned clients.', system: true, locked: false, permissions: permissionsOf('accountant@demo.test') },
    { id: 'r-tax', name: 'Tax specialist', description: 'Prepares and reviews tax and e-invoicing work.', system: true, locked: false, permissions: permissionsOf('tax@demo.test') },
    { id: 'r-auditor', name: 'Auditor', description: 'Read-only access, including the audit trail.', system: true, locked: false, permissions: permissionsOf('auditor@demo.test') },
  ];
  private readonly assignments = new Map<string, string[]>([
    ['u-superadmin', [SUPER_ROLE]],
    ['u-owner', ['r-owner']],
    ['u-mfa', ['r-owner']],
    ['u-chief', ['r-chief']],
    ['u-accountant', ['r-accountant']],
    ['u-tax', ['r-tax']],
    ['u-auditor', ['r-auditor']],
  ]);

  constructor(private readonly audit: MockAudit) {}

  handle(req: MockRequest, user: DemoUser): MockResult {
    if (user.profile.type !== 'staff') return fail(403, 'forbidden');
    const denied = need(user, PERMISSION);
    if (denied) return denied;
    const [head, id] = req.path.split('/');
    switch (head) {
      case 'permission-catalogue':
        return req.method === 'GET' ? ok({ data: this.catalogue() }) : fail(405, 'notFound');
      case 'roles':
        return this.rolesRoute(req, user, id);
      case 'role-users':
        return this.usersRoute(req, user, id);
      default:
        return fail(404, 'notFound');
    }
  }

  private rolesRoute(req: MockRequest, user: DemoUser, id?: string): MockResult {
    if (!id) {
      if (req.method === 'GET') return ok({ data: this.roles.map((r) => this.view(r)) });
      return req.method === 'POST' ? this.create(req, user) : fail(405, 'notFound');
    }
    const role = this.roles.find((r) => r.id === id);
    if (!role) return fail(404, 'notFound');
    if (req.method === 'GET') return ok({ data: this.view(role) });
    if (req.method === 'PUT') return this.update(req, user, role);
    if (req.method === 'DELETE') return this.remove(user, role);
    return fail(405, 'notFound');
  }

  private usersRoute(req: MockRequest, user: DemoUser, id?: string): MockResult {
    if (!id) return req.method === 'GET' ? ok({ data: this.staff().map((u) => this.userView(u)) }) : fail(405, 'notFound');
    const target = this.staff().find((u) => u.profile.id === id);
    if (!target) return fail(404, 'notFound');
    if (req.method !== 'PUT') return fail(405, 'notFound');
    if (target.profile.id === user.profile.id) return fail(409, 'roleSelf');
    const roleIds = req.body['roleIds'];
    if (!Array.isArray(roleIds) || roleIds.some((r) => typeof r !== 'string' || !this.roles.some((x) => x.id === r))) return invalid({ roleIds: ['invalidChoice'] });
    const before = this.assignments.get(id) ?? [];
    const after = [...new Set(roleIds as string[])];
    // Super Admin is granted and withdrawn only by a Super Admin, and the system always keeps at least one.
    if (before.includes(SUPER_ROLE) !== after.includes(SUPER_ROLE)) {
      if (!user.profile.permissions.includes(SUPER_ADMIN)) return fail(403, 'roleSuperOnly');
      if (before.includes(SUPER_ROLE) && this.holders(SUPER_ROLE).length === 1) return fail(409, 'roleLastSuper');
    }
    this.assignments.set(id, after);
    this.apply(target);
    this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'roles.assign', entityType: 'user', entityId: id, before: { roleIds: before }, after: { roleIds: after } });
    return ok({ data: this.userView(target) });
  }

  private create(req: MockRequest, user: DemoUser): MockResult {
    const input = this.parse(req.body, null);
    if ('errors' in input) return invalid(input.errors);
    const role: StoredRole = { id: `r-custom-${this.nextId++}`, system: false, locked: false, ...input.value };
    this.roles.push(role);
    this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'roles.create', entityType: 'role', entityId: role.id, after: { name: role.name, permissions: role.permissions } });
    return ok({ data: this.view(role) }, 201);
  }

  private update(req: MockRequest, user: DemoUser, role: StoredRole): MockResult {
    if (role.locked) return fail(409, 'roleLocked');
    const input = this.parse(req.body, role);
    if ('errors' in input) return invalid(input.errors);
    const before = { name: role.name, permissions: [...role.permissions] };
    // Built-in roles keep their name; only description and permissions change.
    role.name = role.system ? role.name : input.value.name;
    role.description = input.value.description;
    role.permissions = input.value.permissions;
    this.holders(role.id).forEach((u) => this.apply(u));
    this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'roles.update', entityType: 'role', entityId: role.id, before, after: { name: role.name, permissions: role.permissions } });
    return ok({ data: this.view(role) });
  }

  private remove(user: DemoUser, role: StoredRole): MockResult {
    if (role.system) return fail(409, 'roleSystem');
    if (this.holders(role.id).length) return fail(409, 'roleInUse');
    this.roles.splice(this.roles.indexOf(role), 1);
    this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'roles.delete', entityType: 'role', entityId: role.id, before: { name: role.name } });
    return { status: 204 };
  }

  private parse(body: Record<string, unknown>, current: StoredRole | null): { value: RoleInput } | { errors: FieldErrors } {
    const errors: FieldErrors = {};
    const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
    if (!name || name.length > NAME_MAX) errors['name'] = ['required'];
    else if (this.roles.some((r) => r.id !== current?.id && r.name.toLowerCase() === name.toLowerCase())) errors['name'] = ['roleNameTaken'];
    const permissions = body['permissions'];
    if (!Array.isArray(permissions) || permissions.some((p) => !(GRANTABLE as readonly unknown[]).includes(p))) errors['permissions'] = ['invalidChoice'];
    if (Object.keys(errors).length) return { errors };
    const wanted = new Set(permissions as string[]);
    return { value: { name, description: typeof body['description'] === 'string' ? body['description'].trim() : '', permissions: GRANTABLE.filter((p) => wanted.has(p)) } };
  }

  /** Permissions grouped by module, in the order they are declared. */
  private catalogue(): PermissionModule[] {
    const modules = new Map<string, PermissionModule>();
    for (const key of GRANTABLE) {
      const dot = key.indexOf('.');
      const module = key.slice(0, dot);
      const entry = modules.get(module) ?? { module, actions: [] };
      entry.actions.push({ key, action: key.slice(dot + 1) });
      modules.set(module, entry);
    }
    return [...modules.values()];
  }

  private staff(): DemoUser[] {
    return DEMO_USERS.filter((u) => u.profile.type === 'staff');
  }

  private holders(roleId: string): DemoUser[] {
    return this.staff().filter((u) => this.assignments.get(u.profile.id)?.includes(roleId));
  }

  /** A user's permissions are the union of their roles', so the session picks the change up on the next sign-in. */
  private apply(user: DemoUser): void {
    const held = new Set((this.assignments.get(user.profile.id) ?? []).flatMap((rid) => this.roles.find((r) => r.id === rid)?.permissions ?? []));
    user.profile.permissions = ALL_PERMISSIONS.filter((p) => held.has(p));
  }

  private view(role: StoredRole): Role {
    return clean({ ...role, permissions: [...role.permissions], userCount: this.holders(role.id).length });
  }

  private userView(u: DemoUser): StaffUserRoles {
    return { id: u.profile.id, name: u.profile.name, email: u.email, roleIds: [...(this.assignments.get(u.profile.id) ?? [])], permissionCount: u.profile.permissions.length };
  }
}
