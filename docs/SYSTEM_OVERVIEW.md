---
title: "System Overview"
id: "SYS-OVERVIEW-001"
document_type: "system-doc"
status: "active"
verification_status: "implemented-not-runtime-verified"
source_of_truth: "application-source-code"
last_verified: null
---

# System Overview

An accounting-office management application for Egyptian offices (Arabic and English, right-to-left supported), being extended toward a modular ERP.

## Parts of the repository

| Part | Technology | State |
|---|---|---|
| `frontend/` | Angular 22 (standalone components, lazy-loaded routes), ngx-translate, Bootstrap 5 | Contains screens for many modules. By default it runs against an **in-memory mock API** (`frontend/src/app/core/mock-api`); `npm run start:api` proxies `/api` to the real backend instead. |
| `backend-mongo/` | Node, Express 4, Mongoose 8, TypeScript, MongoDB | **The active API.** Real endpoints exist only for sign-in and sessions, the HR core, leave, and core metadata. See the [API catalog](API_CATALOG.md). |
| `backend/` | Laravel, PostgreSQL | The original Phase 1 stack. Frozen: no new work goes here. |

## What is real and what is mock

A screen is only backed by a real database when its API appears in the [API catalog](API_CATALOG.md). Every other module (clients, accounting, invoicing, payables, tax, tickets and so on) currently works against the mock API: its data lives in the browser session and its business rules are implemented in `frontend/src/app/core/mock-api`. Those modules have **no server-side enforcement** yet.

## Cross-cutting behaviour (read from the code)

- **Tenant isolation:** every backend collection carries `organizationId`, taken from the session, never from the request ([Data dictionary](DATA_DICTIONARY.md)).
- **Audit:** backend writes append to a per-organization hash-chained audit log (`backend-mongo/src/db/audit-chain.ts`).
- **Permissions:** role-to-permission matrix in [Permissions matrix](PERMISSIONS_MATRIX.md). Frontend guards only hide screens; the backend checks permissions per route.
- **Languages:** the backend answers validation messages in the request language (`Accept-Language`, Arabic by default in the leave module).

## Where to read next

[Module catalog](MODULE_CATALOG.md) · [Route map](APPLICATION_ROUTE_MAP.md) · [Setup for the MongoDB API](setup-mongodb.md) · [Security notes](security.md)
