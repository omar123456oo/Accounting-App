---
title: "Smart documents"
id: "SMARTDOC-MODULE-001"
module: "Smart documents"
document_type: "module-guide"
status: "active"
verification_status: "backend-tested, screens unit-tested"
source_of_truth: "application-source-code"
last_verified: "2026-10-16"
---

# Smart documents

Upload a PDF; the server reads it (OCR for scanned pages), an AI service proposes field values, a person reviews and approves them, and the system tracks the document's lifecycle and sends reminders before its dates. Design notes: [the design](../../specs/2026-10-16-smart-documents-design.md).

## What is real

This module has a **real backend** (`backend-mongo/src/docs/`, mounted at `/api/v1/staff/docs`) and screens at `/app/smart-documents`. The older Documents screens (`/app/documents`) are client-centred and run on the mock API; they are unchanged. The smart screens need the real API and are hidden while the app runs on the mock API (`npm run start:api`, or `npm run dev:memory` in `backend-mongo` for a throwaway database).

## Implementation status

| Capability | Status |
|---|---|
| Upload PDF (drag and drop, progress, type and size checks, active-content refusal, duplicate detection by SHA-256) | Implemented, tested |
| Original stored byte for byte on disk; only a key in MongoDB | Implemented, tested |
| Versions (replace file), download, preview | Implemented, tested |
| Text extraction with positions (pdf.js) | Implemented, tested |
| OCR for scanned pages (Tesseract) | Implemented. Off by default (`DOCS_OCR_PROVIDER=tesseract` turns it on). Real run checked once on an image-only PDF |
| AI field extraction (Anthropic Messages API, structured output) | Implemented behind a provider interface; **tested with a fake provider only**: no API key was available. Off until `ANTHROPIC_API_KEY` is set |
| Grounding: a value is used only if the quoted evidence is on the page and contains the value | Implemented, tested |
| Normalisation (dates incl. Arabic digits, numbers, currency, national ID) and validation | Implemented, tested |
| Configurable types and fields (add, reorder, require, deactivate, sensitive, roles) | Implemented, tested |
| Dynamic review form, accept/reject/edit, draft resume, source page and text | Implemented, unit-tested |
| Lifecycle with a transition table; expiry statuses from authoritative dates | Implemented, tested |
| Reminder rules (global, type, document), offsets, recurrence, time zone, recipients, channels, escalation | Implemented, tested |
| Persistent scheduler (lease-based, restart safe, idempotent), retries, backoff | Implemented, tested |
| In-app notifications and e-mail (SMTP) with delivery log | Implemented, tested with a fake mail server; real SMTP not exercised |
| Dashboard on real data, filters, upcoming reminders, notification history | Implemented, tested |
| Permissions, restricted documents, sensitive fields, audit trail | Implemented, tested |
| S3 / MinIO file store | **Not built.** `FileStore` is an interface; only local disk exists |
| Bounding-box highlight drawn on the PDF | **Not built.** Coordinates are stored; the screen jumps to the page and shows the supporting text |
| Embedding the new fields in the older Documents screens | Not built |

## How processing works

1. **Upload** validates the file, stores it, creates the document (`uploaded`) and queues a job.
2. The **worker** (inside the API process, or `npm run docs:tick`) claims the job: validate → embedded text → OCR of scanned pages → detect type (your choice, else AI, else keyword score) → AI extraction → ground → normalise → validate → save. The document becomes `pending_review`.
3. A reviewer opens **Review**: the form is pre-filled with proposals; fields with low confidence, warnings or no confidence are highlighted. They accept, edit or reject each one, save a draft, and **approve**. Only approval writes the values to the document; a later extraction never overwrites them.
4. Status then follows the dates: `active`, `expiring_soon` (within the type's window), `expired` (the day after the expiry date).
5. **Reminders** are scheduled from the approved dates.

No AI key: step 3 of the pipeline is skipped; the text is still read, every field is "not found" and the reviewer enters values by hand. The screens say so. Nothing is invented.

## Statuses

Three separate things are tracked.

- **Document status:** `uploaded, processing, extraction_failed, pending_review, approved, active, expiring_soon, expired, renewal_in_progress, renewed, archived`. Allowed moves are the table in `backend-mongo/src/docs/lifecycle.ts`.
- **Extraction status:** `none, queued, running, succeeded, text_only, needs_ocr, failed`.
- **Reminder status:** `none, scheduled, partially_sent, completed, cancelled`.

## Reminders

- A rule names the **date** it counts from (a field key or a role such as `expiry_date`), one or more **offsets** (minutes, hours, days, weeks, months; before or after), an optional **repeat**, a **time of day and time zone**, **recipients** (named users, roles, the document owner, their manager) and **channels** (in-app, e-mail), optional **escalation** and message text with placeholders `{title} {type} {date} {days} {when} {field} {label} {status} {link}`.
- Rules apply per office, per document type or per document. A rule in "replace" mode overrides wider rules for the documents it covers.
- Due times are computed on the server in the rule's time zone, correct across daylight-saving changes. A reminder whose time had already passed when it was scheduled is recorded as skipped, not sent late.
- Jobs are keyed by document, rule, date and send time, so scheduling twice never duplicates. Deliveries are keyed by job, user and channel.
- Changing a date, replacing the file, renewing, archiving or deleting reconciles the pending jobs. Sent reminders stay as history.
- Recipients who may not view documents are never addressed, whatever a rule says.
- "E-mail delivered" means the mail server accepted the message. If SMTP is not configured the delivery is recorded as **not sent**, never as sent.
- Escalation: if a sent reminder is not acknowledged within the set hours, a second reminder goes to the escalation targets.

## API (`/api/v1/staff/docs`)

| Area | Endpoints |
|---|---|
| Status | `GET config`, `GET lookups`, `GET dashboard` |
| Documents | `GET/POST documents`, `GET/PATCH/DELETE documents/:id`, `GET documents/:id/file[?version=&inline=1]`, `GET/POST documents/:id/versions`, `GET documents/:id/history` |
| Extraction and review | `GET documents/:id/extraction`, `GET documents/:id/extraction/pages/:n`, `POST documents/:id/extract`, `PUT documents/:id/review`, `POST documents/:id/approve` |
| Lifecycle | `POST documents/:id/transition` (archive; manual entry after a failure), `POST documents/:id/renew`, `POST documents/:id/complete-renewal` |
| Types | `GET/POST types`, `GET/PATCH types/:key`, `PUT types/:key/fields` |
| Reminders | `GET/POST reminder-rules`, `PATCH/DELETE reminder-rules/:id`, `GET documents/:id/reminder-rules`, `GET reminders`, `POST reminders/:id/acknowledge`, `POST reminders/:id/retry`, `GET notifications/history` |

## Permissions

| Permission | Allows |
|---|---|
| `documents.view` | List and open documents, preview the file, see reminders |
| `documents.upload` | Upload, replace the file |
| `documents.download` | Download the file |
| `documents.edit` | Edit details and approved values, read again, start a renewal |
| `documents.review` | Review, approve, complete a renewal, read the evidence page text |
| `documents.archive` / `documents.delete` | Archive / delete |
| `documents.manage` | Types, fields and reminder rules; sees every document including restricted ones |
| `documents.sensitive` | See and change fields marked sensitive |

After upgrading, run `npm run db:sync-roles` in `backend-mongo` so existing offices get the new permissions. A restricted document, or one about an employee, answers 404 to people without a tie to it (creator, owner, reviewer, HR access or `documents.manage`). Sensitive values never enter the audit trail.

## Configuration

| Variable | Meaning | Default |
|---|---|---|
| `DOCS_STORAGE_DIR` | Where originals live. Use a persistent, backed-up path | `./storage/documents` |
| `DOCS_MAX_UPLOAD_MB`, `DOCS_MAX_PAGES` | Upload limits | 20, 200 |
| `DOCS_AI_PROVIDER`, `ANTHROPIC_API_KEY`, `DOCS_AI_MODEL` | AI extraction. Without a key it is off | `anthropic`, empty, `claude-sonnet-5-5` |
| `DOCS_AI_REDACT_SENSITIVE` | Do not ask the AI for sensitive fields and mask long digit runs in the text it receives | `false` |
| `DOCS_OCR_PROVIDER`, `DOCS_OCR_LANGS`, `DOCS_OCR_LANG_PATH` | OCR. `tesseract` needs language data (downloaded on first use, cached under the storage directory, unless you supply a folder) | `none`, `eng+ara` |
| `DOCS_SCHEDULER`, `DOCS_TICK_MS` | Run the worker and scheduler inside the API | `true`, 30000 |
| `DOCS_TIMEZONE` | The office clock for "today" and the default time zone of new rules | `Africa/Cairo` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | E-mail. Empty host = e-mail off | empty |
| `APP_URL` | Base of the links in reminders | `http://localhost:4200` |

**Data sent to the AI provider:** only the page text (capped by `DOCS_AI_MAX_CHARS`), the field names and hints of the chosen type, and the type labels. Never the PDF, user names, ids or other records. The key stays on the server.

## Operating

- **Without the in-process scheduler** set `DOCS_SCHEDULER=false` and run `npm run docs:tick` every minute from cron. Several instances are safe: work is claimed with leases.
- **After a crash** a job or reminder whose lease expired is taken again. Nothing is lost and nothing is sent twice.
- **Diagnose:** Reminders → Failed shows the error; **Retry** puts it back. A failed extraction shows its steps and error under History; **Read again** retries it.
- **Backups:** include `DOCS_STORAGE_DIR` with the database dump. MongoDB holds the metadata, not the files.
- **Deleting** a document hides it and cancels its reminders; the file and audit trail are kept.

## Tests

```bash
cd backend-mongo && npm run docs:check      # upload, extraction, review, lifecycle, reminders, e-mail, permissions
cd frontend && npx ng test --include='src/app/features/smart-docs/**/*.spec.ts'
```

`docs:check` runs on an in-memory MongoDB with a fake AI service, fake OCR and fake mail server, and needs no network.
