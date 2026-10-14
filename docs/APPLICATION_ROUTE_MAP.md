---
title: "Application Route Map"
id: "SYS-ROUTE-001"
document_type: "generated-reference"
status: "generated"
verification_status: "source-scanned"
source_of_truth: "application-source-code"
generated_by: "scripts/docs/scan.mjs"
---

# Application Route Map

> Generated from the source code by `node scripts/docs/scan.mjs`. Do not edit by hand: change the code and run the scan again.
> **Verification status:** source-scanned (read from the code; not exercised at runtime).
> Scope: Angular routes under `frontend/src/app`. A guard shown here is a screen restriction only; enforcement belongs to the backend.


**116 routes.**

## Routes

| URL | Permission guard | Component | Source |
|---|---|---|---|
| `/` | — | redirect → app | `frontend/src/app/app.routes.ts:6` |
| `/**` | — | redirect → app | `frontend/src/app/app.routes.ts:30` |
| `/app` | — | (lazy children) | `frontend/src/app/app.routes.ts:20` |
| `/app` | — | Shell | `frontend/src/app/layout/shell/shell.routes.ts:6` |
| `/app` | — | Dashboard | `frontend/src/app/layout/shell/shell.routes.ts:10` |
| `/app/accounting` | — | (lazy children) | `frontend/src/app/layout/shell/shell.routes.ts:24` |
| `/app/accounting` | — | AccountingLayout | `frontend/src/app/features/accounting/accounting.routes.ts:8` |
| `/app/accounting` | — | redirect → journals | `frontend/src/app/features/accounting/accounting.routes.ts:12` |
| `/app/accounting/accounts` | ledger.view | AccountsPage | `frontend/src/app/features/accounting/accounting.routes.ts:13` |
| `/app/accounting/journals` | journals.view | JournalList | `frontend/src/app/features/accounting/accounting.routes.ts:15` |
| `/app/accounting/journals/:id` | journals.view | JournalDetail | `frontend/src/app/features/accounting/accounting.routes.ts:23` |
| `/app/accounting/journals/:id/edit` | journals.update | JournalForm | `frontend/src/app/features/accounting/accounting.routes.ts:24` |
| `/app/accounting/journals/new` | journals.create | JournalForm | `frontend/src/app/features/accounting/accounting.routes.ts:16` |
| `/app/accounting/periods` | ledger.view | PeriodsPage | `frontend/src/app/features/accounting/accounting.routes.ts:14` |
| `/app/accounting/reports` | reports.view | (lazy children) | `frontend/src/app/features/accounting/accounting.routes.ts:42` |
| `/app/accounting/reports` | reports.view | ReportsLayout | `frontend/src/app/features/accounting/reports/reports.routes.ts:4` |
| `/app/accounting/reports` | reports.view | redirect → trial-balance | `frontend/src/app/features/accounting/reports/reports.routes.ts:8` |
| `/app/accounting/reports/ap-aging` | reports.view | AgingReportPage | `frontend/src/app/features/accounting/reports/reports.routes.ts:13` |
| `/app/accounting/reports/ar-aging` | reports.view | AgingReportPage | `frontend/src/app/features/accounting/reports/reports.routes.ts:12` |
| `/app/accounting/reports/general-ledger` | reports.view | GeneralLedgerPage | `frontend/src/app/features/accounting/reports/reports.routes.ts:10` |
| `/app/accounting/reports/journal-register` | reports.view | JournalRegisterPage | `frontend/src/app/features/accounting/reports/reports.routes.ts:11` |
| `/app/accounting/reports/reconciliation` | reports.view | ReconciliationReportPage | `frontend/src/app/features/accounting/reports/reports.routes.ts:15` |
| `/app/accounting/reports/revenue` | reports.view | RevenueReportPage | `frontend/src/app/features/accounting/reports/reports.routes.ts:14` |
| `/app/accounting/reports/trial-balance` | reports.view | TrialBalancePage | `frontend/src/app/features/accounting/reports/reports.routes.ts:9` |
| `/app/accounting/settings` | — | SettingsLayout | `frontend/src/app/features/accounting/accounting.routes.ts:31` |
| `/app/accounting/settings` | — | redirect → mappings | `frontend/src/app/features/accounting/accounting.routes.ts:35` |
| `/app/accounting/settings/expense-categories` | mappings.manage | CataloguePage | `frontend/src/app/features/accounting/accounting.routes.ts:38` |
| `/app/accounting/settings/mappings` | mappings.manage | MappingsPage | `frontend/src/app/features/accounting/accounting.routes.ts:36` |
| `/app/accounting/settings/service-types` | mappings.manage | CataloguePage | `frontend/src/app/features/accounting/accounting.routes.ts:37` |
| `/app/accounting/settings/tax-rates` | tax.rates.manage | TaxRatesPage | `frontend/src/app/features/accounting/accounting.routes.ts:39` |
| `/app/analytics` | reports.view | AnalyticsLayout | `frontend/src/app/layout/shell/shell.routes.ts:20` |
| `/app/appointments` | appointments.manage | AppointmentsPage | `frontend/src/app/layout/shell/shell.routes.ts:17` |
| `/app/approvals` | workflows.approve | ApprovalsInbox | `frontend/src/app/layout/shell/shell.routes.ts:14` |
| `/app/clients` | clients.view | (lazy children) | `frontend/src/app/layout/shell/shell.routes.ts:11` |
| `/app/clients` | clients.view | ClientList | `frontend/src/app/features/clients/clients.routes.ts:6` |
| `/app/clients/:id` | clients.view | ClientDetail | `frontend/src/app/features/clients/clients.routes.ts:14` |
| `/app/clients/:id/edit` | clients.update | ClientForm | `frontend/src/app/features/clients/clients.routes.ts:15` |
| `/app/clients/new` | clients.create | ClientForm | `frontend/src/app/features/clients/clients.routes.ts:7` |
| `/app/doctypes` | — | (lazy children) | `frontend/src/app/layout/shell/shell.routes.ts:22` |
| `/app/doctypes` | admin.settings | DocTypeList | `frontend/src/app/features/core/core.routes.ts:6` |
| `/app/doctypes/:name/customize` | admin.settings | CustomizeForm | `frontend/src/app/features/core/core.routes.ts:7` |
| `/app/documents` | documents.view | (lazy children) | `frontend/src/app/layout/shell/shell.routes.ts:12` |
| `/app/documents` | documents.view | DocumentList | `frontend/src/app/features/documents/documents.routes.ts:4` |
| `/app/forecast` | forecast.view | ForecastPage | `frontend/src/app/layout/shell/shell.routes.ts:19` |
| `/app/hr` | leave.apply | (lazy children) | `frontend/src/app/layout/shell/shell.routes.ts:21` |
| `/app/hr` | leave.apply | HrLayout | `frontend/src/app/features/hr/hr.routes.ts:7` |
| `/app/hr` | leave.apply | redirect → leave | `frontend/src/app/features/hr/hr.routes.ts:11` |
| `/app/hr/contracts` | hr.contracts.view | ContractsPage | `frontend/src/app/features/hr/hr.routes.ts:14` |
| `/app/hr/dashboard` | hr.employees.view | HrmDashboard | `frontend/src/app/features/hr/hr.routes.ts:12` |
| `/app/hr/employees` | hr.view | EmployeeList | `frontend/src/app/features/hr/hr.routes.ts:16` |
| `/app/hr/employees/:id` | leave.apply | EmployeeDetail | `frontend/src/app/features/hr/hr.routes.ts:18` |
| `/app/hr/leave` | leave.apply | LeavePage | `frontend/src/app/features/hr/hr.routes.ts:15` |
| `/app/hr/organization` | hr.employees.view | OrganizationPage | `frontend/src/app/features/hr/hr.routes.ts:13` |
| `/app/hr/payroll` | payroll.view | PayrollPage | `frontend/src/app/features/hr/hr.routes.ts:19` |
| `/app/hr/settings` | hr.manage | HrSettingsPage | `frontend/src/app/features/hr/hr.routes.ts:20` |
| `/app/invoicing` | invoices.view | (lazy children) | `frontend/src/app/layout/shell/shell.routes.ts:26` |
| `/app/invoicing` | invoices.view | AccountingLayout | `frontend/src/app/features/invoicing/invoicing.routes.ts:24` |
| `/app/invoicing` | invoices.view | redirect → invoices | `frontend/src/app/features/invoicing/invoicing.routes.ts:29` |
| `/app/invoicing/credit-notes` | invoices.view | CreditList | `frontend/src/app/features/invoicing/invoicing.routes.ts:41` |
| `/app/invoicing/customers` | invoices.view | PartiesPage | `frontend/src/app/features/invoicing/invoicing.routes.ts:36` |
| `/app/invoicing/invoices` | invoices.view | DocList | `frontend/src/app/features/invoicing/invoicing.routes.ts:30` |
| `/app/invoicing/invoices/:id` | invoices.view | InvoiceDetail | `frontend/src/app/features/invoicing/invoicing.routes.ts:32` |
| `/app/invoicing/invoices/:id/edit` | invoices.update | InvoiceForm | `frontend/src/app/features/invoicing/invoicing.routes.ts:33` |
| `/app/invoicing/invoices/new` | invoices.create | InvoiceForm | `frontend/src/app/features/invoicing/invoicing.routes.ts:31` |
| `/app/invoicing/payments` | invoices.view | PaymentList | `frontend/src/app/features/invoicing/invoicing.routes.ts:38` |
| `/app/invoicing/payments/:id` | invoices.view | PaymentDetail | `frontend/src/app/features/invoicing/invoicing.routes.ts:40` |
| `/app/invoicing/payments/new` | payments.record | PaymentForm | `frontend/src/app/features/invoicing/invoicing.routes.ts:39` |
| `/app/invoicing/quotations` | invoices.view | QuotationList | `frontend/src/app/features/invoicing/invoicing.routes.ts:34` |
| `/app/invoicing/quotations/new` | invoices.create | InvoiceForm | `frontend/src/app/features/invoicing/invoicing.routes.ts:35` |
| `/app/invoicing/recurring` | invoices.view | RecurringPage | `frontend/src/app/features/invoicing/invoicing.routes.ts:42` |
| `/app/invoicing/statements/:partyId` | invoices.view | StatementPage | `frontend/src/app/features/invoicing/invoicing.routes.ts:37` |
| `/app/payables` | bills.view | (lazy children) | `frontend/src/app/layout/shell/shell.routes.ts:27` |
| `/app/payables` | bills.view | AccountingLayout | `frontend/src/app/features/payables/payables.routes.ts:25` |
| `/app/payables` | bills.view | redirect → bills | `frontend/src/app/features/payables/payables.routes.ts:30` |
| `/app/payables/bills` | bills.view | DocList | `frontend/src/app/features/payables/payables.routes.ts:31` |
| `/app/payables/bills/:id` | bills.view | BillDetail | `frontend/src/app/features/payables/payables.routes.ts:33` |
| `/app/payables/bills/:id/edit` | bills.update | BillForm | `frontend/src/app/features/payables/payables.routes.ts:34` |
| `/app/payables/bills/new` | bills.create | BillForm | `frontend/src/app/features/payables/payables.routes.ts:32` |
| `/app/payables/credits` | bills.view | CreditList | `frontend/src/app/features/payables/payables.routes.ts:42` |
| `/app/payables/expenses` | expenses.claim | ExpensesPage | `frontend/src/app/features/payables/payables.routes.ts:41` |
| `/app/payables/payments` | bills.view | PaymentList | `frontend/src/app/features/payables/payables.routes.ts:35` |
| `/app/payables/payments/:id` | bills.view | PaymentDetail | `frontend/src/app/features/payables/payables.routes.ts:37` |
| `/app/payables/payments/new` | payments.record | PaymentForm | `frontend/src/app/features/payables/payables.routes.ts:36` |
| `/app/payables/recurring` | bills.view | RecurringPage | `frontend/src/app/features/payables/payables.routes.ts:43` |
| `/app/payables/schedule` | bills.view | SchedulePage | `frontend/src/app/features/payables/payables.routes.ts:38` |
| `/app/payables/statements/:partyId` | bills.view | StatementPage | `frontend/src/app/features/payables/payables.routes.ts:40` |
| `/app/payables/suppliers` | bills.view | PartiesPage | `frontend/src/app/features/payables/payables.routes.ts:39` |
| `/app/records` | — | (lazy children) | `frontend/src/app/layout/shell/shell.routes.ts:23` |
| `/app/records/:doctype` | — | RecordList | `frontend/src/app/features/core/core.routes.ts:12` |
| `/app/records/:doctype/:name` | — | RecordForm | `frontend/src/app/features/core/core.routes.ts:13` |
| `/app/settings` | settings.manage | SettingsPage | `frontend/src/app/layout/shell/shell.routes.ts:33` |
| `/app/settings/roles` | settings.manage | RolesPage | `frontend/src/app/layout/shell/shell.routes.ts:34` |
| `/app/settings/users` | settings.manage | UserRolesPage | `frontend/src/app/layout/shell/shell.routes.ts:35` |
| `/app/statements` | reports.view | (lazy children) | `frontend/src/app/layout/shell/shell.routes.ts:25` |
| `/app/statements` | reports.view | AccountingLayout | `frontend/src/app/features/reports-fs/fs.routes.ts:22` |
| `/app/statements` | reports.view | redirect → income | `frontend/src/app/features/reports-fs/fs.routes.ts:27` |
| `/app/statements/mapping` | mappings.manage | FsMappingPage | `frontend/src/app/features/reports-fs/fs.routes.ts:32` |
| `/app/tasks` | tasks.view | (lazy children) | `frontend/src/app/layout/shell/shell.routes.ts:13` |
| `/app/tasks` | tasks.view | TaskList | `frontend/src/app/features/workflows/workflows.routes.ts:5` |
| `/app/tasks/:id` | tasks.view | TaskDetail | `frontend/src/app/features/workflows/workflows.routes.ts:7` |
| `/app/tasks/:id/edit` | tasks.manage | TaskForm | `frontend/src/app/features/workflows/workflows.routes.ts:8` |
| `/app/tasks/new` | tasks.manage | TaskForm | `frontend/src/app/features/workflows/workflows.routes.ts:6` |
| `/app/tickets` | tickets.manage | TicketsPage | `frontend/src/app/layout/shell/shell.routes.ts:15` |
| `/app/tickets/:id` | tickets.manage | TicketsPage | `frontend/src/app/layout/shell/shell.routes.ts:16` |
| `/app/timesheets` | timesheets.log | TimesheetsPage | `frontend/src/app/layout/shell/shell.routes.ts:18` |
| `/login` | — | Login | `frontend/src/app/app.routes.ts:7` |
| `/mfa-setup` | — | MfaSetupPage | `frontend/src/app/app.routes.ts:15` |
| `/portal` | — | (lazy children) | `frontend/src/app/app.routes.ts:25` |
| `/portal` | — | PortalLayout | `frontend/src/app/features/portal/portal.routes.ts:4` |
| `/portal` | — | PortalHome | `frontend/src/app/features/portal/portal.routes.ts:8` |
| `/portal/appointments` | — | PortalAppointments | `frontend/src/app/features/portal/portal.routes.ts:13` |
| `/portal/documents` | — | PortalDocuments | `frontend/src/app/features/portal/portal.routes.ts:10` |
| `/portal/invoices` | — | PortalInvoices | `frontend/src/app/features/portal/portal.routes.ts:9` |
| `/portal/tickets` | — | PortalTickets | `frontend/src/app/features/portal/portal.routes.ts:11` |
| `/portal/tickets/:id` | — | PortalTickets | `frontend/src/app/features/portal/portal.routes.ts:12` |
| `/register` | — | Register | `frontend/src/app/app.routes.ts:11` |

## Sidebar navigation

| Label key | Route | Permission | Group |
|---|---|---|---|
| nav.dashboard | `/app` | — | — |
| nav.clients | `/app/clients` | clients.view | — |
| nav.documents | `/app/documents` | documents.view | — |
| nav.tasks | `/app/tasks` | tasks.view | — |
| nav.approvals | `/app/approvals` | workflows.approve | — |
| nav.tickets | `/app/tickets` | tickets.manage | — |
| nav.appointments | `/app/appointments` | appointments.manage | — |
| nav.timesheets | `/app/timesheets` | timesheets.log | — |
| nav.forecast | `/app/forecast` | forecast.view | — |
| nav.analytics | `/app/analytics` | reports.view | — |
| nav.hr | `/app/hr` | leave.apply | — |
| nav.accounts | `/app/accounting/accounts` | ledger.view | nav.accounting |
| nav.periods | `/app/accounting/periods` | ledger.view | nav.accounting |
| nav.journals | `/app/accounting/journals` | journals.view | nav.accounting |
| nav.reports | `/app/accounting/reports` | reports.view | nav.accounting |
| nav.mappings | `/app/accounting/settings/mappings` | mappings.manage | nav.accounting |
| nav.taxRates | `/app/accounting/settings/tax-rates` | tax.rates.manage | nav.accounting |
| nav.invoices | `/app/invoicing/invoices` | invoices.view | nav.invoicing |
| nav.receipts | `/app/invoicing/payments` | invoices.view | nav.invoicing |
| nav.bills | `/app/payables/bills` | bills.view | nav.payables |
| nav.suppliers | `/app/payables/suppliers` | suppliers.manage | nav.payables |
| nav.expenses | `/app/payables/expenses` | expenses.claim | nav.payables |
| nav.incomeStatement | `/app/statements/income` | reports.view | nav.statements |
| nav.balanceSheet | `/app/statements/balance` | reports.view | nav.statements |
| nav.cashFlow | `/app/statements/cashflow` | reports.view | nav.statements |
| nav.equityChanges | `/app/statements/equity` | reports.view | nav.statements |
| nav.statementMapping | `/app/statements/mapping` | mappings.manage | nav.statements |
| nav.docTypes | `/app/doctypes` | admin.settings | — |
| nav.settings | `/app/settings` | settings.manage | — |
