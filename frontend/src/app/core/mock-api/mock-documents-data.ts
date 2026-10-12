import { DocumentRecord, DocumentRequest } from '../../features/documents/documents.models';
import { addDays, DEMO_TODAY } from './mock-clock';

/** Stored shape: the server derives clientName and expiryState when it answers. */
export type StoredDocument = Omit<DocumentRecord, 'clientName' | 'expiryState'>;
export type StoredRequest = Omit<DocumentRequest, 'overdue'>;

export interface DocumentStore {
  documents: StoredDocument[];
  requests: StoredRequest[];
  /** In-memory file bytes keyed by "documentId:version". Only the mock keeps files in memory. */
  blobs: Map<string, Blob>;
}

const PDF_TYPE = 'application/pdf';
const at = (day: number) => `2026-0${(day % 9) + 1}-1${day % 9}T09:00:00.000Z`;

/** DEMO ONLY. Fictional documents: tiny placeholder files, not real records. */
export function seedDocumentStore(): DocumentStore {
  const blobs = new Map<string, Blob>();
  const text = (label: string) => new Blob([`%PDF-1.4\n% DEMO placeholder: ${label}\n`], { type: PDF_TYPE });
  const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x44, 0x45, 0x4d, 0x4f])], { type: 'image/png' });
  const csv = () => new Blob(['date,amount\n2026-09-01,100.00\n'], { type: 'text/csv' });

  const make = (
    id: string,
    clientId: string,
    name: string,
    category: StoredDocument['category'],
    year: number,
    reviewStatus: StoredDocument['reviewStatus'],
    extra: Partial<StoredDocument> = {},
    kind: 'pdf' | 'png' | 'csv' = 'pdf',
    versions = 1,
  ): StoredDocument => {
    const mime = kind === 'pdf' ? PDF_TYPE : kind === 'png' ? 'image/png' : 'text/csv';
    const list = Array.from({ length: versions }, (_, i) => {
      const blob = kind === 'pdf' ? text(`${name} v${i + 1}`) : kind === 'png' ? png() : csv();
      blobs.set(`${id}:${i + 1}`, blob);
      return { version: i + 1, fileName: `${id}-v${i + 1}.${kind}`, mimeType: mime, sizeBytes: blob.size, uploadedBy: 'Demo Accountant', uploadedAt: at(Number(id.slice(2)) + i) };
    });
    return { id, clientId, name, category, year, tags: [], currentVersion: versions, versions: list, reviewStatus, reviewComments: [], ...extra };
  };

  const documents: StoredDocument[] = [
    make('d-001', 'c-003', 'DEMO Commercial register', 'onboarding', 2026, 'approved', { reviewComments: [{ id: 'rc-1', author: 'Demo Chief Accountant', decision: 'approved', comment: '', at: at(2) }] }),
    make('d-002', 'c-003', 'DEMO Tax card', 'onboarding', 2026, 'pending'),
    make('d-003', 'c-001', 'DEMO Bank statement September 2026', 'bookkeeping', 2026, 'pending', { periodLabel: '2026-09', tags: ['bank', 'monthly'] }, 'pdf', 2),
    make('d-004', 'c-001', 'DEMO VAT return Q3', 'tax', 2026, 'approved', { periodLabel: 'Q3', tags: ['vat'] }),
    make('d-005', 'c-001', 'DEMO Office lease contract', 'other', 2025, 'approved', { expiryDate: addDays(DEMO_TODAY, 12), description: 'DEMO lease, renew before it ends.' }),
    make('d-006', 'c-002', 'DEMO Payroll register August', 'payroll', 2026, 'rejected', {
      periodLabel: '2026-08',
      reviewComments: [{ id: 'rc-2', author: 'Demo Chief Accountant', decision: 'rejected', comment: 'DEMO: the totals do not match the bank transfer.', at: at(6) }],
    }),
    make('d-007', 'c-002', 'DEMO Insurance certificate', 'other', 2026, 'approved', { expiryDate: addDays(DEMO_TODAY, -5) }),
    make('d-008', 'c-006', 'DEMO Sales ledger export', 'bookkeeping', 2026, 'pending', { tags: ['export'] }, 'csv'),
    make('d-009', 'c-009', 'DEMO Annual accounts 2025', 'tax', 2025, 'approved'),
    make('d-010', 'c-005', 'DEMO Scan of representative ID', 'onboarding', 2024, 'pending', {}, 'png'),
  ];

  const requests: StoredRequest[] = [
    { id: 'r-1', clientId: 'c-001', label: 'DEMO Bank statement October 2026', dueDate: addDays(DEMO_TODAY, 10), status: 'open', requestedBy: 'Demo Accountant' },
    { id: 'r-2', clientId: 'c-001', label: 'DEMO Payroll sheet September 2026', dueDate: addDays(DEMO_TODAY, -3), status: 'open', requestedBy: 'Demo Accountant' },
    { id: 'r-3', clientId: 'c-003', label: 'DEMO ID of the authorized representative', dueDate: addDays(DEMO_TODAY, 5), status: 'open', requestedBy: 'Demo Accountant' },
  ];
  return { documents, requests, blobs };
}
