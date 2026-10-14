---
title: "Permissions Matrix"
id: "SYS-PERM-001"
document_type: "generated-reference"
status: "generated"
verification_status: "source-scanned"
source_of_truth: "application-source-code"
generated_by: "scripts/docs/scan.mjs"
---

# Permissions Matrix

> Generated from the source code by `node scripts/docs/scan.mjs`. Do not edit by hand: change the code and run the scan again.
> **Verification status:** source-scanned (read from the code; not exercised at runtime).
> Roles and permissions are read from `backend-mongo/src/db/permissions.ts` by running `roleMatrix()`. The note in that file asks for the owner to review the matrix before production use.


**47 permissions, 10 roles.** ✔ = granted.

| Permission | owner | office_manager | chief_accountant | accountant | tax_specialist | auditor | hr_payroll | sales | client | read_only |
|---|---|---|---|---|---|---|---|---|---|---|
| `clients.view` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |  | ✔ |
| `clients.create` | ✔ | ✔ | ✔ |  |  |  |  | ✔ |  |  |
| `clients.update` | ✔ | ✔ | ✔ | ✔ |  |  |  | ✔ |  |  |
| `clients.archive` | ✔ | ✔ | ✔ |  |  |  |  |  |  |  |
| `journals.view` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |  |  |  | ✔ |
| `journals.create` | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| `journals.update` | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| `journals.delete` | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| `journals.amend` | ✔ | ✔ | ✔ |  |  |  |  |  |  |  |
| `journals.approve` | ✔ | ✔ | ✔ |  |  |  |  |  |  |  |
| `journals.post` | ✔ | ✔ | ✔ |  |  |  |  |  |  |  |
| `invoices.view` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |  | ✔ |  | ✔ |
| `invoices.create` | ✔ | ✔ | ✔ | ✔ |  |  |  | ✔ |  |  |
| `invoices.update` | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| `invoices.delete` | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| `invoices.amend` | ✔ | ✔ | ✔ |  |  |  |  |  |  |  |
| `invoices.approve` | ✔ | ✔ | ✔ |  |  |  |  |  |  |  |
| `invoices.issue` | ✔ | ✔ | ✔ |  |  |  |  |  |  |  |
| `expenses.view` | ✔ | ✔ | ✔ | ✔ |  | ✔ |  |  |  | ✔ |
| `expenses.create` | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| `expenses.approve` | ✔ | ✔ | ✔ |  |  |  |  |  |  |  |
| `tax.view` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |  |  |  | ✔ |
| `tax.prepare` | ✔ | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |
| `tax.review` | ✔ | ✔ | ✔ |  | ✔ |  |  |  |  |  |
| `hr.view` | ✔ | ✔ |  |  |  |  | ✔ |  |  |  |
| `hr.manage` | ✔ | ✔ |  |  |  |  | ✔ |  |  |  |
| `leave.apply` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |  |  |
| `leave.approve` | ✔ | ✔ |  |  |  |  | ✔ |  |  |  |
| `payroll.view` | ✔ |  |  |  |  |  | ✔ |  |  |  |
| `payroll.process` | ✔ |  |  |  |  |  | ✔ |  |  |  |
| `reports.view` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |  |  |  | ✔ |
| `documents.view` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |  | ✔ |
| `documents.upload` | ✔ | ✔ | ✔ | ✔ | ✔ |  | ✔ |  |  |  |
| `documents.review` | ✔ | ✔ | ✔ |  |  |  |  |  |  |  |
| `workflows.view` | ✔ | ✔ | ✔ | ✔ |  | ✔ |  |  |  | ✔ |
| `workflows.approve` | ✔ | ✔ | ✔ |  |  |  |  |  |  |  |
| `admin.users` | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `admin.roles` | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `admin.settings` | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `admin.audit` | ✔ | ✔ | ✔ |  |  | ✔ |  |  |  |  |
| `hr.employees.view` | ✔ | ✔ |  |  |  |  | ✔ |  |  |  |
| `hr.employees.manage` | ✔ | ✔ |  |  |  |  | ✔ |  |  |  |
| `hr.bank.view` | ✔ | ✔ |  |  |  |  | ✔ |  |  |  |
| `hr.org.manage` | ✔ | ✔ |  |  |  |  | ✔ |  |  |  |
| `hr.contracts.view` | ✔ | ✔ |  |  |  |  | ✔ |  |  |  |
| `hr.contracts.manage` | ✔ | ✔ |  |  |  |  | ✔ |  |  |  |
| `hr.reports.view` | ✔ | ✔ |  |  |  |  | ✔ |  |  |  |

## Enforced by backend routes

- `admin.settings`
- `clients.view`
- `hr.contracts.manage`
- `hr.contracts.view`
- `hr.employees.manage`
- `hr.employees.view`
- `hr.manage`
- `hr.org.manage`
- `hr.reports.view`
- `leave.apply`

## Used by the frontend but not defined in the backend permission list

These guard screens in the Angular app (mock API) and have no backend counterpart yet. **Verification status:** needs reconciliation before the backend takes over those modules.

- `appointments.manage`
- `bills.create`
- `bills.update`
- `bills.view`
- `expenses.claim`
- `forecast.view`
- `ledger.view`
- `mappings.manage`
- `payments.record`
- `settings.manage`
- `suppliers.manage`
- `tasks.manage`
- `tasks.view`
- `tax.rates.manage`
- `tickets.manage`
- `timesheets.log`
