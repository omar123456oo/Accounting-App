import { AccountCategory, NormalBalance } from '../../features/accounting/accounting.models';

/**
 * A starting chart of accounts in the usual Egyptian layout (1 assets, 2 liabilities, 3 equity, 4 revenue,
 * 5 expenses). It is an editable starting point only: it is NOT a legal or professional certification and
 * must be reviewed by a qualified accountant before real use.
 */
export interface TemplateAccount {
  code: string;
  parent?: string;
  category: AccountCategory;
  nameEn: string;
  nameAr: string;
  group?: boolean;
  /** Contra accounts keep the opposite of their category's usual balance. */
  contra?: boolean;
}

export const NORMAL_BY_CATEGORY: Record<AccountCategory, NormalBalance> = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  equity: 'credit',
  revenue: 'credit',
};

export const STARTER_CHART: readonly TemplateAccount[] = [
  { code: '1000', category: 'asset', nameEn: 'Assets', nameAr: 'الأصول', group: true },
  { code: '1100', parent: '1000', category: 'asset', nameEn: 'Cash and banks', nameAr: 'النقدية والبنوك', group: true },
  { code: '1110', parent: '1100', category: 'asset', nameEn: 'Cash on hand', nameAr: 'الخزينة' },
  { code: '1120', parent: '1100', category: 'asset', nameEn: 'Bank - current account', nameAr: 'البنك - حساب جاري' },
  { code: '1200', parent: '1000', category: 'asset', nameEn: 'Receivables', nameAr: 'المدينون', group: true },
  { code: '1210', parent: '1200', category: 'asset', nameEn: 'Trade receivables', nameAr: 'العملاء' },
  { code: '1220', parent: '1200', category: 'asset', nameEn: 'Notes receivable', nameAr: 'أوراق القبض' },
  { code: '1230', parent: '1200', category: 'asset', nameEn: 'Employee advances', nameAr: 'سلف العاملين' },
  { code: '1240', parent: '1200', category: 'asset', nameEn: 'Receivable from clients (reimbursable expenses)', nameAr: 'مستحق على العملاء (مصروفات قابلة للاسترداد)' },
  { code: '1250', parent: '1200', category: 'asset', nameEn: 'Supplier prepayments', nameAr: 'دفعات مقدمة للموردين' },
  { code: '1300', parent: '1000', category: 'asset', nameEn: 'Inventory', nameAr: 'المخزون' },
  { code: '1400', parent: '1000', category: 'asset', nameEn: 'Prepaid expenses', nameAr: 'مصروفات مدفوعة مقدمًا' },
  { code: '1410', parent: '1000', category: 'asset', nameEn: 'VAT input (recoverable)', nameAr: 'ضريبة القيمة المضافة - مدخلات' },
  { code: '1500', parent: '1000', category: 'asset', nameEn: 'Fixed assets', nameAr: 'الأصول الثابتة', group: true },
  { code: '1510', parent: '1500', category: 'asset', nameEn: 'Equipment', nameAr: 'المعدات' },
  { code: '1520', parent: '1500', category: 'asset', nameEn: 'Furniture and fixtures', nameAr: 'الأثاث والتجهيزات' },
  { code: '1590', parent: '1500', category: 'asset', nameEn: 'Accumulated depreciation', nameAr: 'مجمع الإهلاك', contra: true },
  { code: '2000', category: 'liability', nameEn: 'Liabilities', nameAr: 'الالتزامات', group: true },
  { code: '2100', parent: '2000', category: 'liability', nameEn: 'Payables', nameAr: 'الدائنون', group: true },
  { code: '2110', parent: '2100', category: 'liability', nameEn: 'Trade payables', nameAr: 'الموردون' },
  { code: '2120', parent: '2100', category: 'liability', nameEn: 'Notes payable', nameAr: 'أوراق الدفع' },
  { code: '2200', parent: '2000', category: 'liability', nameEn: 'Accrued expenses', nameAr: 'مصروفات مستحقة' },
  { code: '2250', parent: '2000', category: 'liability', nameEn: 'Deferred revenue', nameAr: 'إيرادات مؤجلة' },
  { code: '2260', parent: '2000', category: 'liability', nameEn: 'Customer credit balances (unapplied receipts)', nameAr: 'أرصدة العملاء الدائنة (مقبوضات غير مخصصة)' },
  { code: '2300', parent: '2000', category: 'liability', nameEn: 'Taxes and social insurance', nameAr: 'الضرائب والتأمينات', group: true },
  { code: '2310', parent: '2300', category: 'liability', nameEn: 'VAT output payable', nameAr: 'ضريبة القيمة المضافة - مخرجات' },
  { code: '2320', parent: '2300', category: 'liability', nameEn: 'Withholding tax payable', nameAr: 'ضريبة الخصم والإضافة' },
  { code: '2330', parent: '2300', category: 'liability', nameEn: 'Social insurance payable', nameAr: 'التأمينات الاجتماعية المستحقة' },
  { code: '2400', parent: '2000', category: 'liability', nameEn: 'Bank loans', nameAr: 'قروض بنكية' },
  { code: '3000', category: 'equity', nameEn: 'Equity', nameAr: 'حقوق الملكية', group: true },
  { code: '3100', parent: '3000', category: 'equity', nameEn: 'Paid-in capital', nameAr: 'رأس المال المدفوع' },
  { code: '3200', parent: '3000', category: 'equity', nameEn: 'Retained earnings', nameAr: 'الأرباح المحتجزة' },
  { code: '3300', parent: '3000', category: 'equity', nameEn: "Owners' current account", nameAr: 'الحساب الجاري للشركاء' },
  { code: '4000', category: 'revenue', nameEn: 'Revenue', nameAr: 'الإيرادات', group: true },
  { code: '4100', parent: '4000', category: 'revenue', nameEn: 'Service revenue', nameAr: 'إيرادات الخدمات' },
  { code: '4200', parent: '4000', category: 'revenue', nameEn: 'Sales revenue', nameAr: 'إيرادات المبيعات' },
  { code: '4900', parent: '4000', category: 'revenue', nameEn: 'Other income', nameAr: 'إيرادات أخرى' },
  { code: '5000', category: 'expense', nameEn: 'Expenses', nameAr: 'المصروفات', group: true },
  { code: '5100', parent: '5000', category: 'expense', nameEn: 'Salaries and wages', nameAr: 'الرواتب والأجور' },
  { code: '5200', parent: '5000', category: 'expense', nameEn: 'Rent expense', nameAr: 'مصروف الإيجار' },
  { code: '5300', parent: '5000', category: 'expense', nameEn: 'Utilities', nameAr: 'المرافق' },
  { code: '5310', parent: '5000', category: 'expense', nameEn: 'Bank charges', nameAr: 'مصروفات بنكية' },
  { code: '5400', parent: '5000', category: 'expense', nameEn: 'Professional fees', nameAr: 'أتعاب مهنية' },
  { code: '5500', parent: '5000', category: 'expense', nameEn: 'Depreciation expense', nameAr: 'مصروف الإهلاك' },
  { code: '5900', parent: '5000', category: 'expense', nameEn: 'Other expenses', nameAr: 'مصروفات أخرى' },
];
