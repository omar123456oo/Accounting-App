# Search, Customize Tool and Scripting: Design

Date: 2026-10-14. Status: awaiting review.

## Goal

1. Improve the global search field.
2. Let an admin create documents (DocTypes) for any module and customize every document, like ERPNext's Customize Form and Custom Field.
3. Let a developer attach client scripts and server scripts to any DocType, per module.

Delivered in three phases, each shippable on its own: Search, then Customize, then Scripts.

## Core idea

Every document type is described by metadata (a DocType). Built-in modules register their DocTypes. Admin-made DocTypes live in MongoDB. The final field list of a form is: built-in fields + custom fields + property overrides.

## Data model (MongoDB, every document carries `organizationId`; every query is tenant-scoped)

| Collection | Key fields |
|---|---|
| `doctypes` | name, module, label, isCustom, fields[], titleField, searchFields[], permissions |
| `custom_fields` | doctype, fieldname, label, fieldtype, options, insertAfter, hidden, required, idx |
| `doc_records` | doctype, name, data{}, docstatus (draft / submitted / cancelled), audit fields |
| `scripts` | doctype, kind (client / server), event, code, enabled, version, updatedBy |

Field types: text, number, date, select, link, checkbox, currency, table.

## API (`/api/v1/staff`)

- `GET /meta/:doctype`: merged field list (any authenticated staff with access to the DocType).
- `GET|PUT /customize/:doctype`: requires `admin.settings`.
- `/doctypes` (create, list, delete): requires `admin.settings`.
- `/records/:doctype`: CRUD for admin-made types; runs server hooks; checks DocType permissions.
- `/scripts` CRUD: requires the new `developer.scripts` permission; every change is written to the audit chain.
- `GET /search?q=`: queries `searchFields` of every DocType the caller may view.

## Phase 1: Search

- `GlobalSearchService` sources become a registry (built-in sources plus DocTypes from `/search`).
- Ranking: exact, then prefix, then contains. Arabic and English normalization is kept.
- Recent searches, keyboard navigation, `type:term` filter.
- Failure of one source never blocks the others (existing behavior, kept).

## Phase 2: Customize tool

- Settings pages: DocType list, Customize Form editor (add, hide, reorder, relabel fields), create DocType.
- A generic form and list renderer that draws any DocType from `/meta`.
- Built-in forms read `/meta` to show custom fields (rolled out module by module, starting with HR/Leave on the real backend; mock-API modules via a mock `/meta`).

## Phase 3: Scripts

Client scripts
- A function body receiving `frm`: `on(event, fn)`, `get`, `set`, `toggle`, `set_required`, `add_button`, `msg`.
- Events: onload, refresh, field change, validate, before_save.
- Runs against a frozen API object; no access to `window`, cookies or tokens.

Server scripts
- Events: before_validate, before_save, after_save, before_submit, on_cancel, plus custom API endpoint scripts.
- Run in `isolated-vm`: 1 s timeout, 32 MB memory cap, no `require`, no network or filesystem.
- Globals: `doc`, `db.get`, `db.list`, `throw(msg)`, `log(...)`. `throw` aborts the save with HTTP 422.
- Tenant-scoped; `db.*` only reads and writes the caller's organization.

## Security constraints

- Only `developer.scripts` can edit scripts; only `admin.settings` can customize.
- Script edits are versioned and audited.
- A security regression is not acceptable as a trade for speed. If `isolated-vm` cannot be installed, server scripts stay disabled rather than falling back to `vm`/`eval`.

## Testing

- Backend smoke scripts (style of `leave-smoke.ts`): customize, save, script blocks the save, tenant isolation.
- Frontend unit tests: search ranking, script runner, and an escape test proving `window` is unreachable.

## Open items

- Which built-in modules get `/meta` integration first (proposed: HR/Leave, then Invoicing).
- Whether client scripts run in an iframe sandbox or a frozen-API function (proposed: frozen-API function first).
