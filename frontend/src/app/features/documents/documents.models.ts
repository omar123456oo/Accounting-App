export const DOCUMENT_CATEGORIES = ['onboarding', 'bookkeeping', 'payroll', 'tax', 'other'] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Computed by the server from the expiry date and its business "today". */
export type ExpiryState = 'none' | 'valid' | 'expiring_soon' | 'expired';

export interface DocVersion {
  version: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
  sha256?: string;
}

export interface ReviewComment {
  id: string;
  author: string;
  decision: Exclude<ReviewStatus, 'pending'>;
  comment: string;
  at: string;
}

export interface DocumentRecord {
  id: string;
  clientId: string;
  /** Joined by the server so lists can show the client without a second call. */
  clientName: string;
  name: string;
  category: DocumentCategory;
  year: number;
  periodLabel?: string;
  tags: string[];
  description?: string;
  expiryDate?: string;
  currentVersion: number;
  versions: DocVersion[];
  reviewStatus: ReviewStatus;
  reviewComments: ReviewComment[];
  expiryState: ExpiryState;
}

export const REQUEST_STATUSES = ['open', 'fulfilled', 'cancelled'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export interface DocumentRequest {
  id: string;
  clientId: string;
  label: string;
  dueDate: string;
  status: RequestStatus;
  requestedBy: string;
  /** Set when an upload fulfils the request. */
  documentId?: string;
  /** True when the request is open and past its due date, as computed by the server. */
  overdue: boolean;
}

export interface DocumentListParams {
  page?: number;
  pageSize?: number;
  q?: string;
  clientId?: string;
  category?: DocumentCategory | '';
  year?: number | '';
  reviewStatus?: ReviewStatus | '';
  expiring?: boolean;
  sort?: string;
  dir?: 'asc' | 'desc';
}

/** Metadata sent with an upload, next to the file itself. */
export interface DocumentUploadInput {
  file: File;
  name: string;
  category: DocumentCategory;
  year: number;
  periodLabel?: string;
  tags?: string[];
  description?: string;
  expiryDate?: string;
  requestId?: string;
}

/** A client as offered in the document filters and the upload form. */
export interface AssignableClient {
  id: string;
  name: string;
}
