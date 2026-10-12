import { registerOffice } from './mock-register';
import { DEMO_USERS } from './mock-users';

describe('registerOffice (mock)', () => {
  const valid = { officeName: 'DEMO Office', name: 'DEMO Owner', email: 'reg-unit@demo.test', password: 'Correct-Horse-123', passwordConfirmation: 'Correct-Horse-123' };

  it('rejects an empty body with localized required errors', () => {
    const en = registerOffice({}, 'en');
    const ar = registerOffice({}, 'ar');
    expect(en.status).toBe(422);
    expect(ar.status === 422 && ar.errors['email'][0]).toContain('مطلوب');
  });

  it('rejects short passwords, mismatches and duplicate emails', () => {
    expect(registerOffice({ ...valid, password: 'Short-1', passwordConfirmation: 'Short-1' }, 'en')).toMatchObject({ status: 422, errors: { password: expect.any(Array) } });
    expect(registerOffice({ ...valid, passwordConfirmation: 'other-password-123' }, 'en')).toMatchObject({ status: 422, errors: { passwordConfirmation: expect.any(Array) } });
    expect(registerOffice({ ...valid, email: DEMO_USERS[0].email.toUpperCase() }, 'en')).toMatchObject({ status: 422, errors: { email: expect.any(Array) } });
  });

  it('creates a staff owner once and refuses the same email again', () => {
    const before = DEMO_USERS.length;
    expect(registerOffice(valid, 'en')).toEqual({ status: 201, body: { emailVerificationRequired: false } });
    expect(DEMO_USERS.length).toBe(before + 1);
    expect(registerOffice(valid, 'en').status).toBe(422);
  });
});
