---
title: "Read Document Type Metadata"
id: "CORE-FEATURE-001"
module: "Core"
document_type: "feature-guide"
status: "active"
verification_status: "verified"
source_of_truth: "application-source-code"
last_verified: "2026-10-14"
---

# Read Document Type Metadata

## Purpose

Return the full field list of a document type: its own fields followed by the organization's custom fields, in display order. Any screen can use it to draw a form.

## Users and permissions

Any signed-in staff member whose role holds the document type's `viewPermission` (`leave.apply` for `leave_request`). Backend enforced. A type that does not exist, belongs to another organization, or that the caller may not view all answer **404**, so the caller learns nothing about hidden types.

## API

| Call | Result |
|---|---|
| `GET /api/v1/staff/core/meta/:doctype` | `{ data: { name, label, module, isCustom, titleField, canManage, fields: [...] } }` (`canManage` tells a screen whether to offer editing; the server still enforces it) |
| `GET /api/v1/staff/core/doctypes` | `{ data: [{ name, label, module, isCustom }] }`, only types the caller may view |

Each field has `fieldname`, `label`, `fieldtype` (`text`, `number`, `date`, `select`, `link`, `checkbox`, `currency`) and, when set, `options`, `required`, `hidden`, `insertAfter`.

## Business rules

- A custom field with `insertAfter` naming an existing field is placed directly after it; chained anchors work (custom after custom).
- A custom field whose anchor does not exist, or that has none, is placed at the end.
- A hidden custom field stays in the list with `hidden: true`; the caller decides whether to draw it.
- A custom field may not reuse a built-in field's name (see [customize](customize-doctype.md)).

## Known limitations

- Used by the record screens; built-in screens do not use it.
- The built-in `leave_request` definition lives in code and is not connected to the real leave form or leave API.

## Technical references

- Code: `backend-mongo/src/core/meta.routes.ts`, `doctypes.ts`, `fields.ts` (`mergeFields`).
- Tests (`backend-mongo/src/scripts/core-smoke.ts`): built-in field list; insertion after `from_date`; unknown type 404; another organization sees no custom field; a role without permission is refused on customize while still reading metadata.

## Verification

Verified 2026-10-14 by `npm run core:check` (passed). Not covered by a test: the 404 for a caller who lacks `viewPermission` on an admin-made type is covered; for built-in types it is not.
