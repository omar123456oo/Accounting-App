---
title: "Global Search"
id: "SEARCH-MODULE-001"
module: "Search"
document_type: "module-guide"
status: "active"
verification_status: "partial"
source_of_truth: "application-source-code"
last_verified: "2026-10-14"
---

# Global Search

The search box in the application header finds pages and records across modules in one place. Details: [global search feature](features/global-search.md).

## Implementation status

| Capability | Status |
|---|---|
| Search across pages, clients, documents, tasks, invoices, bills, journal entries, employees, tickets | Implemented (on the mock API for all but HR) |
| Ranking, `kind: term` filter, recent searches | Implemented and unit-tested |
| Records of admin-made document types | Implemented in the frontend and backend; opens the record's form. Exercised end to end in Chrome against the real API |

## Technical references

`frontend/src/app/layout/shell/` (`global-search.ts`, `global-search.service.ts`, `search-rank.ts`, `recent-searches.ts`, `core-search.api.ts`); backend `backend-mongo/src/core/search.routes.ts`.
