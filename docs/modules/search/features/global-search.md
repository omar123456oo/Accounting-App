---
title: "Global Search Box"
id: "SEARCH-FEATURE-001"
module: "Search"
document_type: "feature-guide"
status: "active"
verification_status: "partial"
source_of_truth: "application-source-code"
last_verified: "2026-10-14"
---

# Global Search Box

## Purpose

Find a page or record from anywhere in the application without browsing menus.

## Users and permissions

Every signed-in staff member. Each source is limited to what the person may open: pages by their menu permission, records by the module's view permission. A person never sees results from a module they cannot open (tested with the auditor role: no payroll page, no employees).

## Navigation path

The search box in the page header.

## How to use it

1. Click the box, or press `/` (outside a text field) or Ctrl/Cmd+K.
2. With the box empty, your recent searches appear; click one to run it.
3. Type at least two characters. Results appear after a short pause, grouped by kind (pages, clients, documents, tasks, invoices, bills, journal entries, employees, tickets, records).
4. Move with the arrow keys and press Enter, or click a result. The box clears and the page opens.
5. Press Escape to close.

**Filter by kind:** type `kind: term`, for example `employee: demo`. Kinds are `page`, `client`, `document`, `task`, `invoice`, `bill`, `journal`, `employee`, `ticket`, `record`; a trailing "s" is accepted (`clients: acme`). An unknown prefix is searched as ordinary text.

## Business rules

- Fewer than two characters (after removing a filter prefix) searches nothing.
- Within each group, results are ordered: exact title match, then title starts with the term, then title contains it, then the subtitle contains it; ties keep the source's order. Arabic diacritics and letter case are ignored.
- At most five results per group.
- Recent searches: the last eight distinct terms (case-insensitive), kept in this browser only (`localStorage` key `recent-searches`); search works if storage is blocked.
- A source that fails (for example a module that is down) is left out; the other groups still show.
- Invoices, bills and journal entries are searched in the currently selected ledger.

## Records of admin-made document types

The `record` group calls `GET /api/v1/staff/core/search?q=&type=`. The server returns at most five records per type, only for types the caller may view, matching the term literally (regex characters are escaped) in the type's `searchFields`. Tenant isolation and permission filtering are tested. On the mock API this path does not exist (the group is simply empty). Exercised in Chrome against the real API: typing a record's title showed it under "Records", clicking it opened `/app/records/<type>/<name>`, `record: abc` showed only that group, and the term then appeared in recent searches.

## Verification

| Behaviour | Test |
|---|---|
| Grouped results; permission-limited sources | `global-search.spec.ts` |
| Keyboard selection with Enter, box clears | `global-search.spec.ts` |
| Needs two characters; "nothing found" message | `global-search.spec.ts` |
| Recent searches shown when empty, choosing one runs it | `global-search.spec.ts`, `recent-searches.spec.ts` |
| `kind: term` filter | `global-search.spec.ts`, `search-rank.spec.ts` |
| Ranking order; diacritics; stable ties | `search-rank.spec.ts` |
| `record` group shown; failing source omitted | `global-search.spec.ts` |
| Server search: literal regex characters, permission, tenant, type filter | `backend-mongo/src/scripts/core-smoke.ts` |
| `/` and Ctrl/Cmd+K shortcut, Escape, click outside, five-per-group cap | **not covered by a test** |

Run 2026-10-14: all shell specs passed (34 tests) and `npm run core:check` passed. In a full frontend run one unrelated analytics spec exceeded its 5-second timeout; it passes alone and on the commit before this work.

## Known limitations

- The ledger-based groups and most other groups run on the mock API, not a real backend.
- The filter prefix is English-only.

## Technical references

`frontend/src/app/layout/shell/global-search.ts` (component), `global-search.service.ts` (sources, parallel, error-tolerant), `search-rank.ts` (`parseQuery`, `rankHits`, `norm`), `recent-searches.ts`, `core-search.api.ts`; backend `backend-mongo/src/core/search.routes.ts`.
