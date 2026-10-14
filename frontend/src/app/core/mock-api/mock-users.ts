import { AuthUser } from '../auth/auth.models';

/**
 * DEMO ONLY. These credentials exist solely in the in-memory mock API (environment.useMockApi) and are
 * compiled out of production builds by the file replacement. They are not real accounts.
 *
 *   superadmin@demo.test  / SuperAdmin-Demo-123!   staff, Super Admin: every permission, always; the only one who can grant or remove Super Admin
 *   owner@demo.test       / Owner-Demo-123!        staff, all permissions except the Super Admin marker
 *   accountant@demo.test  / Accountant-Demo-123!   staff, journals.view/create + ledger.view + reports.view + clients.view/update,
 *                                                 documents.view/upload, tasks.view/manage; cannot approve or post;
 *                                                 sees only the clients (and client ledgers) assigned to them
 *   chief@demo.test       / Chief-Demo-123!        staff, office-wide, holds the approve permissions
 *                                                 (clients.approve_onboarding, documents.review, workflows.approve,
 *                                                 journals.approve/approve_high/post, ledger.manage_accounts, periods.manage/reopen)
 *   (commercial permissions) accountant: invoices.view/create/issue, payments.record, bills.view/create, expenses.claim, suppliers.manage;
 *                           chief: invoices.view/create/issue/approve, payments.record, bills.view/create/approve, expenses.claim,
 *                           suppliers.manage, mappings.manage; owner and MFA staff: everything, including tax.rates.manage
 *   (Phase 5) owner and MFA staff also hold every compliance permission (tax.*, eta.* incl. eta.simulate, closing.*, bank.manage, audit.view);
 *           accountant: tax.view/prepare, eta.view/prepare, closing.view, bank.manage;
 *           chief: tax.view/prepare/review, eta.view/prepare/review, closing.view/manage, bank.manage, periods.manage/reopen
 *   tax@demo.test         / Tax-Demo-123!          staff, office-wide tax specialist: tax.* (view, prepare, review, settings, record_outcome) and eta.* except
 *                                                 eta.simulate, tax.rates.manage, read access to ledgers, reports, invoices and bills; NO journals.post
 *   auditor@demo.test     / Auditor-Demo-123!      staff, office-wide, read-only: view permissions only, including audit.view; cannot change anything
 *   client@demo.test      / Client-Demo-123!       client portal user of client c-001 (DEMO Nile Trading Co.)
 *   client2@demo.test     / Client2-Demo-123!      client portal user of client c-002; must never see c-001's data
 *   mfa@demo.test         / Mfa-Demo-12345!        staff with MFA enabled; one-time code is DEMO_OTP
 */
export type DemoRole = 'owner' | 'chief' | 'accountant' | 'client';

export interface DemoUser {
  email: string;
  /** Drives the approval-limit table of the commercial module (mock only). */
  role: DemoRole;
  password: string;
  mfaEnabled: boolean;
  /** Office-wide role (owner / office manager): sees every client regardless of assignments. */
  officeWide?: boolean;
  /** Portal users belong to exactly one client and can see nothing else. */
  clientId?: string;
  profile: AuthUser;
}

export const DEMO_OTP = '123456';

/** Held only by the Super Admin; it is never offered in the role editor. */
export const SUPER_ADMIN = 'system.super_admin';

export const ALL_PERMISSIONS = [
  'journals.view',
  'journals.create',
  'journals.update',
  'journals.delete',
  'journals.amend',
  'journals.approve',
  'journals.approve_high',
  'journals.post',
  'ledger.view',
  'ledger.manage_accounts',
  'periods.manage',
  'periods.reopen',
  'reports.view',
  'settings.manage',
  'clients.view',
  'clients.create',
  'clients.update',
  'clients.archive',
  'clients.approve_onboarding',
  'documents.view',
  'documents.upload',
  'documents.review',
  'tasks.view',
  'tasks.manage',
  'workflows.approve',
  'invoices.view',
  'invoices.create',
  'invoices.update',
  'invoices.delete',
  'invoices.amend',
  'invoices.approve',
  'invoices.issue',
  'payments.record',
  'bills.view',
  'bills.create',
  'bills.update',
  'bills.delete',
  'bills.amend',
  'bills.approve',
  'expenses.claim',
  'suppliers.manage',
  'tax.rates.manage',
  'mappings.manage',
  'tax.view',
  'tax.prepare',
  'tax.review',
  'tax.settings',
  'tax.record_outcome',
  'eta.view',
  'eta.prepare',
  'eta.review',
  'eta.record',
  'eta.simulate',
  'closing.view',
  'closing.manage',
  'bank.manage',
  'audit.view',
  'hr.view',
  'hr.manage',
  'leave.apply',
  'leave.approve',
  'payroll.view',
  'payroll.process',
  'tickets.manage',
  'appointments.manage',
  'timesheets.log',
  'timesheets.approve',
  'forecast.view',
  'hr.employees.view',
  'hr.employees.manage',
  'hr.org.manage',
  'hr.contracts.view',
  'hr.contracts.manage',
  SUPER_ADMIN,
];

/** Everything except the Super Admin marker: what an ordinary owner holds. */
export const OWNER_PERMISSIONS = ALL_PERMISSIONS.filter((p) => p !== SUPER_ADMIN);

const DOCUMENT_TYPES = ['journals', 'invoices', 'bills'] as const;

/**
 * The standard document rights are view, create, edit (update), delete and amend. Anyone who could create a document type
 * keeps the right to edit and delete drafts of it; whoever could post journals or cancel invoices/bills may amend them.
 */
function withDocumentRights(permissions: string[]): string[] {
  const next = new Set(permissions);
  // Every staff member can ask for leave and read their own HR file; approving and salaries stay with the owner.
  next.add('leave.apply');
  // Time logging for everyone; client-facing desks follow client access; approving time follows journal approval (chief and above).
  next.add('timesheets.log');
  if (next.has('clients.update')) {
    next.add('tickets.manage');
    next.add('appointments.manage');
  }
  if (next.has('journals.approve')) next.add('timesheets.approve');
  if (next.has('reports.view') && next.has('invoices.view')) next.add('forecast.view');
  for (const doc of DOCUMENT_TYPES) {
    if (next.has(`${doc}.create`)) {
      next.add(`${doc}.update`);
      next.add(`${doc}.delete`);
      if (doc !== 'journals') next.add(`${doc}.amend`);
    }
  }
  if (next.has('journals.post')) next.add('journals.amend');
  return ALL_PERMISSIONS.filter((p) => next.has(p));
}

export const DEMO_USERS: DemoUser[] = [
  {
    email: 'superadmin@demo.test',
    role: 'owner',
    password: 'SuperAdmin-Demo-123!',
    mfaEnabled: false,
    officeWide: true,
    profile: { id: 'u-superadmin', name: 'Demo Super Admin', type: 'staff', permissions: [...ALL_PERMISSIONS] },
  },
  {
    email: 'owner@demo.test',
    role: 'owner',
    password: 'Owner-Demo-123!',
    mfaEnabled: false,
    officeWide: true,
    profile: { id: 'u-owner', name: 'Demo Owner', type: 'staff', permissions: OWNER_PERMISSIONS },
  },
  {
    email: 'accountant@demo.test',
    role: 'accountant',
    password: 'Accountant-Demo-123!',
    mfaEnabled: false,
    profile: { id: 'u-accountant', name: 'Demo Accountant', type: 'staff', permissions: ['journals.view', 'journals.create', 'ledger.view', 'reports.view', 'clients.view', 'clients.update', 'documents.view', 'documents.upload', 'tasks.view', 'tasks.manage', 'invoices.view', 'invoices.create', 'invoices.issue', 'payments.record', 'bills.view', 'bills.create', 'expenses.claim', 'suppliers.manage', 'tax.view', 'tax.prepare', 'eta.view', 'eta.prepare', 'closing.view', 'bank.manage'] },
  },
  {
    email: 'chief@demo.test',
    role: 'chief',
    password: 'Chief-Demo-123!',
    mfaEnabled: false,
    officeWide: true,
    profile: {
      id: 'u-chief',
      name: 'Demo Chief Accountant',
      type: 'staff',
      permissions: ['journals.view', 'journals.create', 'journals.approve', 'journals.approve_high', 'journals.post', 'ledger.view', 'ledger.manage_accounts', 'periods.manage', 'periods.reopen', 'reports.view', 'clients.view', 'clients.update', 'clients.approve_onboarding', 'documents.view', 'documents.upload', 'documents.review', 'tasks.view', 'tasks.manage', 'workflows.approve', 'invoices.view', 'invoices.create', 'invoices.issue', 'invoices.approve', 'payments.record', 'bills.view', 'bills.create', 'bills.approve', 'expenses.claim', 'suppliers.manage', 'mappings.manage', 'tax.view', 'tax.prepare', 'tax.review', 'eta.view', 'eta.prepare', 'eta.review', 'closing.view', 'closing.manage', 'bank.manage'],
    },
  },
  {
    email: 'tax@demo.test',
    role: 'accountant',
    password: 'Tax-Demo-123!',
    mfaEnabled: false,
    officeWide: true,
    profile: {
      id: 'u-tax',
      name: 'Demo Tax Specialist',
      type: 'staff',
      permissions: ['ledger.view', 'reports.view', 'journals.view', 'clients.view', 'documents.view', 'documents.upload', 'tasks.view', 'invoices.view', 'bills.view', 'tax.rates.manage', 'tax.view', 'tax.prepare', 'tax.review', 'tax.settings', 'tax.record_outcome', 'eta.view', 'eta.prepare', 'eta.review', 'eta.record', 'closing.view'],
    },
  },
  {
    email: 'auditor@demo.test',
    role: 'accountant',
    password: 'Auditor-Demo-123!',
    mfaEnabled: false,
    officeWide: true,
    profile: {
      id: 'u-auditor',
      name: 'Demo Auditor',
      type: 'staff',
      permissions: ['ledger.view', 'reports.view', 'journals.view', 'clients.view', 'documents.view', 'tasks.view', 'invoices.view', 'bills.view', 'tax.view', 'eta.view', 'closing.view', 'audit.view'],
    },
  },
  {
    email: 'client@demo.test',
    role: 'client',
    password: 'Client-Demo-123!',
    mfaEnabled: false,
    clientId: 'c-001',
    profile: { id: 'u-client', name: 'Demo Client', type: 'client', permissions: [] },
  },
  {
    email: 'client2@demo.test',
    role: 'client',
    password: 'Client2-Demo-123!',
    mfaEnabled: false,
    clientId: 'c-002',
    profile: { id: 'u-client2', name: 'Demo Client Two', type: 'client', permissions: [] },
  },
  {
    email: 'mfa@demo.test',
    role: 'owner',
    password: 'Mfa-Demo-12345!',
    mfaEnabled: true,
    officeWide: true,
    profile: { id: 'u-mfa', name: 'Demo MFA Staff', type: 'staff', permissions: OWNER_PERMISSIONS },
  },
];

for (const u of DEMO_USERS) if (u.profile.type === 'staff') u.profile.permissions = withDocumentRights(u.profile.permissions);
