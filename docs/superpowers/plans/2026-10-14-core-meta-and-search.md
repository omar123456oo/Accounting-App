# Core Metadata, Customize API and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship slice 1 of the ERP core: a per-organization DocType registry with custom fields (the "Customize Form" backend), a tenant-scoped search endpoint over DocTypes, and a better global search that uses it.

**Architecture:** New `backend-mongo/src/core/` holds Mongoose models, a pure `mergeFields` function, and routers mounted under `/api/v1/staff`. Built-in DocTypes are declared in code (`core/builtin-doctypes.ts`); admin-made DocTypes and custom fields live in MongoDB. The frontend search keeps its current parallel-source design and gains ranking, recent searches, a `type:` filter and a registry source backed by `/search`.

**Tech Stack:** Node, Express 4, Mongoose 8, TypeScript, tsx smoke scripts on `mongodb-memory-server`; Angular 22, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-customization-and-scripting-design.md` (Phases 1 and 2 backend part) and `docs/specs/2026-10-14-erp-audit-and-gap-analysis.md` (section 3).

**Not in this plan (own plans later):** customize UI pages, generic form renderer, workflow engine, client and server scripts, other ERP modules.

## Global Constraints

- Every collection carries `organizationId` (use `tenantPlugin` from `src/db/tenant.ts`); every query filters by it. Tenant id always comes from `req.auth.organizationId`, never from the request body.
- Customize and DocType write routes require permission `admin.settings`; reads of `/meta` and `/search` require an authenticated staff session and the DocType's own `viewPermission`.
- Every customize or DocType write calls `appendAudit` (`src/db/audit-chain.ts`).
- Errors use `HttpError` and `Errors` from `src/hr/common.ts` (422 with field map for validation, 404 for unknown or foreign ids). Bad ObjectIds are 404, never 500.
- Messages answer in the request language (`accept-language`, `ar` default, as `leave.routes.ts` does).
- No new runtime dependencies.
- Tests run for real before any task is marked done: `npm run core:check` (backend), `npx ng test --include='**/global-search*.spec.ts'` or the project's vitest command (frontend).

## Review Focus

- Field name collision: a custom field named like a built-in field of the same DocType is rejected (422), not silently shadowing it.
- Invalid fieldname characters (spaces, `$`, `.`, empty, over 64 chars) are rejected, since they would break Mongo paths.
- Another organization's custom fields and DocTypes never appear in `/meta` or `/search`.
- Search term containing regex characters (`.*`, `(`) matches literally and does not error or hang.
- A user without the DocType's `viewPermission` gets no hits and no hint the type exists.

## File Structure

| File | Responsibility |
|---|---|
| `backend-mongo/src/core/models.ts` | `DocType` and `CustomField` Mongoose models and indexes |
| `backend-mongo/src/core/fields.ts` | Field types, name validation, pure `mergeFields` |
| `backend-mongo/src/core/builtin-doctypes.ts` | Code-declared DocTypes (first: Leave Request) |
| `backend-mongo/src/core/meta.routes.ts` | `GET /meta/:doctype`, `GET /doctypes` |
| `backend-mongo/src/core/customize.routes.ts` | `GET/PUT /customize/:doctype`, `POST/DELETE /doctypes` |
| `backend-mongo/src/core/search.routes.ts` | `GET /search` |
| `backend-mongo/src/core/index.ts` | Mounts the routers as `coreRouter` |
| `backend-mongo/src/scripts/core-smoke.ts` | HTTP acceptance test |
| `frontend/src/app/layout/shell/search-rank.ts` | Pure ranking and `type:` parsing |
| `frontend/src/app/layout/shell/recent-searches.ts` | Recent-search store (localStorage, guarded) |
| `frontend/src/app/layout/shell/global-search.service.ts` | Modified: ranking, filter, registry source |
| `frontend/src/app/layout/shell/global-search.ts` | Modified: recent list when box is empty |

---

### Task 1: Field model and pure merge

**Files:**
- Create: `backend-mongo/src/core/fields.ts`
- Test: `backend-mongo/src/scripts/core-smoke.ts` (unit section at top, no DB)

**Interfaces:**
- Produces:
  - `type FieldType = 'text' | 'number' | 'date' | 'select' | 'link' | 'checkbox' | 'currency'`
  - `interface FieldDef { fieldname: string; label: string; fieldtype: FieldType; options?: string[]; required?: boolean; hidden?: boolean; insertAfter?: string }`
  - `isValidFieldname(name: unknown): name is string` (regex `^[a-z][a-z0-9_]{0,63}$`)
  - `mergeFields(builtin: FieldDef[], custom: FieldDef[]): FieldDef[]`

- [ ] **Step 1: Write failing tests** in `core-smoke.ts` using `node:assert/strict`:
  - `isValidFieldname('reason_2')` true; `'Reason'`, `'a b'`, `'a.b'`, `'$x'`, `''`, `'x'.repeat(65)` false.
  - `mergeFields([a,b,c],[x with insertAfter 'a'])` yields order `a,x,b,c`.
  - Custom field with `insertAfter` naming an unknown field is appended at the end.
  - Custom field whose `fieldname` equals a built-in one throws `Error('duplicate fieldname: <name>')`.
  - Custom field with `hidden: true` stays in the result with `hidden: true`.
- [ ] **Step 2: Run** `npx tsx src/scripts/core-smoke.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `fields.ts` per the signatures above. `mergeFields` inserts each custom field after its anchor in the order given; chained anchors (custom after custom) must work.
- [ ] **Step 4: Run** the same command. Expected: unit assertions pass.
- [ ] **Step 5: Commit** `feat(core): field definitions and merge`.

### Task 2: Models and built-in DocType registry

**Files:**
- Create: `backend-mongo/src/core/models.ts`, `backend-mongo/src/core/builtin-doctypes.ts`
- Modify: `backend-mongo/src/db/indexes.ts` (register the new models), `backend-mongo/package.json` (script `"core:check": "tsx src/scripts/core-smoke.ts"`)

**Interfaces:**
- Consumes: `tenantPlugin` (`src/db/tenant.ts`), `FieldDef` (Task 1).
- Produces:
  - `DocType` model: `{ organizationId, name (unique per org, same fieldname rules), label, module, fields: FieldDef[], titleField, searchFields: string[], viewPermission: string, isCustom: true }`
  - `CustomField` model: `{ organizationId, doctype, ...FieldDef }`, unique index `{organizationId, doctype, fieldname}`
  - `interface BuiltinDocType { name: string; label: string; module: string; fields: FieldDef[]; viewPermission: string; route: (name: string) => string }`
  - `BUILTIN_DOCTYPES: Record<string, BuiltinDocType>` with one entry, `leave_request` (viewPermission `leave.apply`, fields: `leave_type` select, `from_date` date, `to_date` date, `reason` text).

- [ ] **Step 1: Write failing test** (DB section of `core-smoke.ts`, in-memory replica set, same boot pattern as `leave-smoke.ts`): creating two `CustomField` rows with same org, doctype and fieldname rejects with duplicate-key; same fieldname in another org succeeds.
- [ ] **Step 2: Run** `npm run core:check`. Expected: FAIL, models missing.
- [ ] **Step 3: Implement** both files and register indexes in `indexes.ts` following its existing pattern.
- [ ] **Step 4: Run** `npm run core:check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): doctype and custom field models`.

### Task 3: Meta and customize API

**Files:**
- Create: `backend-mongo/src/core/meta.routes.ts`, `customize.routes.ts`, `index.ts`
- Modify: `backend-mongo/src/app.ts` (mount `coreRouter` at `/api/v1/staff/core` behind the existing `requireAuth, requireType('staff')`)

**Interfaces:**
- Consumes: `mergeFields`, `isValidFieldname`, models, `BUILTIN_DOCTYPES`, `appendAudit`, `can`, `HttpError`, `Errors`, `wrap`, `orgOf`.
- Produces (all under `/api/v1/staff/core`):
  - `GET /meta/:doctype` returns `{ data: { name, label, module, fields: FieldDef[] } }` (built-in plus custom merged, or an admin-made DocType's own fields plus its custom fields). 404 if unknown or the caller lacks `viewPermission`.
  - `GET /doctypes` returns `{ data: [{ name, label, module, isCustom }] }` limited to types the caller may view.
  - `GET /customize/:doctype` and `PUT /customize/:doctype` (`admin.settings`): `PUT` body `{ fields: FieldDef[] }` replaces that DocType's custom fields atomically (a transaction); validates names, types, select options, collisions; audits `customize.update` with before and after.
  - `POST /doctypes` (`admin.settings`): body `{ name, label, module, fields, titleField, searchFields, viewPermission }`; 422 on invalid or if `name` equals a built-in name; 409-style duplicate becomes 422 on field `name`. `DELETE /doctypes/:name` removes it and its custom fields; audited.

- [ ] **Step 1: Write failing HTTP tests** in `core-smoke.ts` (reuse the `Client` class pattern from `leave-smoke.ts`), as owner unless stated:
  - `GET /meta/leave_request` returns the 4 built-in fields.
  - `PUT /customize/leave_request` with a new field `ticket_ref` (text, insertAfter `from_date`) then `GET /meta/leave_request` shows it right after `from_date`.
  - `PUT` with fieldname `reason` (collides) returns 422 with error on `fields`.
  - `PUT` with fieldname `Bad Name` returns 422.
  - `PUT` as `accountant` (no `admin.settings`) returns 403.
  - Another organization (create a second org via the seed helper or direct models) does not see `ticket_ref`.
  - `POST /doctypes` creates `vehicle` with title field `plate`; `GET /meta/vehicle` works; duplicate `POST` returns 422; `DELETE` then `GET /meta/vehicle` returns 404.
  - After the writes, `verifyChain(org)` returns `null` (chain intact) and an audit event with action `customize.update` exists.
- [ ] **Step 2: Run** `npm run core:check`. Expected: FAIL, routes 404.
- [ ] **Step 3: Implement** routers and mount. Use `session.withTransaction` for the `PUT` replace. Validation collects all problems into one `Errors` and throws once.
- [ ] **Step 4: Run** `npm run core:check` and `npm run typecheck`. Expected: both pass.
- [ ] **Step 5: Run regressions** `npm run leave:check` and `npm run hr:check`. Expected: still pass.
- [ ] **Step 6: Commit** `feat(core): meta and customize API`.

### Task 4: Search endpoint

**Files:**
- Create: `backend-mongo/src/core/search.routes.ts`
- Modify: `backend-mongo/src/core/index.ts`

**Interfaces:**
- Consumes: models, `BUILTIN_DOCTYPES`, `escapeRegex` and `pageOf` from `src/hr/common.ts`.
- Produces: `GET /api/v1/staff/core/search?q=<term>&type=<doctype?>` returns `{ data: [{ doctype, doctypeLabel, name, title, route }] }`, max 5 hits per DocType, only DocTypes the caller may view, only for admin-made DocTypes in this slice (built-ins keep their frontend sources). `q` shorter than 2 characters returns `{ data: [] }`. Matching is case-insensitive over the DocType's `searchFields`, regex-escaped.

This task needs a `DocRecord` model (`{ organizationId, doctype, name, data: Mixed }`, index `{organizationId, doctype, name}` unique) added to `models.ts`; there is no write API for records yet, so the test inserts rows directly.

- [ ] **Step 1: Write failing tests** in `core-smoke.ts`: insert `vehicle` DocType with `searchFields ['plate']` and records `ABC-123`, `XYZ-999`; as owner `GET /search?q=abc` returns exactly one hit with `title 'ABC-123'`; `q=a.c` (regex chars) returns no hit and status 200; `q=(` returns 200; `q=a` returns empty; as a role lacking `viewPermission` returns empty; second org gets empty; `type=vehicle` filters.
- [ ] **Step 2: Run** `npm run core:check`. Expected: FAIL.
- [ ] **Step 3: Implement** `search.routes.ts` and add `DocRecord` plus its index registration.
- [ ] **Step 4: Run** `npm run core:check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): doctype search endpoint`.

### Task 5: Frontend ranking, filter and recents

**Files:**
- Create: `frontend/src/app/layout/shell/search-rank.ts`, `search-rank.spec.ts`, `recent-searches.ts`, `recent-searches.spec.ts`
- Modify: `global-search.service.ts`, `global-search.ts`, `global-search.spec.ts`, i18n files for new keys (`search.recent`, `search.clearRecent`)

**Interfaces:**
- Produces:
  - `parseQuery(raw: string): { term: string; kind?: SearchKind }` (`client: acme` gives kind `client`, term `acme`; unknown prefix is left in the term)
  - `rankHits(term: string, hits: SearchHit[]): SearchHit[]` (stable; exact title match, then title prefix, then title contains, then subtitle contains; Arabic diacritics and case ignored using the existing `norm`, which should be exported from `search-rank.ts` and imported by the service)
  - `RecentSearches` service: `list(): string[]`, `add(term: string): void` (max 8, de-duplicated, newest first, ignores terms under 2 chars), `clear(): void`; all localStorage access in try/catch, works with storage unavailable.

- [ ] **Step 1: Write failing specs**: `rankHits('acme', [contains, prefix, exact])` returns `exact, prefix, contains`; `parseQuery('client: acme')`; `parseQuery('foo: bar')` keeps full text; `RecentSearches` caps at 8, de-duplicates, survives a throwing `localStorage`; component spec: with the box empty and focused, recent terms are listed and choosing one runs the search.
- [ ] **Step 2: Run** the frontend test command for these files. Expected: FAIL.
- [ ] **Step 3: Implement** the pure functions and service; wire `parseQuery` into `GlobalSearchService.search` (a kind filter skips other sources) and `rankHits` into each group; component shows recents when the term is empty and calls `add` on `go`.
- [ ] **Step 4: Run** the specs plus the existing four in `global-search.spec.ts`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(search): ranking, type filter, recent searches`.

### Task 6: Frontend DocType search source

**Files:**
- Modify: `global-search.service.ts`, `global-search.spec.ts`, `frontend/src/app/core/mock-api/mock-backend.ts` (mock `GET /staff/core/search` returning `{data: []}` so mock mode keeps working), i18n (`search.kinds.record`)
- Create: `frontend/src/app/layout/shell/core-search.api.ts`

**Interfaces:**
- Consumes: Task 4 endpoint, Task 5 `rankHits`.
- Produces: `CoreSearchApi.search(q: string, type?: string): Observable<Array<{ doctype: string; doctypeLabel: string; name: string; title: string; route: string }>>`; the service maps these to `SearchHit` with new kind `record` and subtitle `doctypeLabel`; a failing request yields an empty group, like every other source.

- [ ] **Step 1: Write failing spec**: with `CoreSearchApi` stubbed to return one hit, typing its title shows a group `search.kinds.record`; when the stub throws, other groups still render.
- [ ] **Step 2: Run** the spec. Expected: FAIL.
- [ ] **Step 3: Implement** the API client, the new `SearchKind`, and the source entry in the `forkJoin`; add the icon for `record` in `global-search.ts`.
- [ ] **Step 4: Run** all global-search specs, then `npx ng build` to confirm the app compiles. Expected: pass and build succeeds.
- [ ] **Step 5: Commit** `feat(search): DocType records source`.

### Task 7: Docs and end-to-end check

**Files:**
- Modify: `docs/setup-mongodb.md` (new "Core metadata" section: endpoints, permissions, `npm run core:check`, "Not yet built" list), `README.md` (fix stale Laravel and PostgreSQL line: state that `backend/` is frozen and `backend-mongo/` is the active API).

- [ ] **Step 1:** Document only what Tasks 1 to 6 built; mark customize UI, record CRUD, workflow and scripts as planned.
- [ ] **Step 2: Run** the full verification: `cd backend-mongo && npm run typecheck && npm run core:check && npm run leave:check && npm run hr:check`, then the frontend unit tests. Report the actual output; do not claim success from memory.
- [ ] **Step 3: Commit** `docs: core metadata and README backend note`.
