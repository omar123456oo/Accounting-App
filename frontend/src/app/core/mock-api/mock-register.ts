import { DEMO_USERS, OWNER_PERMISSIONS } from './mock-users';

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

const STORAGE_KEY = 'app.mock.registered';
interface StoredRegistration {
  id: string;
  name: string;
  email: string;
  password: string;
}

function readStored(): StoredRegistration[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredRegistration[]) : [];
  } catch {
    return [];
  }
}

function addOwner(r: StoredRegistration): void {
  DEMO_USERS.push({
    email: r.email,
    role: 'owner',
    password: r.password,
    mfaEnabled: false,
    officeWide: true,
    // An office owner, not a Super Admin: the Super Admin marker is never copied.
    profile: { id: r.id, name: r.name, type: 'staff', permissions: [...OWNER_PERMISSIONS] },
  });
}

/**
 * DEMO ONLY. The in-memory mock forgets everything when the page reloads, so an account created on the register page used
 * to vanish and sign-in answered "wrong credentials" until a new e-mail was registered. Registrations are therefore kept in this
 * browser's localStorage and put back when the mock starts. The password is stored in clear text: acceptable only because this
 * mock and its data are compiled out of production builds and never hold a real password.
 */
export function restoreRegisteredOffices(): void {
  for (const r of readStored()) {
    if (!DEMO_USERS.some((u) => u.email === r.email)) addOwner(r);
    counter = Math.max(counter, Number(r.id.replace('u-reg-', '')) || 0);
  }
}

function remember(r: StoredRegistration): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...readStored().filter((x) => x.email !== r.email), r]));
  } catch {
    /* storage unavailable: the account then lasts until the page is reloaded */
  }
}

/**
 * DEMO ONLY. Mirrors the planned POST /api/v1/auth/register contract: validates the body, creates the office
 * owner in memory and does NOT sign the user in. The real server also checks the password against breach lists
 * and sends a verification e-mail; the mock skips both and reports `emailVerificationRequired: false`.
 * Registration creates a staff owner with every permission except Super Admin; the demo data it can see is shared.
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

  counter += 1;
  const registration: StoredRegistration = { id: `u-reg-${counter}`, name: (body.name as string).trim(), email, password: body.password as string };
  addOwner(registration);
  remember(registration);
  return { status: 201, body: { emailVerificationRequired: false } };
}
