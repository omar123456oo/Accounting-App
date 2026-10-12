# Accounting Office Management System: Roadmap Design

Date: 2026-10-12
Status: Draft for user review
Scope: Whole-system architecture and 7-phase roadmap. Each phase gets its own detailed spec, plan and implementation cycle. No code is written under this spec.

## 1. Decisions

| Topic | Decision |
|---|---|
| Backend | Laravel 11, PHP 8.3, REST API under `/api/v1` (changed from Node/Express on user request) |
| Frontend | Angular, TypeScript, Bootstrap, reactive forms, ngx-translate (ar/en, RTL/LTR) |
| Database | PostgreSQL |
| Dev environment | Docker Compose: php-fpm + nginx, postgres, minio (S3), mailpit, queue worker, scheduler. Host has no PHP, Composer, psql or Docker installed; the user installs Docker. |
| Tenancy | Single database; `organization_id` on every tenant-owned row; client-scoped data also carries `client_id` |
| Architecture | Modular monolith (no microservices) |
| ETA e-invoicing | Payload builder, status tracking and evidence storage. A real HTTP adapter exists but stays disabled until the user supplies ETA sandbox credentials and signing setup. |
| Jurisdiction | Egypt (EGP, Arabic primary, English secondary) |

## 2. Repository layout

```
accounting-app/
  backend/        Laravel; app/Modules/<Module>/{Models,Policies,Services,Requests,Resources,Http,Database}
  frontend/       Angular: core/, shared/, layout/, features/{clients,accounting,invoicing,expenses,tax,payroll,reports,documents,workflows,client-portal,admin}
  docker/         images and compose config
  docs/           specs, ADRs, OpenAPI, guides, runbooks
```

Backend modules: Platform, Clients, Ledger, Receivables, Payables, Tax, Payroll, Reporting, Documents, Workflow, Planning. Cross-module calls go through service interfaces only. Controllers stay thin, business rules live in services and domain classes, and persistence stays in models/repositories.

## 3. Cross-cutting design

- **Money.** `NUMERIC(19,4)` in Postgres, `brick/money` in PHP, no floats. Rounding rules documented per currency.
- **Tenancy isolation.** Laravel global scope on `organization_id`, plus Postgres row-level security keyed on a per-request session setting as a second defence. Client-portal users are further limited to their own `client_id` by policies.
- **RLS mechanics (stress-test branch 1).** Each request and queued job runs inside a transaction that issues `SET LOCAL app.org_id = ...` (pooler-safe, resets at commit/rollback). The app connects as a non-owner role without `BYPASSRLS`; tenant tables use `FORCE ROW LEVEL SECURITY`; migrations use a separate owner role. Policies fail closed: no tenant set means zero rows. Queued jobs carry `organization_id` and set it themselves. Super Admin cross-org access uses an explicit, audited path. A CI test connects as the app role with no tenant set and asserts zero rows on every tenant table.
- **Staff-level confidentiality (stress-test branch 5).** `client_assignments` (user, client, role-on-client, effective dates) controls which staff can see which client. Policies grant access only with a matching assignment or a configured office-wide role (Owner, Office Manager, Chief Accountant). The same rule is enforced in the database through RLS on `client_id`, using a per-request set of accessible client IDs set alongside the org setting. Payroll and employee personal data form a separate permission domain, so client assignment never grants payroll access. Reports and global search filter by the same assignment set. CI runs a generated role × assignment × endpoint matrix.
- **Idempotency (stress-test branch 11).** State-changing financial endpoints (post, issue, record payment, allocate, submit) accept an `Idempotency-Key`. The server stores key, request hash and response per user and endpoint and replays the stored response on retry; the same key with a different payload returns 422. The Angular client generates one key per user action and disables the control while the request is in flight. Queue jobs with financial effects are idempotent and rely on unique constraints (for example one generated journal per `(source_type, source_id, purpose)`). Tests fire duplicate requests in sequence and in parallel and assert a single effect.
- **Dates and time zones (stress-test branch 12).** Business dates (posting, invoice, due, period boundaries) are Postgres `DATE`. Event times (created, approved) are `timestamptz` in UTC. The default application time zone is `Africa/Cairo`, configurable per organization, and period assignment uses the business date in that zone rather than the server clock. Fiscal years are per ledger entity with any start month. Gregorian is the system of record; Hijri display is an optional presentation setting, off by default. Tests cover 23:59 and 00:01 Cairo boundaries on period end.
- **Firm books vs client books.** Each account, journal and period belongs to exactly one `ledger_entity` (type `firm` or `client`), so the two can never mix.
- **Auth.** Laravel Sanctum SPA cookie sessions, optional TOTP MFA, rate limiting, lockout, secure password hashing.
- **Staff vs client users (stress-test branch 9).** `users.type` is `staff` or `client`. API route groups are separate (`/api/v1/staff/*`, `/api/v1/portal/*`) with middleware that rejects the wrong user type regardless of permissions. The Angular app has two lazy-loaded roots (`/app`, `/portal`) sharing `shared/`, so portal users never download staff code. Client accounts are created only by signed, expiring invitation. MFA is required for staff and enforced by policy for clients. Passwords use a minimum length and breached-password checks. The portal has shorter idle timeouts, session revocation on password change and login-anomaly alerts. Portal responses use dedicated API resources with whitelisted fields.
- **Authorization.** Roles and permissions (spatie/laravel-permission, organization-scoped) plus Laravel policies. Enforced on the backend. The UI only uses permissions to show or hide controls.
- **Background work.** Laravel queue and scheduler: reminders, recurring journals and invoices, escalations, ETA status polling.
- **API.** Versioned REST, Form Request validation, centralized exception handling, OpenAPI generated from code.
- **Audit.** Append-only `audit_events` with actor, action, entity, before/after, IP and a hash chain. Covers financial entries, approvals, permissions, exports and critical settings.
- **Audit chain mechanics (stress-test branch 2).** One chain per organization. The audit row is written in the same transaction as the business change, with the chain-head lock taken last. The hash is computed in the database (trigger/function), not the app. A nightly job re-verifies the chain and alerts on a break. A daily chain-head digest is anchored to separate object-lock storage. The claim is tamper-evidence, not tamper-proofing: a DB superuser could rewrite history, and the spec does not claim otherwise.
- **Documents.** Private S3/MinIO storage with no public URLs. Downloads are authorized, short-lived streamed responses. Uploads get size, type and magic-byte validation, with optional ClamAV scanning.
- **Secrets.** Environment or secret store on the backend only. Never in frontend code or source control.
- **Backup, restore and keys (stress-test branch 8).** Postgres continuous archiving with point-in-time recovery, plus a versioned document bucket, both encrypted and stored off-site in a separate account or region. Proposed RPO ≤ 15 minutes and RTO ≤ 4 hours, to be confirmed by the client. A scripted restore drill runs from Phase 1 onward in a scratch environment and checks row counts, the audit chain and that sampled documents open. Sensitive fields use application-level encryption with key IDs so keys can rotate while old data stays readable. Keys live in a secret store with a documented escrow procedure. ETA signing material stays outside the database (secret store or HSM).

## 4. Ledger design (Phase 3)

Tables, all with `organization_id`: `ledger_entities`, `accounts`, `fiscal_years`, `accounting_periods` (open, closed, locked), `journal_entries` (draft, pending_approval, approved, posted, reversed), `journal_lines`, `account_balances`, `number_sequences`.

- `journal_lines` hold debit and credit as `NUMERIC(19,4)`, with a CHECK that exactly one side is positive. They also carry currency, FX rate, and cost center, project and branch dimensions.
- Posting runs in one DB transaction: lock the period row, check the period is open, check debits equal credits, assign a gapless number via `SELECT ... FOR UPDATE` on the sequence, write the audit event, set status to posted.
- **Multi-currency (stress-test branch 6).** Each ledger entity has one functional currency (default EGP). Journal lines store transaction amount, currency, rate and base amount; the balance check runs on base amounts. Rates come from an effective-dated `exchange_rates` table with source and entering user, and posting snapshots the rate into the line. Rounding differences within a configurable tolerance post as an explicit line to a rounding account. Realized FX posts at payment allocation; unrealized revaluation is an auto-reversing period-end journal through the normal approval workflow (Phase 5). Phase 3 ships EGP-only operation with the columns and rate table already in place, so no later migration is needed.
- **Numbering (stress-test branch 3).** Sequences are configurable per `(ledger_entity, document_type, fiscal_year)` with a `gapless` flag. Numbers are assigned at posting or issue, never at draft creation (drafts use a temporary `DRAFT-` reference). A number consumed by a document that later fails (for example an ETA rejection) stays on that record with a cancelled or rejected status and is never reused, so every gap is explained by a visible record. The legally required numbering rules for Egyptian documents are on the specialist sign-off list. A concurrency test asserts that N parallel postings yield N unique, contiguous numbers.
- A deferred constraint trigger enforces balance at commit. Triggers reject UPDATE and DELETE on posted entries and lines.
- **Immutability scope (stress-test branch 4).** Triggers block UPDATE and DELETE on financial amounts and identity fields (account, amount, date, number, entity, source link). A small whitelist of non-financial metadata (attachment links, audited memo corrections) stays editable. Migrations that must backfill posted rows use the owner role with a documented, audited, migration-only trigger bypass that the app role can never invoke. After the configurable retention period (set by the client's legal advisor), an authorized procedure archives and anonymizes personal fields only. Financial amounts are never deleted. Support fixes always use reversal and replacement, never raw SQL.
- Corrections use reversal plus replacement entries. Reopening a period needs a specific permission, a stated reason and an audit record.
- System-generated journals store `source_type` and `source_id` so reports can drill down to source documents.
- **Balances (stress-test branch 7).** `journal_lines` are the source of truth, indexed on `(ledger_entity_id, account_id, posting_date)`. `account_balances` is a per-`(entity, account, period, dimensions)` summary updated in the posting transaction with an atomic upsert. A nightly job recomputes it from lines and alerts on any difference. A CI test asserts the line-level and balance-table paths agree. No materialized view or separate read store is added until Phase 7 measurements justify it.
- Financial reports read posted records only, and draft, unposted and finalized data are labelled separately.

## 5. Commercial design (Phase 4)

- Normalized invoices, invoice lines, credit notes, payments and `payment_allocations`. Allocation cannot exceed the open balance, enforced in a transaction with row locks.
- Revenue recognition is a per-service-type policy (on issue, on delivery, or deferred over a schedule) using configurable account mappings. Invoice creation alone does not always recognize revenue.
- Supplier bills, expense claims, approval limits, reimbursable-vs-firm expense distinction, AR and AP aging, and subledger-to-control-account reconciliation.

## 6. Tax and Egypt compliance design (Phase 5)

- `tax_rule_sets` are versioned by jurisdiction and effective dates, with `legal_source`, `approval_status` (draft, professionally_verified, retired) and `last_verified_at`.
- Finalized documents store the rule version they used. Rule updates never change finalized records.
- **No Egyptian tax, payroll or social-insurance rate is seeded as fact.** Rule sets ship empty or as clearly marked unverified demo values. Qualified Egyptian specialists enter and approve real values. The 2025 and 2026 amendments must be verified by them before any calculation goes live.
- ETA document states: prepared, reviewed, submitted, accepted, rejected, amended, cancelled. Each transition is stored in an append-only history. Only the ETA adapter can set submitted or accepted, and only on a real response, with the raw response stored as evidence.
- Adapter interface with `NullEtaClient` (default) and `HttpEtaClient` (preprod/prod). Signing material stays in backend secret storage.
- Payload tests run against the current official ETA SDK specification (sdk.invoicing.eta.gov.eg). The spec is fetched and checked at Phase 5, since it may change.
- Egyptian chart-of-accounts template provided as a configurable starting point, not a legal certification. Egyptian Accounting Standards statement formats are built with specialist review.

## 7. Workflow design

Generic engine: `workflow_definitions`, `workflow_instances`, `workflow_history`, with threshold-based approval chains, delegation and escalation. State transitions are allowed only through the service layer, so direct API calls cannot skip stages.

## 8. Phases and acceptance gates

| Phase | Deliverable | Gate |
|---|---|---|
| 1 Foundation | Docker env, Laravel and Angular scaffolds, auth with MFA, multi-tenant RBAC, audit chain, i18n with RTL, shell, CI | Cross-tenant and privilege-escalation test matrix passes. Ar/En switching flips RTL/LTR. |
| 2 Client ops | Clients, contacts, branches, onboarding workflow, documents, engagements, tasks | A client user cannot read another client's data or files. Onboarding cannot skip an approval. |
| 3 Core accounting | Chart of accounts, fiscal periods, journals, posting, ledger, trial balance, reconciliation | Unbalanced posting impossible (DB-level test). Posted rows immutable. Closed periods reject posting. Concurrent posting stays gapless. |
| 4 Commercial | Invoices, credit notes, payments, allocation, suppliers, bills, expenses, AR/AP aging | Every document links to its journal. Subledgers reconcile to control accounts. |
| 5 Compliance and reporting | Versioned tax rules, returns, filing workflow, ETA builder and adapter, financial statements, period closing | Statements reconcile to ledger. Rule changes do not alter finalized records. Specialist sign-off before production. |
| 6 Advanced | Payroll, budgets, forecasts, timesheets, client portal, notifications | Payroll matches approved scenarios. Portal exposes only authorized items. |
| 7 Production readiness | Security review, load and concurrency tests, backup and restore drill, monitoring, user guides | Restore drill succeeds. All 10 Egypt acceptance tests documented, specialist-dependent ones flagged. |

## 9. Testing strategy

- Backend: Pest/PHPUnit for unit, feature and API tests. Invariant tests for balancing, immutability, period locking, concurrency on posting and allocation. A generated access matrix of every endpoint against role, tenant and client.
- Frontend: Jest for units, Playwright for end-to-end including RTL/LTR screenshots.
- Seed data is fictional and labelled DEMO.
- CI runs lint, tests and a migration check on every push.

## 9a. Requirement traceability (stress-test branch 10)

| Requirement | Phase |
|---|---|
| Email delivery (Mailpit in dev, provider configurable) | 1 |
| Arabic PDF renderer spike (mPDF vs headless Chromium, recorded as an ADR; default to Chromium if mPDF output is not fully correct) | 1 |
| E-invoices (builder, statuses, evidence) and e-receipts | 5 |
| Support tickets, secure messaging, appointment scheduling | 6 |
| User guides (admin, accountant, tax specialist, client) | Written per phase, completed in 7 |

Document signing sits behind a `DocumentSigner` interface with a `NullSigner` for development. Real ETA signing (token, certificate or HSM, and where it runs) is an **open item** that depends on the user's ETA signing arrangement. Nothing claims signing works until it is verified against ETA.

## 10. Known limits and assumptions

- Legal correctness of Egyptian tax, payroll and reporting rules cannot be verified by the development team alone. It requires sign-off from Egyptian accounting and tax specialists. No compliance claim is made until that happens.
- Live ETA submission cannot be verified without the user's ETA credentials, sandbox access and signing setup.
- Arabic PDF output needs a renderer with an embedded Arabic font and shaping. The engine is chosen in Phase 1.
- Optional integrations (online payments, email providers, other regulators) are out of scope until requested.

## 11. Next step

Review this spec. Then Phase 1 gets its own detailed design, plan and implementation.

## Stress Test Results: Accounting Office roadmap

### Resolved Decisions
12 branches interrogated, 12 agreed, no counter-proposals from the user. Reflexion added branches 11 and 12.
1. RLS: `SET LOCAL` per transaction, non-owner role, `FORCE RLS`, fail closed, CI test.
2. Audit chain: per organization, same transaction, DB-side hash, nightly verify, external anchor, honest tamper-evidence claim.
3. Numbering: configurable gapless sequences assigned at post/issue; failed documents keep their number.
4. Immutability: financial and identity fields blocked; audited owner-only migration bypass; anonymize personal fields after retention.
5. Staff confidentiality: `client_assignments` enforced in policies and RLS; separate payroll domain.
6. FX: base-currency balance check, snapshotted rates, explicit rounding line, revaluation in Phase 5.
7. Balances: lines are the source of truth; per-period summary with nightly reconciliation.
8. Backup: PITR, versioned documents, restore drill from Phase 1, key rotation and escrow.
9. Portal auth: separate route groups, Angular roots, invitation-only clients.
10. Gaps: Arabic PDF spike, `DocumentSigner` interface, traceability table.
11. Idempotency keys on financial endpoints.
12. Dates: `DATE` vs `timestamptz`, Africa/Cairo default.

### Changes Made
All twelve are written into sections 3 to 5 and 9a above.

### Deferred / Parking Lot
- Real ETA signing arrangement (token, certificate or HSM) and where the signer runs: needs the user's ETA setup.
- RPO and RTO targets: proposed values need client confirmation.
- Legally required numbering rules and data-retention period: need Egyptian specialist and legal input.
- Choice of Arabic PDF renderer: decided by the Phase 1 spike.

### Confidence Assessment
- Overall: Medium-High for architecture. Low for Egyptian regulatory correctness until specialists sign off, as stated in section 10.
- Areas of concern: scope is very large, so phase boundaries must be held. Docker is not yet installed on the dev machine.
