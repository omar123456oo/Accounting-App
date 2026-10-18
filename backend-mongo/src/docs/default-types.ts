import type { Types } from 'mongoose';
import { SmartDocType, type DocFieldDef } from './models.js';

const f = (key: string, label: string, type: DocFieldDef['type'], extra: Partial<DocFieldDef> = {}): DocFieldDef =>
  ({ key, label, type, required: false, active: true, order: 0, options: [], sensitive: false, ...extra });

const common = (): DocFieldDef[] => [
  f('title', 'Document title', 'text', { required: true, role: 'title', labelAr: 'عنوان المستند' }),
  f('number', 'Document number', 'text', { role: 'number', labelAr: 'رقم المستند' }),
  f('issuer', 'Issuing authority', 'text', { role: 'issuer', labelAr: 'جهة الإصدار' }),
  f('issue_date', 'Issue date', 'date', { role: 'issue_date', labelAr: 'تاريخ الإصدار' }),
  f('expiry_date', 'Expiry date', 'date', { role: 'expiry_date', labelAr: 'تاريخ الانتهاء' }),
];

interface Default { key: string; label: string; labelAr: string; category: string; keywords: string[]; expiringSoonDays: number; fields: DocFieldDef[] }

/** Starting types. They are ordinary rows once created: an administrator may edit, add fields to or deactivate them. */
export const DEFAULT_TYPES: Default[] = [
  {
    key: 'contract', label: 'Contract', labelAr: 'عقد', category: 'legal', expiringSoonDays: 60,
    keywords: ['contract', 'agreement', 'parties', 'عقد', 'اتفاقية', 'الطرف الأول'],
    fields: [
      f('title', 'Contract title', 'text', { required: true, role: 'title', labelAr: 'عنوان العقد' }),
      f('number', 'Contract number', 'text', { role: 'number', labelAr: 'رقم العقد' }),
      f('party', 'Counterparty (person or company)', 'text', { role: 'person', labelAr: 'الطرف الآخر' }),
      f('start_date', 'Start date', 'date', { role: 'start_date', labelAr: 'تاريخ البدء' }),
      f('end_date', 'End date', 'date', { role: 'end_date', labelAr: 'تاريخ الانتهاء' }),
      f('renewal_date', 'Renewal date', 'date', { role: 'renewal_date', labelAr: 'تاريخ التجديد' }),
      f('amount', 'Contract value', 'currency', { role: 'amount', labelAr: 'قيمة العقد' }),
      f('payment_terms', 'Payment terms', 'textarea', { labelAr: 'شروط الدفع' }),
    ],
  },
  {
    key: 'identity', label: 'Identity document', labelAr: 'وثيقة هوية', category: 'identity', expiringSoonDays: 90,
    keywords: ['national id', 'identity card', 'passport', 'بطاقة الرقم القومي', 'جواز سفر', 'بطاقة شخصية'],
    fields: [
      ...common().filter((x) => x.key !== 'issuer'),
      f('holder', 'Holder name', 'text', { role: 'person', required: true, labelAr: 'اسم الحامل' }),
      f('national_id', 'National ID number', 'text', { role: 'identification', sensitive: true, format: 'national_id', labelAr: 'الرقم القومي' }),
      f('issuer', 'Issuing authority', 'text', { role: 'issuer', labelAr: 'جهة الإصدار' }),
    ],
  },
  {
    key: 'license', label: 'License or registration', labelAr: 'ترخيص أو سجل', category: 'compliance', expiringSoonDays: 60,
    keywords: ['license', 'licence', 'registration', 'commercial register', 'tax card', 'ترخيص', 'سجل تجاري', 'بطاقة ضريبية'],
    fields: [
      ...common(),
      f('holder', 'Company or person', 'text', { role: 'person', labelAr: 'الشركة أو الشخص' }),
      f('registration_no', 'Registration or tax number', 'text', { role: 'identification', sensitive: true, labelAr: 'رقم القيد أو الضريبة' }),
      f('renewal_date', 'Renewal date', 'date', { role: 'renewal_date', labelAr: 'تاريخ التجديد' }),
    ],
  },
  {
    key: 'invoice', label: 'Invoice or receipt', labelAr: 'فاتورة أو إيصال', category: 'financial', expiringSoonDays: 14,
    keywords: ['invoice', 'receipt', 'total', 'vat', 'فاتورة', 'إيصال', 'الإجمالي'],
    fields: [
      f('title', 'Description', 'text', { required: true, role: 'title', labelAr: 'الوصف' }),
      f('number', 'Invoice number', 'text', { role: 'number', labelAr: 'رقم الفاتورة' }),
      f('party', 'Supplier or customer', 'text', { role: 'person', labelAr: 'المورد أو العميل' }),
      f('issue_date', 'Invoice date', 'date', { role: 'issue_date', labelAr: 'تاريخ الفاتورة' }),
      f('expiry_date', 'Due date', 'date', { role: 'expiry_date', labelAr: 'تاريخ الاستحقاق' }),
      f('amount', 'Total amount', 'currency', { role: 'amount', labelAr: 'الإجمالي' }),
      f('payment_terms', 'Payment terms', 'text', { labelAr: 'شروط الدفع' }),
    ],
  },
  {
    key: 'other', label: 'Other document', labelAr: 'مستند آخر', category: 'other', expiringSoonDays: 30, keywords: [],
    fields: [...common(), f('notes', 'Notes', 'textarea', { labelAr: 'ملاحظات' })],
  },
];

/** Creates any missing default type for the office. Never overwrites a row an administrator has edited. */
export async function ensureDefaultTypes(organizationId: Types.ObjectId): Promise<void> {
  const have = new Set((await SmartDocType.find({ organizationId }, { key: 1 }).lean()).map((t) => t.key));
  const missing = DEFAULT_TYPES.filter((t) => !have.has(t.key));
  if (!missing.length) return;
  await SmartDocType.insertMany(missing.map((t) => ({
    organizationId, key: t.key, label: t.label, labelAr: t.labelAr, category: t.category, keywords: t.keywords, expiringSoonDays: t.expiringSoonDays,
    builtin: true, fields: t.fields.map((x, i) => ({ ...x, order: i })),
  })), { ordered: false }).catch((e: { code?: number }) => { if (e.code !== 11000) throw e; });
}
