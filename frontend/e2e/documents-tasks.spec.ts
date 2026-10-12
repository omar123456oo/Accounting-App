import { expect, test } from '@playwright/test';
import { CHIEF, OWNER, login, logout, openNav } from './helpers';

const PDF = Buffer.from('%PDF-1.4\n% DEMO e2e file\n');
const EXE = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]), Buffer.alloc(64)]);

test('documents: a valid upload works, a disguised executable is rejected, and review approves or rejects', async ({ page }) => {
  await login(page, OWNER);
  await openNav(page, 'المستندات', /\/app\/documents$/);
  const before = await page.locator('tbody tr').count();

  await page.getByRole('button', { name: 'رفع مستند' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('العميل').selectOption({ label: 'DEMO Nile Trading Co.' });
  await dialog.getByLabel('الملف').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: EXE });
  await expect(dialog.getByText('محتوى الملف لا يطابق امتداده')).toBeVisible();
  await dialog.getByRole('button', { name: 'رفع', exact: true }).click();
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('الملف').setInputFiles({ name: 'e2e-statement.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(dialog.locator('.invalid-feedback')).toHaveCount(0);
  await expect(dialog.getByLabel(/^الاسم/)).toHaveValue('e2e-statement');
  await dialog.getByRole('button', { name: 'رفع', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel('بحث بالاسم أو العميل أو الوسم').fill('e2e-statement');
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  const row = page.getByRole('row', { name: /e2e-statement/ });
  await expect(row).toContainText('بانتظار المراجعة');
  expect(before).toBeGreaterThan(0);

  // Approve it, then reject another pending one with a mandatory comment.
  await row.getByRole('button', { name: /^اعتماد/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'اعتماد', exact: true }).click();
  await expect(row).toContainText('معتمد');

  await page.getByLabel('بحث بالاسم أو العميل أو الوسم').fill('Tax card');
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  const tax = page.getByRole('row', { name: /DEMO Tax card/ });
  await tax.getByRole('button', { name: /^رفض/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'رفض', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.getByRole('dialog').getByLabel(/سبب الرفض/).fill('الصورة غير واضحة');
  await page.getByRole('dialog').getByRole('button', { name: 'رفض', exact: true }).click();
  await expect(tax).toContainText('مرفوض');
  await page.getByRole('button', { name: /^التفاصيل/ }).click();
  await expect(page.getByRole('dialog')).toContainText('الصورة غير واضحة');
});

test('tasks: create a task with a dependency, see the overdue badge, finish in order, and use the approvals inbox', async ({ page }) => {
  await login(page, OWNER);
  await openNav(page, 'المهام', /\/app\/tasks$/);
  await page.getByLabel('عرض').selectOption('all');
  // Overdue tasks carry a text badge and an icon, not just a colour.
  await page.getByLabel('المتأخرة فقط').check();
  await expect(page.locator('tbody tr').first()).toContainText('متأخرة');
  await page.getByLabel('المتأخرة فقط').uncheck();

  await page.getByRole('link', { name: 'مهمة جديدة' }).click();
  await page.getByLabel(/^العنوان/).fill('DEMO e2e مهمة تعتمد على غيرها');
  await page.getByLabel(/^تاريخ الاستحقاق/).fill('2026-10-01');
  await page.getByLabel(/DEMO Collect the bank statements/).check();
  await page.getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'DEMO e2e مهمة تعتمد على غيرها' })).toBeVisible();
  await expect(page.getByText('متأخرة').first()).toBeVisible();

  // The dependency is still open, so finishing is refused with the server's reason.
  await page.getByRole('button', { name: 'تحديد كـ منتهية' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('app-status-badge').first()).toHaveText('للتنفيذ');

  await page.getByRole('link', { name: 'DEMO Collect the bank statements' }).click();
  await page.getByRole('button', { name: 'تحديد كـ منتهية' }).click();
  await expect(page.locator('app-status-badge').first()).toHaveText('منتهية');

  await logout(page);
  await login(page, CHIEF);
  await expect(page.locator('#work-pendingApprovals')).toHaveText('1');
  await openNav(page, 'الموافقات', /\/app\/approvals$/);
  await expect(page.getByRole('row', { name: /DEMO مصنع الدلتا للأغذية/ })).toContainText('معلّقة');
  await page.getByRole('row', { name: /DEMO مصنع الدلتا للأغذية/ }).getByRole('button', { name: /^رفض/ }).click();
  await page.getByRole('dialog').getByLabel(/^التعليق/).fill('التوقيع ناقص');
  await page.getByRole('dialog').getByRole('button', { name: 'رفض', exact: true }).click();
  await expect(page.getByText('لا توجد عناصر موافقة هنا.')).toBeVisible();
});
