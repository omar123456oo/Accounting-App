import { DEMO_USERS, DemoUser } from './mock-users';

export interface RegisterBody {
  officeName?: string;
  name?: string;
  email?: string;
  password?: string;
  passwordConfirmation?: string;
}

export type RegisterResult =
  | { status: 201; body: { emailVerificationRequired: boolean } }
  | { status: 422; errors: Record<string, string[]> };

const MIN_PASSWORD = 12;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MESSAGES = {
  en: {
    required: 'This field is required.',
    invalidEmail: 'Enter a valid email address.',
    emailTaken: 'An account with this email already exists.',
    passwordShort: `Use at least ${MIN_PASSWORD} characters.`,
    passwordMismatch: 'The passwords do not match.',
  },
  ar: {
    required: 'هذا الحقل مطلوب.',
    invalidEmail: 'أدخل عنوان بريد إلكتروني صحيحًا.',
    emailTaken: 'يوجد حساب بهذا البريد الإلكتروني بالفعل.',
    passwordShort: `استخدم ${MIN_PASSWORD} حرفًا على الأقل.`,
    passwordMismatch: 'كلمتا المرور غير متطابقتين.',
  },
} as const;

let counter = 0;

/**
 * DEMO ONLY. Mirrors the planned POST /api/v1/auth/register contract: validates the body, creates the office
 * owner in memory and does NOT sign the user in. The real server also checks the password against breach lists
 * and sends a verification e-mail; the mock skips both and reports `emailVerificationRequired: false`.
 * Registration creates a staff owner with the demo owner's permissions; the demo data it can see is shared.
 */
export function registerOffice(body: RegisterBody, lang: string | null): RegisterResult {
  const t = MESSAGES[lang?.startsWith('ar') ? 'ar' : 'en'];
  const email = (body.email ?? '').trim().toLowerCase();
  const errors: Record<string, string[]> = {};
  if (!body.officeName?.trim()) errors['officeName'] = [t.required];
  if (!body.name?.trim()) errors['name'] = [t.required];
  if (!email) errors['email'] = [t.required];
  else if (!EMAIL.test(email)) errors['email'] = [t.invalidEmail];
  else if (DEMO_USERS.some((u) => u.email === email)) errors['email'] = [t.emailTaken];
  if (!body.password) errors['password'] = [t.required];
  else if (body.password.length < MIN_PASSWORD) errors['password'] = [t.passwordShort];
  if (body.password && body.password !== body.passwordConfirmation) errors['passwordConfirmation'] = [t.passwordMismatch];
  if (Object.keys(errors).length > 0) return { status: 422, errors };

  const template = DEMO_USERS.find((u) => u.role === 'owner' && !u.mfaEnabled) as DemoUser;
  counter += 1;
  DEMO_USERS.push({
    email,
    role: 'owner',
    password: body.password as string,
    mfaEnabled: false,
    officeWide: true,
    profile: { id: `u-reg-${counter}`, name: (body.name as string).trim(), type: 'staff', permissions: [...template.profile.permissions] },
  });
  return { status: 201, body: { emailVerificationRequired: false } };
}
