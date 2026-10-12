import { AGREEMENT_STATUSES, ClientBankAccount, ClientBranch, ClientContact, CommunicationNote, NOTE_TYPES, ServiceAgreement, SubResource } from '../client.models';
import { ClientFormat, maskAccount } from '../client-format';

export interface FieldDef {
  key: string;
  labelKey: string;
  type: 'text' | 'email' | 'date' | 'checkbox' | 'select' | 'textarea';
  required?: boolean;
  /** Pattern a non-empty value must match (digits, decimal amount, currency code). */
  pattern?: RegExp;
  options?: readonly string[];
  /** Translation prefix of the option labels, e.g. "clients.noteType". */
  optionPrefix?: string;
  initial?: string | boolean;
  inputMode?: 'numeric' | 'decimal';
}

export interface Cell {
  text: string;
  translate?: boolean;
}

export interface ColumnDef<R> {
  labelKey: string;
  cell: (row: R, fmt: ClientFormat) => Cell;
}

export interface ResourceConfig<R = any> {
  resource: SubResource;
  /** Translation prefix for title/add/empty/delete messages, e.g. "clients.contacts". */
  prefix: string;
  fields: readonly FieldDef[];
  columns: readonly ColumnDef<R>[];
  /** Text that identifies a row in the delete confirmation. */
  label: (row: R) => string;
}

const plain = (text: string | undefined): Cell => ({ text: text ?? '' });
const f = (key: string, type: FieldDef['type'], extra: Partial<FieldDef> = {}): FieldDef => ({ key, type, labelKey: `clients.fields.${key}`, ...extra });

const DECIMAL = /^\d{1,13}(\.\d{1,2})?$/;

export const CONTACTS: ResourceConfig<ClientContact> = {
  resource: 'contacts',
  prefix: 'clients.contacts',
  fields: [f('name', 'text', { required: true }), f('role', 'text'), f('email', 'email', { required: true }), f('phone', 'text'), f('isAuthorizedRepresentative', 'checkbox', { initial: false })],
  columns: [
    { labelKey: 'clients.fields.name', cell: (r) => plain(r.name) },
    { labelKey: 'clients.fields.role', cell: (r) => plain(r.role) },
    { labelKey: 'clients.fields.email', cell: (r) => plain(r.email) },
    { labelKey: 'clients.fields.phone', cell: (r) => plain(r.phone) },
    { labelKey: 'clients.fields.isAuthorizedRepresentative', cell: (r) => ({ text: r.isAuthorizedRepresentative ? 'common.yes' : 'common.no', translate: true }) },
  ],
  label: (r) => r.name,
};

export const BRANCHES: ResourceConfig<ClientBranch> = {
  resource: 'branches',
  prefix: 'clients.branches',
  fields: [f('name', 'text', { required: true }), f('address', 'text', { required: true })],
  columns: [
    { labelKey: 'clients.fields.name', cell: (r) => plain(r.name) },
    { labelKey: 'clients.fields.address', cell: (r) => plain(r.address) },
  ],
  label: (r) => r.name,
};

export const BANK_ACCOUNTS: ResourceConfig<ClientBankAccount> = {
  resource: 'bank-accounts',
  prefix: 'clients.bankAccounts',
  fields: [
    f('bankName', 'text', { required: true }),
    f('accountNo', 'text', { required: true, pattern: /^\d+$/, inputMode: 'numeric' }),
    f('iban', 'text'),
    f('currency', 'text', { required: true, pattern: /^[A-Z]{3}$/, initial: 'EGP' }),
  ],
  columns: [
    { labelKey: 'clients.fields.bankName', cell: (r) => plain(r.bankName) },
    { labelKey: 'clients.fields.accountNo', cell: (r) => plain(maskAccount(r.accountNo)) },
    { labelKey: 'clients.fields.iban', cell: (r) => plain(r.iban) },
    { labelKey: 'clients.fields.currency', cell: (r) => plain(r.currency) },
  ],
  label: (r) => `${r.bankName} ${maskAccount(r.accountNo)}`,
};

export const AGREEMENTS: ResourceConfig<ServiceAgreement> = {
  resource: 'agreements',
  prefix: 'clients.agreements',
  fields: [
    f('startDate', 'date', { required: true }),
    f('endDate', 'date', { required: true }),
    f('renewalDate', 'date', { required: true }),
    f('monthlyFee', 'text', { required: true, pattern: DECIMAL, inputMode: 'decimal' }),
    f('status', 'select', { required: true, options: AGREEMENT_STATUSES, optionPrefix: 'clients.agreementStatus', initial: 'draft' }),
  ],
  columns: [
    { labelKey: 'clients.fields.startDate', cell: (r, fmt) => plain(fmt.date(r.startDate)) },
    { labelKey: 'clients.fields.endDate', cell: (r, fmt) => plain(fmt.date(r.endDate)) },
    { labelKey: 'clients.fields.renewalDate', cell: (r, fmt) => plain(fmt.date(r.renewalDate)) },
    { labelKey: 'clients.fields.monthlyFee', cell: (r, fmt) => plain(fmt.money(r.monthlyFee)) },
    { labelKey: 'clients.fields.status', cell: (r) => ({ text: `clients.agreementStatus.${r.status}`, translate: true }) },
  ],
  label: (r) => `${r.startDate} - ${r.endDate}`,
};

export const NOTES: ResourceConfig<CommunicationNote> = {
  resource: 'notes',
  prefix: 'clients.notes',
  fields: [
    f('type', 'select', { required: true, options: NOTE_TYPES, optionPrefix: 'clients.noteType', initial: 'note' }),
    f('body', 'textarea', { required: true }),
    f('followUpDate', 'date'),
  ],
  columns: [
    { labelKey: 'clients.fields.type', cell: (r) => ({ text: `clients.noteType.${r.type}`, translate: true }) },
    { labelKey: 'clients.fields.body', cell: (r) => plain(r.body) },
    { labelKey: 'clients.fields.followUpDate', cell: (r, fmt) => plain(r.followUpDate ? fmt.date(r.followUpDate) : '') },
    { labelKey: 'clients.fields.createdBy', cell: (r) => plain(r.createdBy) },
    { labelKey: 'clients.fields.createdAt', cell: (r, fmt) => plain(fmt.dateTime(r.createdAt)) },
  ],
  label: (r) => r.body.slice(0, 40),
};
