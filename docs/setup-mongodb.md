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
