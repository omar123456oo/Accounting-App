import { Page, expect, test } from '@playwright/test';
import { ACCOUNTANT, CHIEF, login, logout, openNav } from './helpers';

const LEDGER = 'le-c-001';
const header = (page: Page) => page.locator('app-page-header');

/** Accountant creates a balanced two-line entry (checking the live balance text on the way) and submits it. */
async function createAndSubmit(page: Page, date: string, description: string, amount: string): Promise<void> {
  await openNav(page, 'قيود اليومية', /\/app\/accounting\/journals$/);
  await page.getByRole('link', { name: 'قيد جديد' }).click();
  await page.locator('#je-date').fill(date);
  await page.locator('#je-description').fill(description);
  await page.locator('#line-account-0').selectOption('a-c-001-5900');
  await page.locator('#line-debit-0').fill(amount);
  await page.locator('#line-account-1').selectOption('a-c-001-1110');
  await page.locator('#line-credit-1').fill('1');
  await expect(page.locator('#balance-status')).toContainText('القيد غير متوازن بفارق');
  await expect(page.getByRole('button', { name: 'تقديم للاعتماد' })).toBeDisabled();
  await page.locator('#line-credit-1').fill(amount);
  await expect(page.locator('#balance-status')).toContainText('متوازن: المدين يساوي الدائن');
  await page.getByRole('button', { name: 'تقديم للاعتماد' }).click();
  await expect(header(page).getByRole('heading', { level: 1 })).toContainText('DRAFT-');
  await expect(header(page).locator('app-status-badge')).toHaveText('بانتظار الاعتماد');
}

async function openEntry(page: Page, description: string): Promise<void> {
  await openNav(page, 'قيود اليومية', /\/app\/accounting\/journals$/);
  await page.locator('#je-q').fill(description);
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  await page.getByRole('row', { name: new RegExp(description) }).getByRole('link').first().click();
}

async function trialBalanceDebit(page: Page): Promise<string> {
  await openNav(page, 'التقارير', /\/app\/accounting\/reports\/trial-balance$/);
  await expect(page.locator('#tb-reconciliation')).toContainText('مطابق: إجمالي المدين يساوي إجمالي الدائن');
  return (await page.locator('#tb-total-debit').textContent()) ?? '';
}

test('ledger: create, four-eyes approval, post, reports, locked period, reversal, and direction', async ({ page }) => {
  await login(page, ACCOUNTANT);
  await expect(page.locator('#work-journalsAwaiting')).toHaveText('2');

  // A ledger page follows the language direction.
  await openNav(page, 'قيود اليومية', /\/app\/accounting\/journals$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1, name: 'Journal entries' })).toBeVisible();
  await page.getByRole('button', { name: 'العربية' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  // An accountant sees only the ledger of an assigned client, not the firm books.
  await expect(page.locator('#ledger-select option')).toHaveCount(1);

  await createAndSubmit(page, '2026-10-20', 'DEMO e2e قيد اختبار', '1250.50');
  await createAndSubmit(page, '2026-01-15', 'DEMO e2e فترة مقفلة', '10');

  await logout(page);
  await login(page, CHIEF);
  await openNav(page, 'قيود اليومية', /\/app\/accounting\/journals$/);
  // The chief is office-wide: firm books come first, client books are one selection away.
  await expect(page.locator('#ledger-select option')).toHaveCount(3);
  await page.locator('#ledger-select').selectOption(LEDGER);
  await expect(page.locator('#ledger-select')).toHaveValue(LEDGER);
  const before = await trialBalanceDebit(page);

  // Four-eyes is enforced by the server: the chief approves what the accountant created.
  await openEntry(page, 'DEMO e2e قيد اختبار');
  await page.getByRole('button', { name: 'اعتماد', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'اعتماد', exact: true }).click();
  await expect(header(page).locator('app-status-badge')).toHaveText('معتمد');
  const post = page.getByRole('button', { name: 'ترحيل', exact: true });
  await post.click();
  await expect(header(page).locator('app-status-badge')).toHaveText('مرحّل');
  const reference = (await header(page).getByRole('heading', { level: 1 }).textContent())!.trim();
  expect(reference).toMatch(/^JE-2026-\d{6}$/);
  await expect(page.locator('ol li')).toHaveCount(4);

  // The posted entry appears in the General Ledger and moves the trial balance, which stays reconciled.
  const after = await trialBalanceDebit(page);
  expect(after).not.toBe(before);
  await expect(page.getByText('المرحّل فقط', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'دفتر الأستاذ العام' }).click();
  await page.locator('#rep-account').selectOption('a-c-001-1110');
  await page.getByRole('button', { name: 'تشغيل التقرير' }).click();
  await expect(page.getByRole('link', { name: reference })).toBeVisible();

  // Posting into the locked January is refused for the chief too.
  await openEntry(page, 'DEMO e2e فترة مقفلة');
  await page.getByRole('button', { name: 'اعتماد', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'اعتماد', exact: true }).click();
  await expect(header(page).locator('app-status-badge')).toHaveText('معتمد');
  await page.getByRole('button', { name: 'ترحيل', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('فترة محاسبية مفتوحة');
  await expect(header(page).locator('app-status-badge')).toHaveText('معتمد');

  // Reverse the posted entry: a reason is mandatory.
  await page.getByRole('link', { name: 'قيود اليومية' }).first().click();
  await openEntry(page, 'DEMO e2e قيد اختبار');
  await page.getByRole('button', { name: 'عكس القيد' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'عكس', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByLabel(/سبب العكس/).fill('حساب خاطئ');
  await dialog.getByRole('button', { name: 'عكس', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'تم عكس القيد' })).toBeVisible();
  await expect(header(page).locator('app-status-badge')).toHaveText('معكوس');

  // Both entries stay in the books and the trial balance is still reconciled.
  await trialBalanceDebit(page);
  await expect(page.locator('#tb-total-closing-debit')).toHaveText((await page.locator('#tb-total-closing-credit').textContent())!);
});
