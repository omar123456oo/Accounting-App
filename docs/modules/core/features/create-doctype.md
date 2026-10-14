---
title: "Create an Admin-made Document Type"
id: "CORE-FEATURE-003"
module: "Core"
document_type: "feature-guide"
status: "active"
verification_status: "partial"
source_of_truth: "application-source-code"
last_verified: "2026-10-14"
---

# Create an Admin-made Document Type

## Purpose

Define a new kind of document (for example a "Vehicle") with its own fields. Screen: **Document types → New document type** (`/app/doctypes`). Records of the new type are managed in [Manage records](manage-records.md).

## Users and permissions

`admin.settings`, backend enforced (tested: accountant gets 403).

## API

| Call | Result |
|---|---|
| `POST /api/v1/staff/core/doctypes` | `201 { data: { name, label, module, isCustom: true } }` |
| `DELETE /api/v1/staff/core/doctypes/:name` | `204`; also removes the type's custom fields |

`POST` body fields: `name`, `label`, `module`, `fields[]` (same shape as in [customize](customize-doctype.md), without `insertAfter`), `titleField`, `searchFields[]`, `viewPermission`, and optionally `managePermission` (default `admin.settings`).

## Validation rules (HTTP 422 with per-field errors)

| Rule | Covered by test |
|---|---|
| `name` is lowercase letters, digits, underscores, starts with a letter | yes |
| `name` is not a built-in type's name | yes |
| `name` is unique in the organization | yes |
| `label` and `module` are required | no |
| At least one field; each field valid | partly (field rules shared with customize) |
| `titleField` is one of the fields | yes |
| every `searchFields` entry is one of the fields | no |
| `viewPermission` and `managePermission` are permissions the system defines | `managePermission`: yes; `viewPermission`: no |

Deleting a built-in type answers 404 (tested). Deleting removes the type and its custom fields in one transaction (tested: no custom fields remain).

## Audit

`doctype.created` and `doctype.deleted` events are appended (created is tested; deleted is not checked by name).

## Known limitations

- A type's own fields, label and permission cannot be edited after creation (only custom fields can be added through [customize](customize-doctype.md)).
- Another organization cannot see the type (tested via metadata).

## Technical references

`backend-mongo/src/core/customize.routes.ts`, `models.ts` (`DocType`); test `backend-mongo/src/scripts/core-smoke.ts`.

## Verification

Partial, as the table shows (backend test run 2026-10-14). The creation form was also exercised once in Chrome against the real API: create succeeds, a duplicate name shows the server's message. Server validation messages for these routes are English only, even in the Arabic interface.
