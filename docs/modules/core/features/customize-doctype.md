---
title: "Customize a Document Type"
id: "CORE-FEATURE-002"
module: "Core"
document_type: "feature-guide"
status: "active"
verification_status: "partial"
source_of_truth: "application-source-code"
last_verified: "2026-10-14"
---

# Customize a Document Type

## Purpose

Let an administrator add their own fields to a built-in or admin-made document type, without changing code. This is the backend of an ERPNext-style "Customize Form". Screen: **Document types → Customize form** (`/app/doctypes/<name>/customize`) shows the built-in fields read-only and lets the admin add, reorder, hide or require custom fields, and choose which field each follows.

## Users and permissions

`admin.settings`. Backend enforced (a role without it gets 403; tested with the accountant role).

## API

| Call | Purpose |
|---|---|
| `GET /api/v1/staff/core/customize/:doctype` | The custom fields currently defined for the type |
| `PUT /api/v1/staff/core/customize/:doctype` | Replace the whole set of custom fields with the list sent |

`PUT` body: `{ "fields": [ { "fieldname", "label", "fieldtype", "options?", "required?", "hidden?", "insertAfter?" } ] }`. Sending `[]` removes all custom fields. The replacement happens in one database transaction.

## Validation rules (all errors are returned together as HTTP 422 under `errors.fields`)

| Rule | Covered by test |
|---|---|
| `fieldname` is lowercase letters, digits and underscores, starts with a letter, at most 64 characters | yes (`Bad Name`, `a.b` rejected) |
| `fieldname` does not collide with a built-in field of the same type (`reason` on `leave_request`) | yes |
| `fieldname` is unique within the list | yes |
| `label` is required (trimmed, at most 120 characters) | yes (empty rejected); length not tested |
| `fieldtype` is one of the seven known types | yes |
| A `select` field needs at least one option | yes |
| A `link` field needs its target type as the first option | **no** (implemented, untested; the target type's existence is not checked) |
| At most 100 fields per request | **no** (implemented, untested) |
| The type must exist and belong to the caller's organization, otherwise 404 | yes |

A rejected request changes nothing (tested: the field list is unchanged after the failed requests).

## Audit

Every successful `PUT` appends an audit event `customize.update` with the previous and new field lists. Tested, including that the audit chain verifies afterwards.

## Expected result

`200 { data: { name, fields } }`; the next metadata read shows the new fields in the requested positions ([metadata](doctype-metadata.md)).

## Known limitations

- Custom fields appear in the forms of admin-made types (records). They do **not** appear in built-in screens such as leave, and no built-in API stores values for them.
- Fields cannot be removed individually: send the full list without them.
- Select options are plain text; they are not translated.

## Technical references

`backend-mongo/src/core/customize.routes.ts` (`parseFields`), `models.ts` (`CustomField`, unique on organization + type + fieldname), `fields.ts`; test `backend-mongo/src/scripts/core-smoke.ts`.

## Verification

Partial: the table above states which rules a passing backend test (2026-10-14) exercises and which do not. The screen has unit tests (add a field, save sends the full list with positions, a rejected save shows the server message and keeps the rows) and was exercised in Chrome against the real API: adding `plate_no` saved, and `Bad Name` was refused with the server's message. Validation messages from the server are English only.
