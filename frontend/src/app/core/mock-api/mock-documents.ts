import { Client } from '../../features/clients/client.models';
import { FileProblem, checkFile, sha256Hex } from '../../features/documents/file-validation';
import { DOCUMENT_CATEGORIES, DocumentRecord, DocumentRequest, ExpiryState } from '../../features/documents/documents.models';
import { addDays, mockToday } from './mock-clock';
import { MockClients } from './mock-clients';
import { Rules, validate } from './mock-clients-rules';
import { DocumentStore, StoredDocument, StoredRequest, seedDocumentStore } from './mock-documents-data';
import { MockMessageKey } from './mock-messages';
import { DocumentLookup } from './mock-onboarding';
import { MockModule, MockRequest, MockResult, clean, fail, invalid, need, ok, pageQuery, paged } from './mock-types';
import { DemoUser } from './mock-users';

/** Documents expiring within this many days are flagged "expiring soon". */
const EXPIRY_WARNING_DAYS = 30;
const SORTABLE = ['name', 'clientName', 'category', 'year', 'uploadedAt', 'expiryDate', 'reviewStatus'] as const;
const FILE_ERROR: Record<FileProblem, MockMessageKey> = { empty: 'fileEmpty', tooLarge: 'fileTooLarge', extension: 'fileType', mime: 'fileMime', signature: 'fileSignature' };

const UPLOAD_RULES: Rules = {
  name: { kind: 'text', required: true },
  category: { kind: DOCUMENT_CATEGORIES, required: true },
  year: { kind: 'digits', required: true },
  periodLabel: { kind: 'text' },
  description: { kind: 'text' },
  expiryDate: { kind: 'date' },
  requestId: { kind: 'text' },
};
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * In-memory document repository. Files live as Blobs in memory only in this mock. Every rule here is one the
 * real server must apply itself, including re-validating the bytes and running the malware scan: the browser's
 * checks are a convenience, never a control.
 */
export class MockDocuments implements MockModule, DocumentLookup {
  private readonly store: DocumentStore = seedDocumentStore();
  private seq = 100;

  constructor(private readonly clients: MockClients) {}

  exists(documentId: string, clientId: string): boolean {
    return this.store.documents.some((d) => d.id === documentId && d.clientId === clientId);
  }

  /** Counts for other modules (dashboard-style lookups): documents the user may see. */
  visibleDocuments(user: DemoUser): StoredDocument[] {
    return this.store.documents.filter((d) => !!this.clients.find(d.clientId, user));
  }

  handle(req: MockRequest, user: DemoUser): MockResult | Promise<MockResult> {
    if (user.profile.type !== 'staff') return fail(403, 'forbidden');
    const parts = req.path.split('/');
    if (parts[0] === 'clients') return this.forClient(req, user, parts[1], parts[2]);
    if (parts[0] === 'document-requests' && req.method === 'PATCH' && parts[1]) return this.updateRequest(req, user, parts[1]);
    if (parts[0] !== 'documents') return fail(404, 'notFound');
    const [, id, sub] = parts;
    if (!id) return req.method === 'GET' ? (need(user, 'documents.view') ?? this.list(req.query, user)) : fail(405, 'notFound');
    const doc = this.store.documents.find((d) => d.id === id);
    const visible = doc && this.clients.find(doc.clientId, user) ? doc : undefined;
    if (!visible) return need(user, 'documents.view') ?? fail(404, 'notFound');
    if (!sub && req.method === 'GET') return need(user, 'documents.view') ?? ok({ data: this.dto(visible) });
    if (sub === 'download' && req.method === 'GET') return need(user, 'documents.view') ?? this.download(visible, req.query);
    if (sub === 'versions' && req.method === 'POST') return need(user, 'documents.upload') ?? this.addVersion(visible, req.body, user);
    if (sub === 'review' && req.method === 'POST') return need(user, 'documents.review') ?? this.review(visible, req.body, user);
    return fail(404, 'notFound');
  }

  private forClient(req: MockRequest, user: DemoUser, clientId: string, resource: string): MockResult | Promise<MockResult> {
    const client = this.clients.find(clientId, user);
    if (resource === 'documents') {
      const permission = req.method === 'GET' ? 'documents.view' : 'documents.upload';
      const denied = need(user, permission);
      if (denied) return denied;
      if (!client) return fail(404, 'notFound');
      if (req.method === 'GET') return this.list(req.query, user, client.id);
      return req.method === 'POST' ? this.upload(client, req.body, user) : fail(405, 'notFound');
    }
    if (resource === 'document-requests') {
      const denied = need(user, req.method === 'GET' ? 'documents.view' : 'documents.upload');
      if (denied) return denied;
      if (!client) return fail(404, 'notFound');
      if (req.method === 'GET') return ok({ data: this.store.requests.filter((r) => r.clientId === client.id).map((r) => this.requestDto(r)) });
      return req.method === 'POST' ? this.createRequest(client, req.body, user) : fail(405, 'notFound');
    }
    return fail(404, 'notFound');
  }

  private expiryState(doc: StoredDocument): ExpiryState {
    if (!doc.expiryDate) return 'none';
    const today = mockToday();
    if (doc.expiryDate < today) return 'expired';
    return doc.expiryDate <= addDays(today, EXPIRY_WARNING_DAYS) ? 'expiring_soon' : 'valid';
  }

  private dto(doc: StoredDocument): DocumentRecord {
    return structuredClone({ ...doc, clientName: this.clients.clientName(doc.clientId), expiryState: this.expiryState(doc) });
  }

  private requestDto(r: StoredRequest): DocumentRequest {
    return { ...r, overdue: r.status === 'open' && r.dueDate < mockToday() };
  }

  private list(q: URLSearchParams, user: DemoUser, onlyClient?: string): MockResult {
    const p = pageQuery(q);
    const term = (q.get('q') ?? '').trim().toLowerCase();
    const clientId = onlyClient ?? q.get('clientId');
    const year = Number(q.get('year')) || 0;
    const sort = (SORTABLE as readonly string[]).includes(q.get('sort') ?? '') ? (q.get('sort') as (typeof SORTABLE)[number]) : 'uploadedAt';
    const key = (d: DocumentRecord): string =>
      sort === 'uploadedAt' ? (d.versions.at(-1)?.uploadedAt ?? '') : String((d as unknown as Record<string, unknown>)[sort] ?? '');
    const defaultDir = q.get('sort') ? p.dir : -1;
    const rows = this.visibleDocuments(user)
      .map((d) => this.dto(d))
      .filter((d) => !clientId || d.clientId === clientId)
      .filter((d) => !q.get('category') || d.category === q.get('category'))
      .filter((d) => !year || d.year === year)
      .filter((d) => !q.get('reviewStatus') || d.reviewStatus === q.get('reviewStatus'))
      .filter((d) => q.get('expiring') !== 'true' || d.expiryState === 'expiring_soon' || d.expiryState === 'expired')
      .filter((d) => !term || [d.name, d.clientName, d.description, d.periodLabel, ...d.tags, ...d.versions.map((v) => v.fileName)].some((v) => v?.toLowerCase().includes(term)))
      .sort((a, b) => defaultDir * key(a).localeCompare(key(b)) || a.id.localeCompare(b.id));
    return paged(rows, { ...p, dir: defaultDir as 1 | -1 });
  }

  private download(doc: StoredDocument, q: URLSearchParams): MockResult {
    const version = q.get('version') ? Number(q.get('version')) : doc.currentVersion;
    const blob = this.store.blobs.get(`${doc.id}:${version}`);
    return blob ? { status: 200, body: blob } : fail(404, 'notFound');
  }

  /** Server-side checks on the received bytes. The malware scan would run here too; the mock cannot scan. */
  private async fileProblem(body: Record<string, unknown>): Promise<MockResult | null> {
    const file = body['file'];
    if (!(file instanceof Blob)) return invalid({ file: ['required'] });
    const problem = await checkFile(file, file instanceof File ? file.name : '');
    return problem ? invalid({ file: [FILE_ERROR[problem]] }) : null;
  }

  private async upload(client: Client, body: Record<string, unknown>, user: DemoUser): Promise<MockResult> {
    const errors = validate(body, UPLOAD_RULES, false);
    const year = Number(body['year']);
    if (!errors['year'] && (year < 2000 || year > 2100)) errors['year'] = ['invalidNumber'];
    const request = body['requestId'] ? this.store.requests.find((r) => r.id === body['requestId'] && r.clientId === client.id && r.status === 'open') : undefined;
    if (body['requestId'] && !request) errors['requestId'] = ['invalidChoice'];
    const fileError = await this.fileProblem(body);
    if (fileError?.errors) Object.assign(errors, fileError.errors);
    if (Object.keys(errors).length) return invalid(errors);
    const file = body['file'] as File;
    const tags = Array.isArray(body['tags']) ? (body['tags'] as unknown[]).map(text).filter(Boolean) : [];
    const doc: StoredDocument = clean({
      id: `d-${++this.seq}`,
      clientId: client.id,
      name: text(body['name']),
      category: body['category'] as StoredDocument['category'],
      year,
      periodLabel: text(body['periodLabel']) || undefined,
      tags,
      description: text(body['description']) || undefined,
      expiryDate: text(body['expiryDate']) || undefined,
      currentVersion: 0,
      versions: [],
      reviewStatus: 'pending' as const,
      reviewComments: [],
    });
    await this.pushVersion(doc, file, user);
    this.store.documents.push(doc);
    if (request) Object.assign(request, { status: 'fulfilled', documentId: doc.id });
    return ok({ data: this.dto(doc) }, 201);
  }

  private async addVersion(doc: StoredDocument, body: Record<string, unknown>, user: DemoUser): Promise<MockResult> {
    const fileError = await this.fileProblem(body);
    if (fileError) return fileError;
    await this.pushVersion(doc, body['file'] as File, user);
    // A new version has not been looked at yet, whatever the earlier version's verdict was.
    doc.reviewStatus = 'pending';
    return ok({ data: this.dto(doc) }, 201);
  }

  private async pushVersion(doc: StoredDocument, file: File, user: DemoUser): Promise<void> {
    const version = doc.currentVersion + 1;
    const sha256 = await sha256Hex(file);
    doc.versions.push(clean({ version, fileName: file.name, mimeType: file.type, sizeBytes: file.size, uploadedBy: user.profile.name, uploadedAt: new Date().toISOString(), sha256 }));
    doc.currentVersion = version;
    this.store.blobs.set(`${doc.id}:${version}`, file);
  }

  private review(doc: StoredDocument, body: Record<string, unknown>, user: DemoUser): MockResult {
    const decision = body['decision'];
    if (decision !== 'approved' && decision !== 'rejected') return invalid({ decision: ['invalidChoice'] });
    if (doc.reviewStatus !== 'pending') return fail(409, 'alreadyDecided');
    const comment = text(body['comment']);
    if (decision === 'rejected' && !comment) return invalid({ comment: ['required'] });
    doc.reviewStatus = decision;
    doc.reviewComments.push({ id: `rc-${++this.seq}`, author: user.profile.name, decision, comment, at: new Date().toISOString() });
    return ok({ data: this.dto(doc) });
  }

  private createRequest(client: Client, body: Record<string, unknown>, user: DemoUser): MockResult {
    const errors = validate(body, { label: { kind: 'text', required: true }, dueDate: { kind: 'date', required: true } }, false);
    if (Object.keys(errors).length) return invalid(errors);
    const request: StoredRequest = { id: `r-${++this.seq}`, clientId: client.id, label: text(body['label']), dueDate: text(body['dueDate']), status: 'open', requestedBy: user.profile.name };
    this.store.requests.push(request);
    return ok({ data: this.requestDto(request) }, 201);
  }

  private updateRequest(req: MockRequest, user: DemoUser, id: string): MockResult {
    const denied = need(user, 'documents.upload');
    if (denied) return denied;
    const request = this.store.requests.find((r) => r.id === id);
    if (!request || !this.clients.find(request.clientId, user)) return fail(404, 'notFound');
    if (req.body['status'] !== 'cancelled' && req.body['status'] !== 'fulfilled') return invalid({ status: ['invalidChoice'] });
    if (request.status !== 'open') return fail(409, 'conflict');
    request.status = req.body['status'];
    return ok({ data: this.requestDto(request) });
  }
}

