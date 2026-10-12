import { AuthUser } from '../auth/auth.models';

/**
 * DEMO ONLY. These credentials exist solely in the in-memory mock API (environment.useMockApi) and are
 * compiled out of production builds by the file replacement. They are not real accounts.
 *
 *   owner@demo.test       / Owner-Demo-123!        staff, all permissions
 *   accountant@demo.test  / Accountant-Demo-123!   staff, journals.view/create + ledger.view + reports.view + clients.view/update,
 *                                                 documents.view/upload, tasks.view/manage; cannot approve or post;
 *                                                 sees only the clients (and client ledgers) assigned to them
 *   chief@demo.test       / Chief-Demo-123!        staff, office-wide, holds the approve permissions
 *                                                 (clients.approve_onboarding, documents.review, workflows.approve,
 *                                                 journals.approve/approve_high/post, ledger.manage_accounts, periods.manage/reopen)
 *   client@demo.test      / Client-Demo-123!       client portal user
 *   mfa@demo.test         / Mfa-Demo-12345!        staff with MFA enabled; one-time code is DEMO_OTP
 */
export interface DemoUser {
  email: string;
  password: string;
  mfaEnabled: boolean;
  /** Office-wide role (owner / office manager): sees every client regardless of assignments. */
  officeWide?: boolean;
  profile: AuthUser;
}

export const DEMO_OTP = '123456';

const ALL_PERMISSIONS = [
  'journals.view',
  'journals.create',
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
];

export const DEMO_USERS: DemoUser[] = [
  {
    email: 'owner@demo.test',
    password: 'Owner-Demo-123!',
    mfaEnabled: false,
    officeWide: true,
    profile: { id: 'u-owner', name: 'Demo Owner', type: 'staff', permissions: ALL_PERMISSIONS },
  },
  {
    email: 'accountant@demo.test',
    password: 'Accountant-Demo-123!',
    mfaEnabled: false,
    profile: { id: 'u-accountant', name: 'Demo Accountant', type: 'staff', permissions: ['journals.view', 'journals.create', 'ledger.view', 'reports.view', 'clients.view', 'clients.update', 'documents.view', 'documents.upload', 'tasks.view', 'tasks.manage'] },
  },
  {
    email: 'chief@demo.test',
    password: 'Chief-Demo-123!',
    mfaEnabled: false,
    officeWide: true,
    profile: {
      id: 'u-chief',
      name: 'Demo Chief Accountant',
      type: 'staff',
      permissions: ['journals.view', 'journals.create', 'journals.approve', 'journals.approve_high', 'journals.post', 'ledger.view', 'ledger.manage_accounts', 'periods.manage', 'periods.reopen', 'reports.view', 'clients.view', 'clients.update', 'clients.approve_onboarding', 'documents.view', 'documents.upload', 'documents.review', 'tasks.view', 'tasks.manage', 'workflows.approve'],
    },
  },
  {
    email: 'client@demo.test',
    password: 'Client-Demo-123!',
    mfaEnabled: false,
    profile: { id: 'u-client', name: 'Demo Client', type: 'client', permissions: [] },
  },
  {
    email: 'mfa@demo.test',
    password: 'Mfa-Demo-12345!',
    mfaEnabled: true,
    officeWide: true,
    profile: { id: 'u-mfa', name: 'Demo MFA Staff', type: 'staff', permissions: ALL_PERMISSIONS },
  },
];
