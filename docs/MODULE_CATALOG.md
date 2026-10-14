---
title: "Module Catalog"
id: "SYS-MOD-001"
document_type: "generated-reference"
status: "generated"
verification_status: "source-scanned"
source_of_truth: "application-source-code"
generated_by: "scripts/docs/scan.mjs"
---

# Module Catalog

> Generated from the source code by `node scripts/docs/scan.mjs`. Do not edit by hand: change the code and run the scan again.
> **Verification status:** source-scanned (read from the code; not exercised at runtime).
> Inventory of `frontend/src/app/features/*` plus the backend areas found. Business descriptions live in each module guide, not here.



## Frontend feature folders

| Folder | TypeScript files | Components | Spec files | Module guide |
|---|---|---|---|---|
| `features/accounting` | 41 | 20 | 9 | not yet written |
| `features/analytics` | 18 | 12 | 3 | not yet written |
| `features/audit` | 3 | 0 | 0 | not yet written |
| `features/auth` | 7 | 5 | 2 | not yet written |
| `features/clients` | 23 | 6 | 8 | not yet written |
| `features/commercial` | 35 | 18 | 8 | not yet written |
| `features/core` | 14 | 5 | 4 | [modules/core](modules/core/README.md) |
| `features/dashboard` | 4 | 3 | 1 | not yet written |
| `features/documents` | 12 | 4 | 3 | not yet written |
| `features/engage` | 11 | 6 | 2 | not yet written |
| `features/hr` | 18 | 13 | 1 | not yet written |
| `features/hrm` | 6 | 3 | 1 | not yet written |
| `features/invoicing` | 6 | 3 | 1 | not yet written |
| `features/payables` | 7 | 5 | 0 | not yet written |
| `features/placeholder` | 1 | 1 | 0 | not yet written |
| `features/portal` | 7 | 6 | 0 | not yet written |
| `features/reports-fs` | 10 | 3 | 2 | not yet written |
| `features/settings` | 6 | 3 | 1 | not yet written |
| `features/tax` | 4 | 2 | 0 | not yet written |
| `features/workflows` | 14 | 4 | 5 | not yet written |

## Backend areas (URL prefix → endpoints)

| Prefix | Endpoints |
|---|---|
| `/api/health` | 1 |
| `/api/v1/auth/login` | 1 |
| `/api/v1/auth/logout` | 1 |
| `/api/v1/auth/me` | 1 |
| `/api/v1/auth/register` | 1 |
| `/api/v1/me/hrm` | 2 |
| `/api/v1/staff/core` | 12 |
| `/api/v1/staff/hr` | 33 |
| `/api/v1/staff/hrm` | 21 |
| `/api/v1/staff/ping` | 1 |
| `/sanctum/csrf-cookie` | 1 |

The frontend also contains 66 mock-API source files (`frontend/src/app/core/mock-api`): modules served only by the mock have **no backend implementation**.
