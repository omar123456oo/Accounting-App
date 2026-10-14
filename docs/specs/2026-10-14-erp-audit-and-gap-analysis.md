# ERP Transformation: Repository Audit and Gap Analysis

Version 0.1 · 2026-10-14 · Status: awaiting review · Source: read-only inspection of the repository. Nothing below was run or tested; sizes and file lists come from `ls`, `wc` and reading files.

## 1. What exists

| Area | Finding |
|---|---|
| Frontend | Angular 22, standalone components, lazy routes, ngx-translate (Arabic and English, RTL e2e spec exists), Bootstrap 5, Font Awesome, decimal.js. About 35,700 lines of TypeScript. Vitest unit specs and Playwright e2e specs. |
| Frontend data | Almost everything runs on an **in-memory mock API** (`core/mock-api`, about 70 files). `npm run start:api` proxies `/api` to a real backend instead. |
| Features present (UI) | Clients, documents, tasks, approvals, tickets, appointments, timesheets, forecast, analytics, HR (employees, leave, payroll, payslips), accounting (accounts, periods, journals, reports, mappings), invoicing, payables (bills, suppliers, expenses), financial statements, tax, audit chain, client portal. |
| `backend-mongo` | Node, Express 4, Mongoose 8, TypeScript, about 3,300 lines. **Real endpoints exist only for auth/session, HR core (organization, employees, contracts, dashboard) and leave.** Tenant model via `organizationId` plugin. Hash-chained audit log (`audit-chain.ts`) with transactions. Permission matrix and role sync. Smoke scripts (`hr:check`, `leave:check`, `api:check`, `db:check`) on in-memory MongoDB. |
| `backend` (Laravel) | Legacy PostgreSQL stack, `Modules/Platform` only (audit, console, mail, PDF, rules). README still describes Laravel and PostgreSQL. This conflicts with the MongoDB direction. |
| Docs | `docs/` has setup, security, admin guide, backup runbook, one ADR, a roadmap spec, an HR analysis and a design spec from earlier today. |
| Git | Branch `main`. Staged but uncommitted: leave module and related changes. |

## 2. Gaps against the requested ERP

**Missing in the backend (the blocking gap).** No generic document engine, workflow engine, naming series, comments, attachments, notifications, global search endpoint, custom fields or doctypes, report/export endpoints, rate limiting, or OpenAPI. Finance, procurement, inventory, sales/CRM, projects, recruitment, operations/contracts and the ticket module have **no real backend**; they exist only as UI plus mock API. Not built in HR either: attendance, payroll, onboarding, performance, training, letters.

**Missing in the frontend.** A reusable metadata-driven form and list renderer, configurable columns and saved views, a workflow/status component, an activity timeline and approval-history component. Existing feature screens are hand-built per module.

**Technical debt and risks.**
- Two backend stacks in the repo, and the README describes the wrong one.
- Business rules duplicated: calculation and posting logic lives in mock-API files (for example `mock-commercial-posting.ts`, `mock-hr-calc.ts`). Moving to a real backend means re-implementing it server side, then deleting the mock copy.
- `GlobalSearchService` hard-codes 9 sources.
- MFA, e-mail verification and rate limiting are listed as "not built" in `docs/setup-mongodb.md`.
- Dev MongoDB runs without authentication.
- Payroll and leave entitlements are placeholders, not verified against local law.

## 3. Target architecture (summary)

- **Core framework in `backend-mongo/src/core/`:** DocType registry, document lifecycle (draft, pending approval, approved, rejected, submitted, cancelled, closed, with per-type allowed transitions), naming series, workflow engine, comments, attachments, activity timeline, notifications, global search, custom fields, scripts. Every route checks permission and tenant on the server.
- **Hybrid data model:** strongly typed Mongoose models for core entities (users, employees, accounts, journal entries), controlled dynamic schemas (`doc_records`) for admin-made DocTypes.
- **Frontend `core/erp/`:** metadata-driven list, form, workflow bar, timeline and approval history components. Existing screens adopt them module by module; none is rewritten without need.
- **Scripts:** client scripts through a frozen API object, server scripts in `isolated-vm`, behind a `developer.scripts` permission and the audit chain (see the earlier design spec).

## 4. Proposed order

1. **Core framework end to end** (document engine, naming, workflow, comments, timeline, search registry, customize tool, scripts) with HR Leave as the first adopter, because its backend and smoke test already exist.
2. **Finance backend** (chart of accounts, journals, invoices), moving the mock posting rules server side.
3. Requests, tickets and approvals; documents and knowledge base.
4. Procurement and inventory; sales and CRM.
5. Projects and tasks; recruitment; operations and contracts.
6. Reports, analytics, exports, scheduled reports.
7. Documentation and tests continue per module, not at the end.

Each step is a separate spec, plan and commit set, with tests actually run before anything is called complete.

## 5. Decisions needed from the owner

1. Retire the Laravel `backend/` directory, or keep it frozen? Recommendation: freeze it, fix the README, remove it after a data-migration check.
2. Payroll and tax country rules: Egypt only, or configurable per country from the start? Recommendation: Egypt first, rules in data.
3. Is the product multi-company within one tenant (companies and branches under one `organizationId`), or one company per tenant? The existing HR code has branches but one organization per tenant.
