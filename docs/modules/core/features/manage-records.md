---
title: "Manage Records of a Document Type"
id: "CORE-FEATURE-004"
module: "Core"
document_type: "feature-guide"
status: "active"
verification_status: "partial"
source_of_truth: "application-source-code"
last_verified: "2026-10-14"
---

# Manage Records of a Document Type

## Purpose

Create, view, change, delete and list the records of an admin-made document type. The form is drawn from the type's current field list, so custom fields added in [Customize](customize-doctype.md) appear immediately.

## Users and permissions

- View and list: holders of the type's `viewPermission`. A person without it gets 404 (the type is invisible to them).
- Create, change, delete: holders of the type's `managePermission`, otherwise 403. Backend enforced; the screen only hides the buttons using the `canManage` hint.

## Navigation path

**Document types** (sidebar) → **Records** on a custom type → list at `/app/records/<type>`; **New** opens `/app/records/<type>/new`; a row opens `/app/records/<type>/<name>`. Search results for records open the same page.

## Operations (API under `/api/v1/staff/core`)

| Call | Result |
|---|---|
| `GET /api/v1/staff/core/records/:doctype` | Page of records, newest first; `q` filters by name or search fields (literal match), `page`, `pageSize` (max 100) |
| `GET /api/v1/staff/core/records/:doctype/:name` | One record |
| `POST /api/v1/staff/core/records/:doctype` | Creates a record; the name is generated as `<TYPE>-000001`, sequential per type and organization |
| `PUT /api/v1/staff/core/records/:doctype/:name` | Changes the fields sent; `null` clears an optional field |
| `DELETE /api/v1/staff/core/records/:doctype/:name` | Deletes the record |

Built-in types (for example `leave_request`) answer 404 here: they have their own APIs.

## Fields and validation

Body: `{ "data": { fieldname: value } }`. Every problem is returned at once as HTTP 422 under `errors["data.<fieldname>"]`; nothing is saved when anything is wrong.

| Field type | Accepted value |
|---|---|
| text | string, trimmed, at most 2000 characters |
| number | finite number |
| currency | finite number with at most two decimal places |
| date | `YYYY-MM-DD`, a real calendar date |
| checkbox | `true` or `false` |
| select | one of the field's options |
| link | a string; if the target is another admin-made type, that record must exist (a link to any other target is not checked) |

Also: unknown fields are rejected; required fields (built-in or custom) must be present and non-blank, on update too; hidden fields are accepted by the API but not drawn by the form (and never sent by it).

## Audit

`record.create`, `record.update`, `record.delete` events are appended to the audit chain.

## Screens

- **List:** columns are the first four visible fields; search box (250 ms pause), previous/next, "New" only when the person may manage.
- **Form:** inputs by field type, required marked with `*`, field-level server errors shown under the right input, read-only (inputs disabled, no Save) when the person may not manage, Delete asks for confirmation.

## Known limitations

- No workflow or approval states, no attachments, comments or history on records yet.
- An update replaces what it was given without checking whether someone else changed the record meanwhile (last write wins).
- Links are plain text boxes, not pickers.
- Server validation messages for these routes are English only.
- Deleting a record does not check whether other records link to it.

## Technical references

Backend: `backend-mongo/src/core/records.routes.ts`, `models.ts` (`DocRecord`, `DocCounter`). Frontend: `frontend/src/app/features/core/` (`record-list.ts`, `record-form.ts`, `record-form-model.ts`, `core-api.service.ts`).

## Verification

| Behaviour | Evidence (2026-10-14) |
|---|---|
| All API rules above, concurrency of names (5 parallel creates gave 5 distinct names), permission split, tenant isolation, audit events | `backend-mongo/src/scripts/core-smoke.ts` passed |
| Form model (blank to null, hidden fields, required) | `record-form-model.spec.ts` |
| List and form screens against stubbed HTTP | `core-pages.spec.ts` |
| Create, list, search, open and validation error in a real browser against the real API | A one-off Playwright run (not committed to the repository) |
| Delete from the screen, paging beyond one page, the read-only screen in a real browser | **Not exercised in a real browser** (unit-tested only) |
