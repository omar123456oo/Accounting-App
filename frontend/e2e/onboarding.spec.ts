import { expect, test } from '@playwright/test';
import { CHIEF, OWNER, login, logout, openNav } from './helpers';

test('owner submits the verification, a different user approves, and the client becomes active', async ({ page }) => {
  await login(page, OWNER);
  await openNav(page, 'العملاء', /\/app\/clients$/);
  await page.locator('#client-q').fill('Delta Farms');
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  await page.getByRole('link', { name: /التهيئة DEMO Delta Farms/ }).click();
  await expect(page).toHaveURL(/\/app\/clients\/c-003\?tab=onboarding$/);
  await expect(page.getByRole('heading', { level: 2, name: 'تهيئة العميل' })).toBeVisible();
  await expect(page.getByText('ليست استشارة قانونية')).toBeVisible();

  // Skipping ahead is refused by the (mock) server and the reason is shown.
  await page.getByRole('button', { name: 'إرسال للتحقق' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  const row = (name: RegExp) => page.getByRole('row', { name });
  await row(/البطاقة الضريبية/).getByRole('button', { name: /^اعتماد/ }).click();
  for (const item of [/بطاقة هوية الممثل المفوض/, /خطاب التعاقد الموقّع/]) {
    await row(item).getByRole('button', { name: /^تحديد كمستلم/ }).click();
    await row(item).getByRole('button', { name: /^اعتماد/ }).click();
  }
  await expect(page.locator('tbody tr').filter({ hasText: 'معتمد' })).toHaveCount(4);

  await page.getByLabel('تم التحقق من هوية الممثل المفوض').check();
  await page.getByLabel('وافق العميل على التعاقد').check();
  await page.getByRole('button', { name: 'إرسال للتحقق' }).click();
  await page.getByRole('button', { name: 'إرسال التحقق للاعتماد' }).click();
  await expect(page.locator('ol li.fw-bold')).toContainText('الاعتماد');

  // Four-eyes: the submitter sees why they cannot approve their own verification.
  await expect(page.getByRole('button', { name: 'اعتماد وتفعيل العميل' })).toBeDisabled();
  await expect(page.getByText('أنت من قدّم هذا التحقق')).toBeVisible();

  await logout(page);
  await login(page, CHIEF);
  await openNav(page, 'الموافقات', /\/app\/approvals$/);
  const pending = page.getByRole('row', { name: /DEMO Delta Farms/ });
  await expect(pending).toContainText('معلّقة');
  await pending.getByRole('button', { name: /^اعتماد/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'اعتماد' }).click();
  await expect(page.getByRole('row', { name: /DEMO Delta Farms/ })).toHaveCount(0);

  await openNav(page, 'العملاء', /\/app\/clients$/);
  await page.locator('#client-q').fill('Delta Farms');
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  await page.getByRole('link', { name: 'DEMO Delta Farms', exact: true }).click();
  await expect(page.locator('app-status-badge').first()).toHaveText('نشط');
  await page.getByRole('tab', { name: 'التهيئة' }).click();
  await expect(page.getByText('اكتملت التهيئة والعميل نشط.')).toBeVisible();
});
