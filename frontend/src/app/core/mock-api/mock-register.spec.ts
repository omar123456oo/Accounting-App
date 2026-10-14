import { MockBackend } from './mock-backend';
import { registerOffice, restoreRegisteredOffices } from './mock-register';
import { DEMO_USERS, SUPER_ADMIN } from './mock-users';

const body = { officeName: 'DEMO Office', name: 'New Owner', email: 'Fresh@Office.test', password: 'a-long-passphrase-1', passwordConfirmation: 'a-long-passphrase-1' };

describe('mock registration survives a page reload', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    for (let i = DEMO_USERS.length - 1; i >= 0; i--) if (DEMO_USERS[i].profile.id.startsWith('u-reg-')) DEMO_USERS.splice(i, 1);
    localStorage.clear();
  });

  it('puts a registered office back when the mock starts again, so the same e-mail still signs in', () => {
    expect(registerOffice(body, 'en').status).toBe(201);
    // A reload wipes the module state but not localStorage.
    DEMO_USERS.splice(DEMO_USERS.findIndex((u) => u.email === 'fresh@office.test'), 1);
    expect(DEMO_USERS.some((u) => u.email === 'fresh@office.test')).toBe(false);
    new MockBackend();
    const user = DEMO_USERS.find((u) => u.email === 'fresh@office.test')!;
    expect(user.password).toBe(body.password);
    expect(user.profile.name).toBe('New Owner');
  });

  it('does not add the same account twice and still refuses a taken e-mail', () => {
    registerOffice(body, 'en');
    restoreRegisteredOffices();
    restoreRegisteredOffices();
    expect(DEMO_USERS.filter((u) => u.email === 'fresh@office.test')).toHaveLength(1);
    const again = registerOffice(body, 'en');
    expect(again.status).toBe(422);
  });

  it('gives a new owner every permission except Super Admin', () => {
    registerOffice(body, 'en');
    const perms = DEMO_USERS.find((u) => u.email === 'fresh@office.test')!.profile.permissions;
    expect(perms).toContain('settings.manage');
    expect(perms).not.toContain(SUPER_ADMIN);
  });
});
