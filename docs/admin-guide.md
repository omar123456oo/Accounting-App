# Administrator guide

This guide describes what exists in Phase 1 and nothing more. Sections for later phases are added when those phases ship.

## Roles and permissions

Eleven roles exist in every organization: `super_admin`, `owner`, `office_manager`, `chief_accountant`, `accountant`, `tax_specialist`, `auditor`, `hr_payroll`, `sales`, `client`, `read_only`.

- The full role-to-permission table is `backend/database/seeders/RolesAndPermissionsSeeder.php`. It is a starting point. **The office owner must review it before production use.**
- Payroll permissions belong only to `owner` and `hr_payroll`. A test fails if any other role is given one.
- `super_admin` passes every permission check. Keep it for one or two named people.
- Permissions are checked on the server. Hiding a button in the screen is a convenience, not security.

## Which clients a person can see

Owners, office managers and super admins see every client. Chief accountants do too while `ACCESS_CHIEF_ACCOUNTANT_OFFICE_WIDE=true` (the default); set it to `false` to limit them to their assignments. Everyone else sees only the clients assigned to them in `client_assignments`. The client list itself arrives in Phase 2.

## Signing in

- Five wrong passwords in a row lock the account for 15 minutes. The lockout is recorded in the audit trail.
- Login is limited to 6 attempts a minute per e-mail and address.
- Passwords must be at least 12 characters and not appear in known breaches.
- Two-step verification (authenticator app) can be turned on from the sign-in profile; once on, a code is required at every sign-in.

## Audit trail

Every sign-in, failure, lockout, two-step enrolment and role change is written to an append-only, hash-chained log. Verify it with:

```bash
docker compose exec app php artisan audit:verify          # all organizations
docker compose exec app php artisan audit:verify 1        # one organization
```

It also runs nightly at 02:00 and logs a `critical` line if the chain is broken.

## Human resources (frontend and mock API only)

Open **Human resources** in the sidebar. What each person sees depends on permissions:

| Area | Who | Permission |
|---|---|---|
| Own file, own salary, own balances, own finalised payslips, request leave | every staff member | `leave.apply` (own data is always readable) |
| All employee files (job, department, contacts, manager, status, National ID) | owner, HR | `hr.view` to read, `hr.manage` to edit |
| Leave: see everyone's requests, approve or reject | owner, HR | `leave.approve` (nobody decides their own request) |
| Salaries: base, allowances, deductions, change history | owner | `payroll.view` to read, `payroll.process` to change |
| Payroll runs: generate a monthly draft, finalise, payslips | owner | `payroll.view`, `payroll.process` |
| Leave types, weekend, holidays, unpaid-leave rule | owner, HR | `hr.manage` |

Rules worth knowing:

- **Leave** counts working days only (weekend and listed holidays are skipped), must stay inside one calendar year, cannot overlap other leave, and cannot exceed the balance of a limited type.
- **Payroll** gross = base + allowances; unpaid leave deducts base ÷ the configured days-in-month per day. **Income tax and social insurance are not calculated:** enter them as deductions once the office has confirmed the rules.
- A **draft** run can be regenerated after a salary change or a leave decision. **Finalising** locks it and makes payslips visible to employees.
- Salary amounts are never written to the audit trail, only who changed whose salary and when. Profile edits log which fields changed, not their values.
- The leave entitlements in the demo data are placeholders. The owner must confirm them against the law and contracts.

Roles and the permission grid (Settings → Roles & permissions) include the Human resources, Leave and Payroll modules, so the owner can give HR to a trusted colleague without giving payroll.

**Status:** these screens run on the in-memory mock API. The Laravel endpoints, tables and tenant policies for HR are not built yet; the backend only knows the permission names.

## Client portal, tickets, appointments, time sheets, forecast

**Client portal** (`/portal`, for users of type *client*): each portal user belongs to exactly one client. They see an overview, their issued invoices (never drafts), the documents the office asked for and the ones on file with their review state, a message thread with the office, and appointment requests. Another client's tickets, documents and invoices answer *not found*. Internal staff notes never leave the office.

**Ticket desk** (`tickets.manage`, given to staff who edit clients): answer client messages, add internal notes the client cannot see, assign, close and reopen. You only see tickets of clients you may see.

**Appointments** (`appointments.manage`): confirm a request (or propose another time), decline with a reason, mark done. A person cannot be double-booked.

**Notifications** (bell in both headers): new tickets and replies, appointment decisions, leave decisions, time sheets awaiting or decided.

**Time sheets** (`timesheets.log`, everyone; `timesheets.approve`, chief accountant and above): log time per client with a billable flag, at most 24 hours a day, week runs Sunday to Thursday. Submit the week; an approver approves or returns it with a reason. Nobody approves their own week. Submitted and approved time is locked.

**Cash forecast** (`forecast.view`): thirteen weeks from open invoices and bills by due date, the cash balance, and optional payroll. Collection rate and the delay for overdue invoices are assumptions you can change; payroll is assumed to be paid on the 28th. It is an estimate, not a promise.

Status: all of these run on the in-memory mock API. Document upload from the portal, e-mail or SMS delivery of notifications, and signing of documents are not built.

## Analytics

**Analytics** in the sidebar (needs `reports.view`) has one tab per module. A person sees only the tabs for modules they may open; ledger tabs have a ledger picker.

| Tab | Reads | What it tells you |
|---|---|---|
| Clients | clients | Lifecycle mix, new clients in 90 days, clients nobody is assigned to, clients per accountant, growth |
| Documents | documents | Review backlog, rejection rate, expiring or expired files, mix by category and client |
| Tasks | tasks | Open and overdue work, completion rate, blocked tasks, workload and lateness per person |
| Accounting | journals, trial balance | Entry flow and approval backlog, whether the books balance, largest debit and credit balances |
| Receivables | invoices, aging | Invoiced vs collected, outstanding, share overdue, aging buckets, who owes most (and concentration in the top three) |
| Payables | bills, aging | The same view of what the office owes |
| Tax | deadlines, returns | Overdue and upcoming deadlines, on-time filing rate, returns by stage and kind, open deadlines per person |
| Statements | income statement, balance sheet | Year-to-date revenue, gross and net margin, leverage, where the money goes, funding structure, liquidity |
| HR | employees, leave, payroll | Headcount and mix, who is on leave, leave days by type, requests waiting; net payroll per finalised month for payroll viewers |
| Security & audit | audit trail, roles | Events per day, failed sign-ins and lockouts, role changes, most active people, people per role, number of super admins |

Notes: figures are computed live from current records in the browser (the lists are read page by page, 100 at a time), so very large offices will want server-side aggregation later. Ratios divide by zero safely and show a dash. Every chart prints its values and has a screen-reader table; colour is never the only signal.

## Not in Phase 1

Password reset and invitation e-mails, the user and role management screens, client records, ledgers, invoicing, tax and payroll.
