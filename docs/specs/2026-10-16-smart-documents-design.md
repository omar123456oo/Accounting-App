---
title: "Smart documents: design"
status: "implementation"
---

# Smart documents: design

Upload a PDF, extract its text (OCR when needed), have an AI service propose field values, let a person review and approve them, then track the document's lifecycle and send reminders before its dates.

## Findings from the existing code

| Area | Finding | Consequence |
|---|---|---|
| Documents today | `frontend/features/documents` runs on the mock API only and is client-centred. `backend-mongo` has no document code. | The new module is a **real backend** under `/api/v1/staff/docs` and new screens under `/app/smart-documents`. The mock Documents screens are untouched. |
| Auth and permissions | Cookie session, CSRF, `can('perm')` middleware, `roleMatrix()` in `db/permissions.ts`. | Reuse. New permissions added to the matrix; `npm run db:sync-roles` updates existing offices. |
| Tenancy | `organizationId` on every document, taken from the session. | Every query is scoped with it. |
| Audit | `appendAudit` hash chain. | Reused for every important change. |
| Notifications | `Notification` model in `core/workflow.models.ts`, listed by `/core/notifications`. No e-mail, no scheduler (escalation is a cron script). | Reuse `Notification` for in-app messages; add a delivery log for e-mail; add an in-process scheduler plus a CLI. |
| HR | `Employee` (optional `userId`, `managerId`, `departmentId`), `Department`. | Documents link to employees and departments; a recipient's manager comes from `Employee.managerId`. |
| Files | No storage layer. docker-compose has MinIO. | `FileStore` interface with a local-disk implementation; S3/MinIO is a later implementation of the same interface. |
| Dependencies | No upload, PDF, OCR or mail library. | Added `multer`, `pdfjs-dist`, `tesseract.js`, `@napi-rs/canvas`, `nodemailer`; `pdf-lib` for tests only. |

## Collections (Mongoose, all tenant-scoped)

| Collection | Purpose |
|---|---|
| `docdocumenttypes` | Type definitions: key, label, field schema (type, required, active, order, options, sensitive, semantic `role`), keywords, lifecycle rules. |
| `docdocuments` | The document: type, lifecycle `status`, `extractionStatus`, `reminderStatus`, owner, employee, department, related record, approved `values`, derived dates, current version, content hash. |
| `docversions` | One row per uploaded file: storage key, hash, size, pages, uploader. The first row is the original. |
| `docextractions` | One per extraction run: steps, per-page text and method, detected type, per-field raw and normalized value, confidence, page, supporting text, bbox, review decision. |
| `docjobs` | Processing queue (extract). Leased, retried with backoff. |
| `docreminderrules` | Rules scoped global, type or document. |
| `docreminderjobs` | One scheduled send per document, rule and occurrence. Unique idempotency key. |
| `docdeliveries` | One row per user and channel: status, provider message id, error. Unique idempotency key. |

Large files are never stored in MongoDB: only the storage key.

## Statuses (separate concepts)

- **Document status:** `uploaded, processing, extraction_failed, pending_review, approved, active, expiring_soon, expired, renewal_in_progress, renewed, archived`. Transitions are a table in `lifecycle.ts`.
- **Extraction status:** `queued, running, succeeded, text_only (no AI configured), needs_ocr, failed`.
- **Reminder status:** `none, scheduled, partially_sent, completed, cancelled`.

Extraction never approves. `pending_review` stays until a person with `documents.review` approves. Approved values are changed only by a person; a new extraction never overwrites them.

## Extraction pipeline

validate (magic bytes, size, active-content scan) → embedded text per page (pdf.js) → classify pages (scanned when almost no text) → OCR scanned pages when an OCR provider is configured → detect type (user choice, else AI when configured, else keyword score, else none) → AI field extraction (text only, schema-bound, structured JSON) → ground each value (its quoted text must appear on the stated page, else the value is dropped as not found) → normalize → validate → store → `pending_review`.

No AI key: the text path still runs and the document opens for manual entry with a clear "AI not configured" state. No value is ever invented.

## Reminders

Rules are persisted; **due dates are computed on the backend** in the rule's timezone (DST-safe). Jobs are persisted and claimed with a lease, so a restart or a second instance neither loses nor duplicates them. Idempotency keys: job = `doc:rule:targetDate:occurrence`, delivery = `job:user:channel`. Changing a date, replacing, renewing, archiving or deleting a document reconciles its pending jobs. Escalation is a second job that fires if the reminder was not acknowledged. The scheduler is an in-process loop (`DOCS_SCHEDULER`) and `npm run docs:tick` for cron.

## API (`/api/v1/staff/docs`)

Documents: `GET/POST documents`, `GET/PATCH/DELETE documents/:id`, `GET documents/:id/file`, `POST documents/:id/versions`, `GET documents/:id/versions`, `POST documents/:id/extract`, `GET documents/:id/extraction`, `PUT documents/:id/review`, `POST documents/:id/approve`, `POST documents/:id/transition`, `POST documents/:id/renew`, `POST documents/:id/complete-renewal`, `GET documents/:id/history`.
Types: `GET/POST types`, `GET/PATCH types/:key`, `GET/PUT types/:key/fields`.
Reminders: `GET/POST reminder-rules`, `PATCH/DELETE reminder-rules/:id`, `GET reminders/upcoming`, `POST reminders/:id/acknowledge`, `POST reminders/:id/retry`.
Notifications: `GET notifications/history`.
Dashboard: `GET dashboard`. Status: `GET config` (which providers are configured).

## Permissions added

`documents.download`, `documents.edit`, `documents.archive`, `documents.delete`, `documents.manage` (types, fields, reminder rules), `documents.sensitive` (fields marked sensitive). Existing `documents.view`, `documents.upload`, `documents.review` keep their meaning.
