export const CLIENT_STATUSES = ['lead', 'onboarding', 'active', 'suspended', 'closed'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const LEGAL_FORMS = ['individual', 'company', 'sole_proprietor', 'partnership', 'other'] as const;
export type LegalForm = (typeof LEGAL_FORMS)[number];

export interface TaxProfile {
  vatRegistered: boolean;
  /** Free label; the legal tax classification needs specialist confirmation. */
  taxType: string;
}

export interface Client {
  id: string;
  legalName: string;
  tradeName?: string;
  legalForm: LegalForm;
  commercialRegistrationNo?: string;
  taxRegistrationNo?: string;
  address: string;
  industry?: string;
  /** 1 (January) to 12 (December). */
  fiscalYearStartMonth: number;
  taxProfile?: TaxProfile;
  status: ClientStatus;
  assignedAccountantIds: string[];
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

/** Fields the create/edit form sends; the server owns id, status on create, timestamps and archive state. */
export type ClientInput = Omit<Client, 'id' | 'createdAt' | 'updatedAt' | 'archived' | 'status'> & { status?: ClientStatus };

export interface ClientContact {
  id: string;
  clientId: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  isAuthorizedRepresentative: boolean;
}

export interface ClientBranch {
  id: string;
  clientId: string;
  name: string;
  address: string;
}

export interface ClientBankAccount {
  id: string;
  clientId: string;
  bankName: string;
  accountNo: string;
  iban?: string;
  currency: string;
}

export const AGREEMENT_STATUSES = ['draft', 'active', 'expired', 'terminated'] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export interface ServiceAgreement {
  id: string;
  clientId: string;
  startDate: string;
  endDate: string;
  renewalDate: string;
  /** Decimal string such as "1500.00". Never converted to a JS number. */
  monthlyFee: string;
  status: AgreementStatus;
}

export const NOTE_TYPES = ['call', 'meeting', 'email', 'note'] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export interface CommunicationNote {
  id: string;
  clientId: string;
  type: NoteType;
  body: string;
  followUpDate?: string;
  createdBy: string;
  createdAt: string;
}

export interface ClientChangeEvent {
  id: string;
  clientId: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedAt: string;
}

export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface ClientListParams {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: ClientStatus | '';
  legalForm?: LegalForm | '';
  sort?: string;
  dir?: 'asc' | 'desc';
  includeArchived?: boolean;
}

export interface AssignableUser {
  id: string;
  name: string;
}

export type SubResource = 'contacts' | 'branches' | 'bank-accounts' | 'agreements' | 'notes';
