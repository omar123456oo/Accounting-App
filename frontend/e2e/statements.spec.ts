import { Page, expect, test } from '@playwright/test';
import { ACCOUNTANT, CHIEF, login, logout, openNav, western } from './helpers';

const LEDGER = 'le-c-001';
const header = (page: Page) => page.locator('app-page-header');

async function showStatement(page: Page, nav: string, url: RegExp, from: string, to: string) {
  await openNav(page, nav, url);
  await page.locator('#fs-from').fill(from);
  await page.locator('#fs-to').fill(to);
  await page.getByRole('button', { name: 'تشغيل التقرير' }).click();
}

const cell = (page: Page, key: string) => page.locator(`[data-key="${key}"] [data-col="0"]`);

test('statements: a posted journal moves the statements, drill-down reaches the ledger, and the balance sheet reconciles', async ({ page }) => {
  await login(page, CHIEF);
  await openNav(page, 'قائمة الدخل', /\/app\/statements\/income$/);
  await page.locator('#ledger-select').selectOption(LEDGER);
  await page.locator('#fs-from').fill('2026-10-01');
  await page.locator('#fs-to').fill('2026-10-31');
  await page.getByRole('button', { name: 'تشغيل التقرير' }).click();
  await expect(page.getByText('المرحّل فقط', { exact: true })).toBeVisible();
  await expect(page.locator('#fs-finalized')).toContainText('غير نهائية');
  await expect(page.getByText('ربط مبدئي للقوائم')).toBeVisible();
  await expect.poll(() => western(cell(page, 'is.other_expenses'))).toBe('0.00');

  // The accountant creates and submits an expense; the chief approves and posts it.
  await logout(page);
  await login(page, ACCOUNTANT);
  await openNav(page, 'قيود اليومية', /\/app\/accounting\/journals$/);
  await page.getByRole('link', { name: 'قيد جديد' }).click();
  await page.locator('#je-date').fill('2026-10-20');
  await page.locator('#je-description').fill('DEMO e2e statements expense');
  await page.locator('#line-account-0').selectOption('a-c-001-5900');
  await page.locator('#line-debit-0').fill('1250.50');
  await page.locator('#line-account-1').selectOption('a-c-001-1110');
  await page.locator('#line-credit-1').fill('1250.50');
  await page.getByRole('button', { name: 'تقديم للاعتماد' }).click();
  await expect(header(page).locator('app-status-badge')).toHaveText('بانتظار الاعتماد');
  await logout(page);
  await login(page, CHIEF);
  await openNav(page, 'قيود اليومية', /\/app\/accounting\/journals$/);
  await page.locator('#ledger-select').selectOption(LEDGER);
  await page.locator('#je-q').fill('DEMO e2e statements expense');
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  await page.getByRole('row', { name: /DEMO e2e statements expense/ }).getByRole('link').first().click();
  await page.getByRole('button', { name: 'اعتماد', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'اعتماد', exact: true }).click();
  await page.getByRole('button', { name: 'ترحيل', exact: true }).click();
  await expect(header(page).locator('app-status-badge')).toHaveText('مرحّل');
  const reference = (await header(page).getByRole('heading', { level: 1 }).textContent())!.trim();

  // The income statement now shows the expense and drills down to the posted line in the general ledger.
  await showStatement(page, 'قائمة الدخل', /\/app\/statements\/income$/, '2026-10-01', '2026-10-31');
  await expect.poll(() => western(cell(page, 'is.other_expenses'))).toBe('1,250.50');
  await page.locator('[data-key="is.other_expenses"]').getByRole('button').click();
  await page.locator('#fs-table').getByRole('link', { name: '5900' }).click();
  await expect(page).toHaveURL(/general-ledger\?accountId=a-c-001-5900/);
  await page.getByRole('button', { name: 'تشغيل التقرير' }).click();
  await expect(page.getByRole('link', { name: reference })).toBeVisible();

  // The balance sheet states its equation as text and is reconciled; the page follows the language direction.
  await showStatement(page, 'المركز المالي', /\/app\/statements\/balance$/, '2026-01-01', '2026-12-31');
  await expect(page.locator('#fs-check')).toContainText('مطابق');
  await expect(page.locator('#fs-check')).not.toContainText('غير مطابق');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: 'قائمة المركز المالي' })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1, name: 'Balance sheet' })).toBeVisible();
  await expect(page.locator('#fs-check')).toContainText('reconciled');
  await page.getByRole('button', { name: 'العربية' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});
