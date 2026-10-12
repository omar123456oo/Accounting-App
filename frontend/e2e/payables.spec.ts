import { Page, expect, test } from '@playwright/test';
import { ACCOUNTANT, CHIEF, expectAmount, login, logout, openNav } from './helpers';

const LEDGER = 'le-c-001';
const PDF = Buffer.from('%PDF-1.4\n% DEMO e2e receipt\n');
const EXE = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]), Buffer.alloc(64)]);
const header = (page: Page) => page.locator('app-page-header');
const status = (page: Page) => header(page).locator('app-status-badge');

async function payablesTab(page: Page, name: string): Promise<void> {
  await page.getByRole('navigation', { name: 'أقسام الذمم الدائنة' }).getByRole('link', { name, exact: true }).click();
}

async function openBill(page: Page, supplierInvoiceNo: string): Promise<void> {
  await openNav(page, 'فواتير الموردين', /\/app\/payables\/bills$/);
  await page.locator('#doc-q').fill(supplierInvoiceNo);
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  // The search narrows the list to this one bill (it also matches the supplier's own invoice number).
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.locator('tbody tr').first().getByRole('link').first().click();
}

test('payables: supplier bill, four-eyes approval, partial and full payment, balanced books', async ({ page }) => {
  await login(page, ACCOUNTANT);
  await openNav(page, 'فواتير الموردين', /\/app\/payables\/bills$/);
  await page.getByRole('link', { name: 'فاتورة مورد جديدة' }).click();
  await page.locator('#bill-party').selectOption({ label: 'DEMO Wholesale Supplier' });
  await page.locator('#bill-ref').fill('DEMO-E2E-5001');
  await page.locator('#line-desc-0').fill('DEMO e2e مشتريات');
  await page.locator('#line-item-0').selectOption('ec-c-001-OTHER');
  await page.locator('#line-price-0').fill('5000');
  await page.locator('#line-tax-0').selectOption('tx-demo-vat-std');
  await expectAmount(page.locator('#doc-total'), '5,700.00');
  await page.getByRole('button', { name: 'حفظ كمسودة' }).click();
  await expect(header(page).getByRole('heading', { level: 1 })).toContainText('DRAFT-');
  await page.getByRole('button', { name: 'تقديم للاعتماد' }).click();
  await expect(status(page)).toHaveText('بانتظار الاعتماد');
  // An accountant has no approval right: the control is not offered.
  await expect(page.getByRole('button', { name: 'اعتماد وترحيل' })).toHaveCount(0);

  await logout(page);
  await login(page, CHIEF);
  await openNav(page, 'فواتير الموردين', /\/app\/payables\/bills$/);
  await page.locator('#ledger-select').selectOption(LEDGER);
  await openBill(page, 'DEMO-E2E-5001');
  await page.getByRole('button', { name: 'اعتماد وترحيل' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'اعتماد وترحيل' }).click();
  await expect(status(page)).toHaveText('معتمدة ومرحّلة');
  expect((await header(page).getByRole('heading', { level: 1 }).textContent())!.trim()).toMatch(/^BILL-2026-\d{6}$/);
  await expectAmount(page.locator('#bill-balance'), '5,700.00');
  await expect(page.locator('#journals-title')).toBeVisible();

  // Partial payment, then the rest.
  await page.getByRole('link', { name: 'تسجيل دفعة' }).click();
  await page.locator('#pay-account').selectOption('a-c-001-1120');
  await page.locator('#pay-amount').fill('2000');
  await page.locator('#alloc-0').fill('2000');
  await page.getByRole('button', { name: 'تسجيل الدفعة' }).click();
  await expect(header(page).getByRole('heading', { level: 1 })).toContainText('سند صرف PV-2026-');
  await openBill(page, 'DEMO-E2E-5001');
  await expect(status(page)).toHaveText('مدفوعة جزئيًا');
  await expectAmount(page.locator('#bill-balance'), '3,700.00');
  await page.getByRole('link', { name: 'تسجيل دفعة' }).click();
  await page.locator('#pay-account').selectOption('a-c-001-1110');
  await expect(page.locator('#alloc-0')).toHaveValue('3700');
  await page.getByRole('button', { name: 'تسجيل الدفعة' }).click();
  await expect(header(page).getByRole('heading', { level: 1 })).toContainText('سند صرف PV-2026-');
  await openBill(page, 'DEMO-E2E-5001');
  await expect(status(page)).toHaveText('مدفوعة');
  await expectAmount(page.locator('#bill-balance'), '0.00');

  await openNav(page, 'التقارير', /\/app\/accounting\/reports\/trial-balance$/);
  await expect(page.locator('#tb-reconciliation')).toContainText('مطابق: إجمالي المدين يساوي إجمالي الدائن');
  await page.getByRole('navigation', { name: 'التقارير' }).getByRole('link', { name: 'المطابقة' }).click();
  await expect(page.locator('#recon-ap')).toContainText('مطابق');
});

test('payables: an expense claim with a receipt is approved by a different user and paid, against a visible budget', async ({ page }) => {
  await login(page, ACCOUNTANT);
  await openNav(page, 'المصروفات', /\/app\/payables\/expenses$/);
  await page.getByRole('button', { name: 'طلب مصروفات جديد' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#claim-description').fill('DEMO e2e تذكرة قطار');
  await dialog.locator('#claim-amount').fill('450');
  await dialog.locator('#claim-category').selectOption('ec-c-001-OTHER');
  // The receipt goes through the upload checks: a disguised executable is refused.
  await dialog.locator('#claim-receipt').setInputFiles({ name: 'receipt.pdf', mimeType: 'application/pdf', buffer: EXE });
  await expect(dialog.getByText('محتوى الملف لا يطابق امتداده')).toBeVisible();
  await dialog.getByRole('button', { name: 'تقديم الطلب' }).click();
  await expect(dialog).toBeVisible();
  await dialog.locator('#claim-receipt').setInputFiles({ name: 'train-ticket.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(dialog.locator('.invalid-feedback')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'تقديم الطلب' }).click();
  await expect(dialog).toHaveCount(0);
  const row = page.getByRole('row', { name: /DEMO e2e تذكرة قطار/ });
  await expect(row).toContainText('مقدّم');
  await expect(row).toContainText('train-ticket.pdf');
  // The accountant cannot decide on claims.
  await expect(row.getByRole('button', { name: /^اعتماد/ })).toHaveCount(0);

  await logout(page);
  await login(page, CHIEF);
  await openNav(page, 'المصروفات', /\/app\/payables\/expenses$/);
  await page.locator('#ledger-select').selectOption(LEDGER);
  await expect(page.locator('#budget-table')).toBeVisible();
  const claim = page.getByRole('row', { name: /DEMO e2e تذكرة قطار/ });
  await claim.getByRole('button', { name: /^اعتماد/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'اعتماد', exact: true }).click();
  await expect(claim).toContainText('معتمد');
  await claim.getByRole('button', { name: /^سداد الطلب/ }).click();
  await page.getByRole('dialog').locator('#claim-pay-account').selectOption('a-c-001-1120');
  await page.getByRole('dialog').getByRole('button', { name: 'سداد الطلب' }).click();
  await expect(claim).toContainText('مسدّد');

  await openNav(page, 'التقارير', /\/app\/accounting\/reports\/trial-balance$/);
  await expect(page.locator('#tb-reconciliation')).toContainText('مطابق: إجمالي المدين يساوي إجمالي الدائن');
});

test('an invoice page follows the language direction: right-to-left in Arabic, left-to-right in English', async ({ page }) => {
  await login(page, ACCOUNTANT);
  await openNav(page, 'الفواتير', /\/app\/invoicing\/invoices$/);
  await page.getByRole('row').nth(1).getByRole('link').first().click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#invoice-amounts')).toBeVisible();
  const table = page.locator('app-doc-lines-table table');
  const arabic = await table.boundingBox();
  const firstHeader = page.locator('app-doc-lines-table th').first();
  const arabicHeaderX = (await firstHeader.boundingBox())!.x;
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 2, name: 'History' })).toBeVisible();
  await expect(page.getByText('Total before tax')).toBeVisible();
  // The first column moves from the right edge to the left edge of the table.
  const englishHeaderX = (await page.locator('app-doc-lines-table th').first().boundingBox())!.x;
  expect(arabicHeaderX).toBeGreaterThan(englishHeaderX);
  expect(arabic).not.toBeNull();
  await page.screenshot({ path: 'test-results/invoice-ltr.png' });
  await page.getByRole('button', { name: 'العربية' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.screenshot({ path: 'test-results/invoice-rtl.png' });
});
