import { Page, expect, test } from '@playwright/test';

// DEMO credentials of the in-app mock API (see src/app/core/mock-api/mock-users.ts).
const OWNER = { email: 'owner@demo.test', password: 'Owner-Demo-123!' };
const ACCOUNTANT = { email: 'accountant@demo.test', password: 'Accountant-Demo-123!' };

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill(user.password);
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

// The mock session lives in memory, so navigate with the sidebar instead of reloading the page.
async function openClients(page: Page) {
  await page.getByRole('navigation').getByRole('link', { name: 'العملاء' }).click();
  await expect(page).toHaveURL(/\/app\/clients$/);
}

test('owner creates a client, changes its status legally, sees history, and the layout flips to LTR', async ({ page }) => {
  await login(page, OWNER);
  await openClients(page);
  await expect(page.locator('tbody tr')).toHaveCount(10);

  await page.getByRole('link', { name: 'عميل جديد' }).click();
  await page.locator('#legalName').fill('DEMO E2E شركة اختبار');
  await page.locator('#address').fill('شارع تجريبي، القاهرة');
  await page.locator('#taxRegistrationNo').fill('555000111');
  await page.getByRole('button', { name: 'حفظ' }).click();
  await expect(page).toHaveURL(/\/app\/clients\/c-\d+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'DEMO E2E شركة اختبار' })).toBeVisible();

  // Back to the list: the new client is findable through the server-side search.
  await openClients(page);
  await page.locator('#client-q').fill('E2E');
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('link', { name: 'DEMO E2E شركة اختبار' }).click();

  // A new client is a lead: only onboarding and closed are offered.
  await expect(page.getByRole('button', { name: /النقل إلى/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'النقل إلى قيد التهيئة' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect(page.locator('app-status-badge').first()).toHaveText('قيد التهيئة');

  await page.getByRole('tab', { name: 'السجل' }).click();
  await expect(page.locator('tbody tr').first()).toContainText('قيد التهيئة');

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('tab', { name: 'History' })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toContainText('Onboarding');
  await page.screenshot({ path: 'test-results/clients-en.png' });
});

test('a limited accountant sees only the clients assigned to them', async ({ page }) => {
  await login(page, ACCOUNTANT);
  await openClients(page);
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(page.getByText('DEMO Pyramid Logistics')).toHaveCount(0);
  await expect(page.getByText('DEMO Sinai Tourism')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'عميل جديد' })).toHaveCount(0);

  await page.locator('#client-q').fill('Pyramid');
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  await expect(page.getByText('لا يوجد عملاء مطابقون للتصفية.')).toBeVisible();
});
