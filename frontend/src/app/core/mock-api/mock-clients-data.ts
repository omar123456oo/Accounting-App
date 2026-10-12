import {
  Client,
  ClientBankAccount,
  ClientBranch,
  ClientChangeEvent,
  ClientContact,
  ClientStatus,
  CommunicationNote,
  LegalForm,
  ServiceAgreement,
} from '../../features/clients/client.models';

/** DEMO ONLY. Every client is fictional and its name starts with "DEMO". Numbers below are not real registrations. */

export interface ClientStore {
  clients: Client[];
  contacts: ClientContact[];
  branches: ClientBranch[];
  'bank-accounts': ClientBankAccount[];
  agreements: ServiceAgreement[];
  notes: CommunicationNote[];
  history: ClientChangeEvent[];
}

type Seed = [string, string | undefined, LegalForm, ClientStatus, string, string[], number, string];

const SEEDS: Seed[] = [
  ['DEMO Nile Trading Co.', 'DEMO Nile', 'company', 'active', 'Trading', ['u-accountant'], 1, 'Demo Street 1, Cairo'],
  ['DEMO شركة النيل للتجارة', 'DEMO النيل', 'company', 'active', 'تجارة', ['u-accountant'], 7, 'شارع تجريبي 2، القاهرة'],
  ['DEMO Delta Farms', undefined, 'partnership', 'onboarding', 'Agriculture', ['u-accountant'], 7, 'Demo Road 3, Mansoura'],
  ['DEMO مكتب الأمل الهندسي', 'DEMO الأمل', 'sole_proprietor', 'lead', 'هندسة', [], 1, 'شارع تجريبي 4، الإسكندرية'],
  ['DEMO Sinai Tourism', 'DEMO Sinai', 'company', 'suspended', 'Tourism', [], 1, 'Demo Avenue 5, Sharm'],
  ['DEMO Ahmed Demo (individual)', undefined, 'individual', 'active', 'Consulting', ['u-accountant'], 1, 'Demo Lane 6, Giza'],
  ['DEMO مصنع الدلتا للأغذية', 'DEMO الدلتا', 'company', 'onboarding', 'تصنيع غذائي', [], 7, 'المنطقة الصناعية التجريبية 7، طنطا'],
  ['DEMO Pyramid Logistics', undefined, 'company', 'closed', 'Logistics', [], 1, 'Demo Port 8, Suez'],
  ['DEMO Alex Pharmacy', undefined, 'sole_proprietor', 'active', 'Healthcare', [], 1, 'Demo Corniche 9, Alexandria'],
  ['DEMO جمعية النور التجريبية', undefined, 'other', 'lead', 'خدمات اجتماعية', [], 1, 'شارع تجريبي 10، أسيوط'],
  ['DEMO Luxor Crafts', 'DEMO Crafts', 'partnership', 'active', 'Retail', [], 7, 'Demo Market 11, Luxor'],
  ['DEMO Red Sea Divers', undefined, 'company', 'lead', 'Tourism', [], 1, 'Demo Marina 12, Hurghada'],
];

function stamp(i: number): string {
  return `2026-0${(i % 9) + 1}-1${i % 9}T09:00:00.000Z`;
}

export function seedClientStore(): ClientStore {
  const store: ClientStore = { clients: [], contacts: [], branches: [], 'bank-accounts': [], agreements: [], notes: [], history: [] };
  SEEDS.forEach(([legalName, tradeName, legalForm, status, industry, assigned, month, address], i) => {
    const id = `c-${String(i + 1).padStart(3, '0')}`;
    store.clients.push({
      id,
      legalName,
      ...(tradeName ? { tradeName } : {}),
      legalForm,
      commercialRegistrationNo: `${100000 + i}`,
      taxRegistrationNo: `${900000000 + i}`,
      address,
      industry,
      fiscalYearStartMonth: month,
      taxProfile: { vatRegistered: i % 2 === 0, taxType: 'DEMO' },
      status,
      assignedAccountantIds: assigned,
      createdAt: stamp(i),
      updatedAt: stamp(i),
      archived: false,
    });
    store.contacts.push({
      id: `ct-${i + 1}`,
      clientId: id,
      name: `DEMO Contact ${i + 1}`,
      role: 'Finance manager',
      email: `contact${i + 1}@demo.test`,
      phone: `+20 100 000 ${String(1000 + i)}`,
      isAuthorizedRepresentative: i % 3 === 0,
    });
    store['bank-accounts'].push({
      id: `ba-${i + 1}`,
      clientId: id,
      bankName: 'DEMO Bank',
      accountNo: `00112233${String(4000 + i)}`,
      currency: 'EGP',
    });
  });
  store.agreements.push({
    id: 'ag-1',
    clientId: 'c-001',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    renewalDate: '2026-11-15',
    monthlyFee: '1500.50',
    status: 'active',
  });
  store.notes.push({
    id: 'n-1',
    clientId: 'c-001',
    type: 'call',
    body: 'DEMO note: discussed the monthly closing schedule.',
    followUpDate: '2026-11-01',
    createdBy: 'Demo Owner',
    createdAt: '2026-09-01T10:00:00.000Z',
  });
  return store;
}
