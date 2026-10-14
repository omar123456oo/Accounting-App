# MongoDB backend (`backend-mongo/`)

Node + Express + Mongoose. Collections mirror the Phase 1 tables: organizations, users, roles, clientassignments, idempotencykeys, passwordresettokens, auditevents, auditchainheads.

```bash
docker compose up -d mongo          # single-node replica set rs0 on 127.0.0.1:27017
cd backend-mongo
npm ci
cp .env.example .env
npm run db:seed                     # builds indexes, seeds Demo Office, roles and one user per role (prints a password once)
npm run dev                         # http://localhost:3000/api/health -> {"status":"ok","db":"up"}
npm run db:check                    # self-contained test on an in-memory MongoDB (no Docker needed)
```

- Connection: `src/db/connection.ts`, configured by `MONGODB_URI` (use a `mongodb+srv://` Atlas URI in production).
- Tenant isolation: Postgres row-level security does not exist in MongoDB. Every tenant collection carries `organizationId`; every query must filter by it.
- Audit chain: `src/db/audit-chain.ts` appends in a transaction; `verifyChain` detects edits. Mongoose hooks block updates/deletes, but a direct driver write can bypass them. In production give the app user insert/find only on `auditevents`.
- Frontend: `cd frontend && npm run start:api` proxies `/api` and `/sanctum` to port 3000. `npm run api:check` tests register, login, logout, lockout and CSRF over HTTP.
- Not yet built: e-mail verification (accounts are verified on registration), MFA, rate limiting, and every module beyond sign-in.
- Dev MongoDB runs without authentication. Enable auth and TLS before any shared deployment.

## HR core (`backend-mongo/src/hr/`)

Served at `/api/v1/staff/hrm/*` (staff) and `/api/v1/me/hrm/*` (the signed-in person's own records). The older `/api/v1/staff/hr/*` (leave, payroll) is still the mock-only API.

| Area | Endpoints |
|---|---|
| Dashboard | `GET dashboard?expiringInDays=60` |
| Organization | `GET/POST/PATCH branches, grades, positions, departments`, `GET departments-tree` (units are closed with `active:false`, never deleted) |
| Employees | `GET/POST employees`, `GET/PATCH employees/:id`, `POST employees/:id/status`, `POST employees/:id/rehire`, `GET employees/:id/history`, `GET employees-export` |
| Contracts | `GET/POST contracts`, `GET contracts/:id`, `POST contracts/:id/activate\|renew\|amend\|terminate`, `POST contracts-expire-due` |

Permissions: `hr.employees.view|manage`, `hr.bank.view`, `hr.org.manage`, `hr.contracts.view|manage`, `hr.reports.view`. Without `hr.employees.view` a person sees only their own record and their direct reports; anything else answers 404. National ID, bank details and HR notes are never returned unless the caller is entitled to them.

After changing the permission matrix run `npm run db:sync-roles` to update roles in organizations that already exist. `npm run hr:check` runs the acceptance test (access control, hierarchy cycles, history, contract rules, tenant isolation).

Not yet built: documents/photos, recruitment, attendance, leave ledger, payroll stages, benefits, performance, training, HR request center, offboarding. Future-dated organizational changes are rejected; changes take effect now with an effective date in the history.

## Leave module (`backend-mongo/src/hr/leave.*`)

Served at `/api/v1/staff/hr/*`, the same paths the Angular leave screens already call, so `npm run start:api` now works for leave: `leave-types`, `settings`, `leave-balances`, `leave` (list, apply, `:id/approve|reject|cancel`) and `leave-adjustments`.

- Balances are a **ledger** (`leaveledgers`): every request writes `hold` (pending), then `hold_release` plus `use` (approved) or `hold_release` (rejected/cancelled), and `use_reverse` when HR undoes an approved one. A request can write each kind only once (unique index), so a day cannot be deducted twice. `leavebalanceheads` caches the totals and changes in the same transaction.
- Concurrency: every change for one employee takes a per-employee lock row inside the transaction, and the balance check and reservation are one atomic update. Tests fire parallel requests at the same balance and the same dates.
- Rules: working days skip the weekend days and holidays in `hrsettings`; a request stays in one calendar year; overlapping pending/approved leave is refused; nobody decides their own request; only people with `hr.manage` file on behalf of others or undo an approved leave. Server messages follow `Accept-Language` (Arabic or English).
- Entitlements are **placeholders** (annual 21, sick 15, emergency 6, unpaid unlimited) created on first use. The office must set its own; they are not a statement of Egyptian labour law.
- A registered office owner automatically gets employee file `EMP-00001`, so they can request leave immediately.
- Test: `npm run leave:check`.

Not yet built: half-day leave, accrual and carry-forward rules, leave calendar, supporting documents, notifications to approvers.

## Core metadata (`backend-mongo/src/core/`)

Served at `/api/v1/staff/core/*` (staff only). A DocType describes a kind of document. Built-in types are declared in `builtin-doctypes.ts` (today only `leave_request`); admin-made types are stored per organization.

| Endpoint | Permission | Purpose |
|---|---|---|
| `GET meta/:doctype` | the DocType's own `viewPermission` | Built-in or own fields merged with custom fields, in order. Unknown or not-permitted both answer 404. |
| `GET doctypes` | authenticated staff | DocTypes the caller may view |
| `GET/PUT customize/:doctype` | `admin.settings` | Read, or atomically replace, the custom fields of a DocType |
| `POST doctypes`, `DELETE doctypes/:name` | `admin.settings` | Create or delete an admin-made DocType (deleting also removes its custom fields) |
| `GET search?q=&type=` | per DocType `viewPermission` | Up to 5 records per admin-made DocType, matched literally on its `searchFields`; under 2 characters returns nothing |

Rules: field names are lowercase letters, digits and underscores (max 64); a custom field cannot reuse a built-in field name; select fields need options; at most 100 custom fields. Every customize or DocType write is added to the audit chain (`customize.update`, `doctype.created`, `doctype.deleted`).

`npm run core:check` is the acceptance test (merge order, validation, permissions, tenant isolation, search, audit chain).

Not yet built: UI to customize forms, create or edit records of admin-made types (there is no record write API yet, so search finds nothing until there is), workflow engine, client and server scripts.

