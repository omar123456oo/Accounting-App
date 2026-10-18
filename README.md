# Accounting Office Management System

A web application for running an accounting office in Egypt: clients, documents, tasks, the general ledger, invoicing, payables, financial statements, tax deadlines, human resources and payroll, a client portal, and analytics. It is bilingual (Arabic and English, with full right-to-left layout) and is being extended toward a modular ERP with a customization core (custom fields, document types, approval workflows and sandboxed scripts).

> **Read this first: what is real and what is mock.**
> The Angular frontend contains screens for every module, but only some modules have a real backend. By default the frontend runs against an **in-memory mock API** (data lives in the browser session, business rules are implemented in `frontend/src/app/core/mock-api`). Modules without a real endpoint have **no server-side enforcement** yet. The exact list is in the [API catalog](docs/API_CATALOG.md) and the [system overview](docs/SYSTEM_OVERVIEW.md).

## Contents

1. [Repository layout](#repository-layout)
2. [Quick start](#quick-start)
3. [Modules](#modules)
4. [Roles and permissions](#roles-and-permissions)
5. [Security](#security)
6. [Language and layout](#language-and-layout)
7. [In-app module tips](#in-app-module-tips)
8. [Testing](#testing)
9. [Configuration](#configuration)
10. [Documentation map](#documentation-map)
11. [Known limits](#known-limits)

## Repository layout

| Path | What it is | State |
|---|---|---|
| `frontend/` | Angular 22 (standalone components, lazy-loaded routes), ngx-translate, Bootstrap 5 | Screens for all modules. Runs on the mock API by default. |
| `backend-mongo/` | Node, Express 4, Mongoose 8, TypeScript, MongoDB 7 | **The active API.** |
| `backend/` | Laravel 11, PostgreSQL 16 with row-level security | The original Phase 1 stack. **Frozen**: no new work goes here. |
| `docker/`, `docker-compose.yml` | Nginx, PHP, Postgres, MongoDB (replica set `rs0`), MinIO, Mailpit | Local development services. |
| `scripts/` | `bootstrap-backend.sh`, `restore-drill.sh`, `docs/scan.mjs` (generates the reference docs) | Tooling. |
| `docs/` | Specs, plans, guides, runbooks, generated references, decisions | See the [documentation map](#documentation-map). |

## Quick start

### Frontend only (mock API, no backend needed)

```bash
cd frontend
npm ci
npm start                 # http://localhost:4200, in-memory mock API with demo users
```

Sign in with an account from [docs/demo-credentials.json](docs/demo-credentials.json). These accounts exist **only** in the mock API:

| Role | Email | Password |
|---|---|---|
| Super admin | `superadmin@demo.test` | `SuperAdmin-Demo-123!` |
| Owner | `owner@demo.test` | `Owner-Demo-123!` |
| Accountant | `accountant@demo.test` | `Accountant-Demo-123!` |
| Chief accountant | `chief@demo.test` | `Chief-Demo-123!` |

More accounts (another accountant, a tax specialist, a second owner and two client users) are listed in the credentials file. Accounts with two-step verification use the code `123456`. They are demo data, not real credentials.

### With the real API (MongoDB backend)

```bash
docker compose up -d mongo          # single-node replica set on 127.0.0.1:27017
cd backend-mongo
npm ci
cp .env.example .env
npm run db:seed                     # indexes, Demo Office, roles, one user per role (password printed once)
npm run dev                         # http://localhost:3000/api/health -> {"status":"ok","db":"up"}

cd ../frontend
npm run start:api                   # proxies /api and /sanctum to port 3000
```

`npm run dev:memory` in `backend-mongo` starts the API on an in-memory MongoDB, with no Docker. With the real API, sign in with the users the seed script printed, not the mock demo accounts. Full steps: [docs/setup-mongodb.md](docs/setup-mongodb.md).

### Legacy Laravel stack (frozen)

Needs Docker. See [docs/setup.md](docs/setup.md) (`./scripts/bootstrap-backend.sh`, `docker compose up -d`, migrate, seed). Mail lands in Mailpit at http://localhost:8025.

## Modules

The sidebar shows only the modules a person's permissions allow. **Backend** says whether a real API exists.

### Office operations

| Module | What it does | Backend |
|---|---|---|
| **Dashboard** | Landing page with the person's summary. | Mock |
| **Clients** | Client records, onboarding and approval, lifecycle, assignment of accountants. A person sees only the clients assigned to them, except owners, office managers, super admins and (by default) chief accountants. | Mock |
| **Documents** | Client documents with a review state, categories, expiry tracking, and requested-document lists. | Mock |
| **Smart documents** | Upload a PDF, read it (OCR for scans), let an AI service propose field values, review and approve them, track the lifecycle and send reminders before important dates. See the [module guide](docs/modules/smart-documents/README.md). | **Real** (needs the real API) |
| **Tasks** | Work items with assignees, due dates, blocking and workload. | Mock |
| **Approvals** | Inbox of items waiting for the signed-in person. Nobody decides their own request. | Mock (core approval workflow engine is real) |
| **Client tickets** | Answer client messages, add internal notes the client never sees, assign, close and reopen. | Mock |
| **Appointments** | Confirm, propose another time, decline with a reason, mark done. No double-booking. | Mock |
| **Time sheets** | Log time per client with a billable flag (max 24 hours a day, week runs Sunday to Thursday), submit, approve or return. Nobody approves their own week. | Mock |
| **Cash forecast** | Thirteen weeks from open invoices and bills by due date, with the cash balance and optional payroll (assumed on the 28th). An estimate, not a promise. | Mock |

### Finance

| Module | What it does | Backend |
|---|---|---|
| **Accounting** | Chart of accounts, fiscal periods, journal entries with approval and posting, reports (trial balance, general ledger, journal register, AR/AP aging, revenue, reconciliation), account mappings, tax rates. | Mock |
| **Receivables (Invoicing)** | Invoices and receipts. Clients see only issued invoices. | Mock |
| **Payables** | Supplier bills, suppliers, expense claims. | Mock |
| **Statements** | Income statement, balance sheet, cash flow, changes in equity, and the statement mapping from ledger accounts. | Mock |
| **Tax** | Deadlines and returns by stage and kind. | Mock |
| **Analytics** | One tab per module (clients, documents, tasks, accounting, receivables, payables, tax, statements, HR, security and audit). Figures are computed live in the browser; charts print their values and have screen-reader tables. | Mock |

### Human resources

| Area | What it does | Backend |
|---|---|---|
| **HR core** (`/api/v1/staff/hrm/*`, `/api/v1/me/hrm/*`) | Branches, grades, positions, departments (tree), employee files with history, contracts (activate, renew, amend, terminate), dashboard, export. National ID, bank details and notes are returned only to people entitled to them. | **Real** |
| **Leave** (`/api/v1/staff/hr/*`) | Leave types, balances as a ledger, requests with approve, reject and cancel, adjustments. Working days only, one calendar year, no overlap, concurrency-safe. Entitlements are placeholders. | **Real** |
| **Payroll** | Monthly draft run, finalise (locks it and shows payslips to employees), salaries and change history. Income tax and social insurance are **not calculated**: enter them as deductions once the office confirms the rules. | Mock |

### Client portal (`/portal`)

For users of type *client*. Each portal user belongs to exactly one client and sees an overview, issued invoices (never drafts), requested and filed documents with review state, a message thread with the office, and appointment requests. Another client's data answers *not found*. Internal notes never leave the office. Mock API.

### Core: customization (administrator)

| Capability | Status |
|---|---|
| Read the merged field list of a document type, add, reorder, hide or require custom fields | Real API and screens |
| Create and delete admin-made document types, and manage their records | Real API and screens |
| Global search over records | Real API |
| Approval workflow: states, transitions, parallel approvals, conditions, delegation, notifications, escalation (escalation is not scheduled) | Real API, editor, record panel and inbox |
| Client scripts (run in a QuickJS sandbox in the record form) | Implemented |
| Server scripts (sandboxed hooks, script API, logs, auto-disable after repeated failures, `developer.scripts` permission) | Implemented |

Guides: [docs/modules/core](docs/modules/core/README.md), [global search](docs/modules/search/features/global-search.md). The module guides are the authority on exact status.

### Settings and administration

- **Settings → Roles and permissions:** the role-to-permission grid, editable by the owner.
- **Settings → Users:** assign roles to people.
- **Inbox:** notifications for tickets, appointments, leave decisions and time sheets awaiting approval (real API only).
- **Document types:** the customization core above.
- **Audit trail:** append-only, per-organization hash chain; verify it with `audit:verify` (Laravel) or `verifyChain` (`backend-mongo/src/db/audit-chain.ts`).

## Roles and permissions

Eleven roles exist in every organization: `super_admin`, `owner`, `office_manager`, `chief_accountant`, `accountant`, `tax_specialist`, `auditor`, `hr_payroll`, `sales`, `client`, `read_only`.

- The full matrix is in [docs/PERMISSIONS_MATRIX.md](docs/PERMISSIONS_MATRIX.md). It is a starting point; **the office owner must review it before production use.**
- Payroll permissions belong only to `owner` and `hr_payroll`. A test fails if another role is given one.
- `super_admin` passes every permission check. Keep it for one or two named people.
- Permissions are enforced on the server where a real API exists. Hiding a button or screen is a convenience, not security.
- After changing the matrix in `backend-mongo`, run `npm run db:sync-roles` to update existing organizations.

## Security

Summary only. The authoritative list, including open items, is [docs/security.md](docs/security.md).

- **Tenant isolation:** every backend collection carries `organizationId` taken from the session, never from the request. The Laravel stack adds PostgreSQL row-level security.
- **Sign-in:** cookie session with CSRF, no tokens in browser storage. Five wrong passwords lock an account for 15 minutes. Login is rate limited. Passwords need at least 12 characters and must not appear in known breaches. Two-step verification (authenticator app) is available.
- **Audit:** sign-ins, failures, lockouts, role changes and backend writes go to an append-only, hash-chained log. Salary amounts are never written to it.
- **Scripts:** user scripts run in a QuickJS sandbox with limits and isolation.
- **Open items:** dev MongoDB runs without authentication (enable auth and TLS before any shared deployment); e-mail verification, MFA and rate limiting are not yet built on the MongoDB API; password-reset and invitation e-mails are not built; backup RPO/RTO targets are unconfirmed.
- **Backups:** [docs/runbooks/backup-restore.md](docs/runbooks/backup-restore.md), drill script `scripts/restore-drill.sh`.

## Language and layout

Arabic and English, switchable from the header. Arabic is the default and the layout is right-to-left; the sidebar lands at the inline start in both directions. Translation files are `frontend/src/assets/i18n/ar.json` and `en.json`; add every new text to both. Backend validation messages follow the `Accept-Language` header.

## In-app module tips

Each staff module shows a short, dismissible **Tips** box at the top of its page (dashboard and client portal excluded). Dismissal is remembered per module in the browser, and a **Show tips** link brings it back. The component is `frontend/src/app/shared/components/module-tips/`, mounted once in the shell. Tip text lives under `tips.<module>` in the two i18n files; to add a module, add its route segment to the `MODULES` list in the component and its tips to both files.

## Testing

```bash
# frontend
cd frontend
npm test                          # unit tests (Vitest through ng test)
npm run lint:css                  # stylelint
npm run e2e                       # Playwright (browsers must be installed: npx playwright install)

# backend-mongo
cd backend-mongo
npm run db:check                  # self-contained, in-memory MongoDB
npm run hr:check                  # access control, hierarchy cycles, history, contracts, tenant isolation
npm run leave:check               # ledger, concurrency, rules
npm run core:check                # document types, custom fields, records
npm run workflow:check            # approval workflow
npm run docs:check                # smart documents: upload, extraction, review, lifecycle, reminders, permissions
```

The Laravel stack uses Pest (`docker compose exec app php artisan test`); its tests were written without Docker and have not been run (see [docs/security.md](docs/security.md)).

## Configuration

| Setting | Where | Meaning |
|---|---|---|
| `useMockApi` | `frontend/src/environments/*` | `true` for default dev, `false` for `start:api` and production builds, so the mock API and demo users are removed from production bundles. |
| `MONGODB_URI` | `backend-mongo/.env` | MongoDB connection (use a `mongodb+srv://` Atlas URI in production). |
| `FRONTEND_URL`, `REGISTRATION_OPEN` | Laravel `.env` | Mail link target; set `REGISTRATION_OPEN=false` after the office's accounts exist. |
| `ANTHROPIC_API_KEY`, `DOCS_OCR_PROVIDER`, `SMTP_HOST`, `DOCS_STORAGE_DIR` | `backend-mongo/.env` | Smart documents: AI extraction, OCR, e-mail and file storage. Each is optional; the screens say what is off. See the [module guide](docs/modules/smart-documents/README.md#configuration). |
| `ACCESS_CHIEF_ACCOUNTANT_OFFICE_WIDE` | Laravel `.env` | `true` (default) lets chief accountants see every client; `false` limits them to assignments. |

Never commit real secrets. `.env` files are ignored by git.

## Documentation map

- Overview and status: [System overview](docs/SYSTEM_OVERVIEW.md) · [Documentation index](docs/DOCUMENTATION_INDEX.md) · [Documentation coverage](docs/DOCUMENTATION_COVERAGE.md)
- Generated references (rebuild with `node scripts/docs/scan.mjs`, do not edit by hand): [API catalog](docs/API_CATALOG.md) · [Route map](docs/APPLICATION_ROUTE_MAP.md) · [Module catalog](docs/MODULE_CATALOG.md) · [Data dictionary](docs/DATA_DICTIONARY.md) · [Permissions matrix](docs/PERMISSIONS_MATRIX.md)
- Guides: [User guide](docs/user-guide.md) · [Administrator guide](docs/admin-guide.md) · [Setup (Laravel)](docs/setup.md) · [Setup (MongoDB)](docs/setup-mongodb.md) · [Security](docs/security.md) · [Backup and restore](docs/runbooks/backup-restore.md)
- Modules: [Core](docs/modules/core/README.md) · [Smart documents](docs/modules/smart-documents/README.md) · [Search](docs/modules/search/README.md)
- Planning: [Roadmap spec](docs/specs/2026-10-12-accounting-office-system-roadmap-design.md) · [Phase 1 plan](docs/plans/2026-10-12-phase-1-foundation.md) · [Decisions](docs/decisions/)

## Known limits

- Most modules run on the mock API only; their data is not persisted and their rules are not enforced by a server.
- Real backend today: sign-in and sessions, HR core, leave, smart documents, and the core customization and workflow engine.
- Not built: document upload from the portal, e-mail or SMS delivery of notifications, signing of documents, password-reset and invitation e-mails, half-day leave, leave accrual and carry-forward, recruitment, attendance, payroll on the real API, performance and training.
- Leave entitlements in the demo data are placeholders, not a statement of Egyptian labour law. The owner must confirm them against the law and contracts.
- Analytics reads records page by page in the browser; very large offices will need server-side aggregation.
- The Arabic PDF renderer choice awaits a native-reader review ([ADR-0001](docs/decisions/ADR-0001-arabic-pdf-renderer.md)).
