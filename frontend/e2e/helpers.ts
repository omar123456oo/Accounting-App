import { Locator, Page, expect } from '@playwright/test';

// DEMO credentials of the in-app mock API (see src/app/core/mock-api/mock-users.ts).
export const OWNER = { email: 'owner@demo.test', password: 'Owner-Demo-123!' };
export const ACCOUNTANT = { email: 'accountant@demo.test', password: 'Accountant-Demo-123!' };
export const CHIEF = { email: 'chief@demo.test', password: 'Chief-Demo-123!' };

export async function login(page: Page, user: { email: string; password: string }) {
  // After a logout the app is already on /login; a reload there would wipe the in-memory mock session data.
  if (!page.url().endsWith('/login')) await page.goto('/login');
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill(user.password);
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

/** The mock session lives in memory, so switching user means signing out and in again, without reloading. */
export async function logout(page: Page) {
  await page.getByRole('button', { name: 'قائمة المستخدم' }).click();
  await page.getByRole('menuitem', { name: 'تسجيل الخروج' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Opens a sidebar entry. Never reloads: a reload would reset the in-memory mock. */
export async function openNav(page: Page, name: string, url: RegExp) {
  await page.getByRole('navigation', { name: 'التنقل الرئيسي' }).getByRole('link', { name }).click();
  await expect(page).toHaveURL(url);
}

/** The text of an element with Arabic-Indic digits and separators turned into Western ones, so amounts read the same in both languages. */
export async function western(locator: Locator): Promise<string> {
  const text = (await locator.textContent()) ?? '';
  return text
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/٬/g, ',')
    .replace(/٫/g, '.')
    .trim();
}

/** Waits until the element's amount text (normalised to Western digits) equals `expected`. */
export async function expectAmount(locator: Locator, expected: string): Promise<void> {
  await expect.poll(() => western(locator)).toBe(expected);
}
