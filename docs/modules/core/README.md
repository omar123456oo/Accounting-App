---
title: "Core: Document Types and Customization"
id: "CORE-MODULE-001"
module: "Core"
document_type: "module-guide"
status: "active"
verification_status: "partial"
source_of_truth: "application-source-code"
last_verified: "2026-10-14"
---

# Core: Document Types and Customization

## Purpose

A document type (DocType) describes a kind of document: its fields, who may see it, and which fields are searched. The core lets an administrator **add custom fields** to a built-in document type and **create new document types** of their own. It is the foundation for the customization tool planned for every module.

## Implementation status

| Capability | Status |
|---|---|
| Read the merged field list of a document type | Implemented and tested |
| Add, reorder, hide or require custom fields on a document type (API) | Implemented and tested |
| Create and delete admin-made document types (API) | Implemented and tested |
| Search over records of admin-made types (API) | Implemented and tested; no records can be created yet, so it returns nothing in real use |
| Screens to customize forms or create document types | **Not built** |
| Create, edit and list records of admin-made types | **Not built** |
| Built-in screens (for example leave) showing custom fields | **Not built**: custom fields are stored and returned by the API but no screen reads them and the leave API does not store their values |
| Workflow, client scripts, server scripts | **Not built** |

## Features

- [Customize a document type](features/customize-doctype.md)
- [Create an admin-made document type](features/create-doctype.md)
- [Read document type metadata](features/doctype-metadata.md)
- Search over records is documented with the [global search](../search/features/global-search.md).

## Permissions

| Action | Permission | Enforced by |
|---|---|---|
| Customize, create or delete document types | `admin.settings` | Backend route (`can('admin.settings')`) |
| Read metadata of a type | the type's own `viewPermission` | Backend handler; unknown and not-permitted both answer 404 |

Roles holding `admin.settings` are listed in the [permissions matrix](../../PERMISSIONS_MATRIX.md). Note the Angular app guards its settings screens with `settings.manage`, a different name that the backend does not define; reconcile the two before building the customization screens.

## Built-in document types

Declared in `backend-mongo/src/core/builtin-doctypes.ts`. Today only `leave_request` (fields `leave_type`, `from_date`, `to_date`, `reason`; view permission `leave.apply`).

## Technical references

- Code: `backend-mongo/src/core/` (`fields.ts`, `models.ts`, `doctypes.ts`, `meta.routes.ts`, `customize.routes.ts`, `search.routes.ts`).
- Models: `DocType`, `CustomField`, `DocRecord` in the [data dictionary](../../DATA_DICTIONARY.md).
- Test: `backend-mongo/src/scripts/core-smoke.ts` (run `npm run core:check`).
- Design: [customization and scripting design](../../superpowers/specs/2026-10-14-customization-and-scripting-design.md).
