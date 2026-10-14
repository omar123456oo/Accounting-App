# HR module: analysis and phased plan (Phase 1, discovery)

Status: decisions in section 8 answered (Phases 2+3 first; Egypt, rates entered later and configurable; optional employee login). Phases 2+3 backend and HR dashboard/organization/contracts screens are implemented; see docs/setup-mongodb.md.

## 1. Current stack (verified in the repository)

| Layer | What is there |
|---|---|
| Frontend | Angular 22, standalone components, signals, lazy routes, Bootstrap 5.3, ngx-translate (Arabic + English, RTL), Vitest unit tests, Playwright e2e |
| API in use | An in-memory **mock API** (`core/mock-api/`, about 11,000 lines) answers every `/api/v1/staff/*` call during `npm start`. Modules: clients, ledger, commercial, tax, HR, engage, documents, tasks, approvals, audit |
| Real backend A | `backend/` Laravel + PostgreSQL (row-level security). Only auth and a ping route exist. Never run (no Docker on this machine) |
| Real backend B | `backend-mongo/` Node + Express + Mongoose + MongoDB 7 (replica set in `docker-compose.yml`). Built this session: register, login, logout, sessions, CSRF, lockout, roles, audit hash chain. Tested on an in-memory replica set |
| Auth | Cookie session + XSRF double-submit; permissions are strings like `leave.approve`; guards are UX only, the server must re-check |
| Tenancy | One office = one organization. Every record needs `organizationId` |

## 2. What HR already has (frontend + mock API)

Routes `/app/hr/*` (now registered): leave (apply, approve, cancel, balances), employee list and detail (profile, manager, emergency contact, salary panel with history, leave panel), payroll (run per month: generate, finalize, payslips), settings (leave types, weekend days, holidays), HR analytics tab, dashboard cards (leave to decide), timesheets (engage).

Existing permissions: `hr.view`, `hr.manage`, `leave.apply`, `leave.approve`, `payroll.view`, `payroll.process`, `timesheets.log`, `timesheets.approve`. Roles `hr_payroll`, `owner`, `office_manager` already carry them.

Reuse, do not duplicate: approvals inbox (`workflows`), tasks (offboarding checklists), documents module (employee files), engage notifications bell, audit log, `PageHeader`, `StatusBadge`, `Modal`, `CommentDialog`, analytics charts (`PieChart`, `LineChart`, `ColumnChart`, `BarList`).

## 3. Gaps against the master prompt

| Area | State |
|---|---|
| Dashboard (HR) | Missing: headcount, probation, contract expiry, birthdays, turnover |
| Employee | Basic profile only. No employee number, branch, grade, education, certificates, documents, history tab, exit/rehire |
| Organization | Department is free text. No branches, positions, grades, hierarchy tree, effective dating |
| Recruitment | Not built |
| Contracts | Not built |
| Attendance | Not built (timesheets are billable time, not attendance) |
| Leave | Built; missing accrual/carry-forward, half days, ledger-based balance, calendar |
| Payroll | Basic salary + allowances/deductions + run/finalize. Missing overtime, loans, bonuses, review/approve stage, reversal, bank export |
| Benefits, performance, training, relations, offboarding, assets | Not built |
| Self-service | Partial (own leave, own payslip) |
| HR request center | Not built (approvals exist for onboarding only) |

## 4. Proposed architecture

```
Angular  features/hr/*            lazy routes, one folder per submodule
   |  /api/v1/staff/hr/*   (and /api/v1/me/* for self-service)
Express  backend-mongo/src/hr/<submodule>/{model,service,routes,rules,*.spec}
   |  Mongoose, transactions on the replica set
MongoDB  organizationId on every document; audit hash chain reused
```

Rules for every endpoint: session -> CSRF -> permission check -> **record-level scope** (self, direct reports, or office-wide) -> validate -> service -> audit event. Salary, bank, medical and disciplinary fields are excluded by default (`select: false`) and need their own permission.

The mock API stays the development backend. Each submodule is built mock-first (so the UI is testable now) and then ported to the Mongo service behind the same contract, so the Angular code does not change.

## 5. MongoDB model (proposed; embed vs reference)

| Collection | Key points |
|---|---|
| employees | `userId?`, `employeeNo` unique per org, personal, employment (dept, position, branch, grade, managerId, type, status, dates), `bank` (restricted), embedded `emergencyContacts`, `education`, `certificates`; history in `employeeEvents` |
| employeeEvents | append-only: transfers, promotions, status changes with `effectiveFrom` (preserves history) |
| branches, departments (parentId), positions, grades | reference data; cycle check on `departments.parentId` and `employees.managerId` |
| contracts | employeeId, type, start/end, probationEnd, version, status, amendments embedded, alert days from settings |
| attendanceRecords | unique `(orgId, employeeId, date)`; punches embedded; schedules in `workSchedules` |
| leaveTypes, leavePolicies, leaveRequests | request has state machine |
| leaveTransactions | **ledger**: grant, accrual, usage, reversal, adjustment; balance = sum; unique `(requestId, kind)` blocks double deduction |
| payrollPeriods, payrollRuns, payrollItems | run states draft -> reviewed -> approved -> final; final is immutable, corrections are new reversal runs; money as decimal strings |
| hrRequests, approvalInstances | generic request center with configurable levels, no self-approval |
| jobRequisitions, candidates, applications, interviews, offers | candidate dedupe on normalized email/phone |
| performanceCycles, reviewTemplates, reviews | templates are data |
| trainingCourses, trainingEnrollments, benefits, benefitEnrollments | |
| employeeCases | restricted; per-record access list |
| offboardingRecords | checklist from template, links to tasks and assets |
| notifications | unique `(userId, dedupeKey)` stops duplicate reminders from jobs |
| documentMetadata | file bytes in object storage (MinIO in compose), metadata here |

## 6. Permissions (new, mapped to existing roles)

`hr.employees.view|manage`, `hr.salary.view|manage`, `hr.bank.view`, `hr.org.manage`, `hr.contracts.manage`, `hr.attendance.view|manage|approve`, `hr.requests.manage`, `hr.recruit.view|manage`, `hr.performance.manage`, `hr.training.manage`, `hr.benefits.manage`, `hr.cases.view|manage`, `hr.offboarding.manage`, `hr.reports.view`; existing `leave.*` and `payroll.*` kept. Existing roles map: owner = all; `hr_payroll` = all except `hr.cases.*`; office_manager = non-payroll; others unchanged. Scope (self / team / office) is enforced in the service layer, not by the name.

## 7. Phases, risks, acceptance

| Phase | Deliverable | Acceptance |
|---|---|---|
| 2 Foundations | Permissions, HR nav + sidebar, record-scope helper, audit hooks, shared table/filter components | Access-matrix test: every HR route rejects every role that lacks the permission; IDOR test on employee ids |
| 3 Core HR | Org (branches, departments tree, positions, grades), employee profile tabs, employee numbers, contracts, documents, history | Duplicate number rejected; cycle in hierarchy rejected; history preserved after transfer |
| 4 Operations | Attendance, leave ledger + calendar + half days, HR request center, notifications and jobs | No double deduction under concurrent approvals; overlapping leave rejected; reminders sent once |
| 5 Talent | Recruitment, performance, training | Candidate converts to employee in one transaction |
| 6 Pay | Payroll stages, overtime, loans, bonuses, reversal, bank export, benefits | Final run cannot change; second finalize is a no-op; totals reconcile to items |
| 7 Services | Self-service, cases, offboarding, assets | Employee cannot read another employee through any id; clearance checklist audited |
| 8 Release | Tests, security review, indexes, migrations/rollback, docs | All automated tests green; indexes verified with `explain` |

Risks: scale (about 15 submodules; this is months of work, so it must be done incrementally); the Mongo backend currently has no business modules, so HR on Mongo depends on clients/users endpoints; mock/real divergence if contracts drift (mitigate with shared TypeScript types and the api:check style tests); payroll legality.

## 8. Decisions needed before implementation

1. Jurisdiction: the project targets Egyptian accounting offices. Confirm Egypt for payroll (income tax brackets, social insurance, overtime, leave entitlements) and who supplies the rates and effective dates. Until confirmed, all statutory values stay as editable settings with no defaults.
2. Backend: confirm `backend-mongo/` (Express + Mongoose) is the real backend for HR, and the Laravel/Postgres folder is retired.
3. Order: start with Phase 2 + Phase 3 (foundations, organization, employee profile, contracts) or another phase.
4. Attendance source: manual/web check-in only, or import from biometric devices (file or API)?
5. Employee identity: should every employee have a login (employee = user), or can HR keep employees without accounts (for example site staff)?
