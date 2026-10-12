import { Page, expect, test } from '@playwright/test';
import { ACCOUNTANT, CHIEF, expectAmount, login, logout, openNav, western } from './helpers';

const LEDGER = 'le-c-001';
const CUSTOMER = 'DEMO e2e عميل الفواتير';
const header = (page: Page) => page.locator('app-page-header');
const status = (page: Page) => header(page).locator('app-status-badge');

async function openInvoice(page: Page): Promise<void> {
  await openNav(page, 'الفواتير', /\/app\/invoicing\/invoices$/);
  await page.locator('#doc-q').fill(CUSTOMER);
  await page.getByRole('button', { name: 'بحث', exact: true }).click();
  await page.getByRole('row', { name: new RegExp(CUSTOMER) }).getByRole('link').first().click();
}

/** A tab of the receivables section (not the main navigation). */
async function tab(page: Page, name: string): Promise<void> {
  await page.getByRole('navigation', { name: 'أقسام الذمم المدينة' }).getByRole('link', { name, exact: true }).click();
}

async function reportsPill(page: Page, name: string): Promise<void> {
  await openNav(page, 'التقارير', /\/app\/accounting\/reports\/trial-balance$/);
  await page.getByRole('navigation', { name: 'التقارير' }).getByRole('link', { name }).click();
}

test('invoicing: customer, taxed invoice, four-eyes issue, journal in the ledger, partial payment, aging, credit note, balanced books', async ({ page }) => {
  await login(page, ACCOUNTANT);

  // The dashboard shows real receivable numbers: the seeded 90+ days invoice is the one overdue invoice of this ledger.
  expect(await western(page.locator('#work-overdueInvoices'))).toBe('1');
  expect(await western(page.locator('#work-billsDue'))).toBe('0');
  expect(await western(page.locator('#receivables-le-c-001'))).toBe('54,000.00');

  // A customer of the client's own books.
  await openNav(page, 'الفواتير', /\/app\/invoicing\/invoices$/);
  await tab(page, 'العملاء');
  await page.getByRole('button', { name: 'عميل جديد' }).click();
  await page.locator('#party-name').fill(CUSTOMER);
  await page.getByRole('dialog').getByRole('button', { name: 'حفظ' }).click();
  await expect(page.getByRole('row', { name: new RegExp(CUSTOMER) })).toBeVisible();

  // A high-value invoice with VAT from a clearly unverified demo rate.
  await tab(page, 'الفواتير');
  await page.getByRole('link', { name: 'فاتورة جديدة' }).click();
  await page.locator('#inv-party').selectOption({ label: CUSTOMER });
  await page.locator('#line-desc-0').fill('DEMO e2e بضاعة');
  await page.locator('#line-item-0').selectOption('st-c-001-SALES');
  await page.locator('#line-price-0').fill('120000');
  await page.locator('#line-tax-0').selectOption('tx-demo-vat-std');
  await expectAmount(page.locator('#doc-tax'), '16,800.00');
  await expectAmount(page.locator('#doc-total'), '136,800.00');
  await expect(page.getByText('معدل ضريبة غير موثق مهنيًا', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'حفظ كمسودة' }).click();
  await expect(header(page).getByRole('heading', { level: 1 })).toContainText('DRAFT-');
  await expect(status(page)).toHaveText('مسودة');
  await expect(page.locator('#invoice-unverified')).toBeVisible();
  // Above the threshold the accountant can only submit: there is no issue button.
  await expect(page.getByRole('button', { name: 'إصدار', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'تقديم للاعتماد' }).click();
  await expect(status(page)).toHaveText('بانتظار الاعتماد');

  await logout(page);
  await login(page, CHIEF);
  await openNav(page, 'الفواتير', /\/app\/invoicing\/invoices$/);
  await page.locator('#ledger-select').selectOption(LEDGER);
  await openInvoice(page);
  await expect(status(page)).toHaveText('بانتظار الاعتماد');
  await page.getByRole('button', { name: 'اعتماد وإصدار' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'اعتماد وإصدار' }).click();
  await expect(status(page)).toHaveText('صادرة');
  const number = (await header(page).getByRole('heading', { level: 1 }).textContent())!.trim();
  expect(number).toMatch(/^INV-2026-\d{6}$/);
  await expectAmount(page.locator('#invoice-balance'), '136,800.00');

  // The invoice is linked to a posted journal that names its source; the general ledger shows it.
  await page.locator('#journals-title').locator('xpath=following::a[1]').click();
  await expect(header(page).locator('app-status-badge')).toHaveText('مرحّل');
  await expect(page.locator('#journal-source')).toContainText('فاتورة');
  const journal = (await header(page).getByRole('heading', { level: 1 }).textContent())!.trim();
  expect(journal).toMatch(/^JE-2026-\d{6}$/);
  await reportsPill(page, 'دفتر الأستاذ العام');
  await page.locator('#rep-account').selectOption('a-c-001-1210');
  await page.getByRole('button', { name: 'تشغيل التقرير' }).click();
  await expect(page.getByRole('link', { name: journal })).toBeVisible();

  // A partial payment with allocation: over-allocation is stated in text and blocks the button.
  await openInvoice(page);
  await page.getByRole('link', { name: 'تسجيل الدفعة' }).click();
  await page.locator('#pay-account').selectOption('a-c-001-1120');
  await page.locator('#pay-amount').fill('50000');
  await page.locator('#alloc-0').fill('60000');
  await expect(page.locator('#alloc-over')).toContainText('التخصيصات تزيد على مبلغ الدفعة');
  await expect(page.getByRole('button', { name: 'تسجيل الدفعة' })).toBeDisabled();
  await page.locator('#alloc-0').fill('50000');
  await expectAmount(page.locator('#alloc-unallocated'), '0.00');
  await page.getByRole('button', { name: 'تسجيل الدفعة' }).click();
  await expect(header(page).getByRole('heading', { level: 1 })).toContainText('إيصال RC-2026-');
  await expectAmount(page.locator('#receipt-amount'), '50,000.00');

  await openInvoice(page);
  await expect(status(page)).toHaveText('مدفوعة جزئيًا');
  await expectAmount(page.locator('#invoice-paid'), '50,000.00');
  await expectAmount(page.locator('#invoice-balance'), '86,800.00');

  // Aging follows: the seeded 54,000 plus the 86,800 still open.
  await reportsPill(page, 'أعمار الذمم المدينة');
  await expectAmount(page.locator('#aging-total'), '140,800.00');
  await expectAmount(page.locator('#aging-total-current'), '86,800.00');
  await expectAmount(page.locator('#aging-total-d90_plus'), '54,000.00');

  // A credit note lowers the open balance and posts a reversing journal.
  await openInvoice(page);
  await page.getByRole('button', { name: 'إشعار دائن', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#cn-amount').fill('10000');
  await dialog.locator('#cn-reason').fill('DEMO e2e مرتجع');
  await dialog.getByRole('button', { name: 'إنشاء' }).click();
  await expectAmount(page.locator('#invoice-balance'), '76,800.00');
  await expect(page.getByText('CN-2026-').first()).toBeVisible();

  // Books stay balanced and every subledger equals its control account.
  await reportsPill(page, 'ميزان المراجعة');
  await expect(page.locator('#tb-reconciliation')).toContainText('مطابق: إجمالي المدين يساوي إجمالي الدائن');
  await reportsPill(page, 'المطابقة');
  await expect(page.locator('#recon-status')).toContainText('مطابق: كل حساب فرعي يساوي حساب المراقبة الخاص به');
  await expect(page.locator('#recon-ar')).toContainText('مطابق');
});
