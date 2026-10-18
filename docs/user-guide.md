# User guide

For the people who work in the accounting office and for their clients. It explains every part of the screen, what it is for, and how to do the common jobs. It does not cover installation (see [setup](setup.md)) or administration of the system itself (see the [administrator guide](admin-guide.md)).

> **Good to know before you start**
> - You only see the parts your role allows. If a menu item in this guide is missing from your sidebar, you do not have permission for it. Ask the office owner.
> - Many screens are still running on a practice (demo) data store, so what you enter may be lost when the session ends. The [README](../README.md#modules) says which modules are saved for real.
> - Amounts, tax rates, leave entitlements and the starter chart of accounts are **starting points**. A qualified accountant must confirm them before real use.

## Contents

1. [Getting started](#1-getting-started)
2. [Finding your way around](#2-finding-your-way-around)
3. [Dashboard](#3-dashboard)
4. [Clients](#4-clients)
5. [Documents](#5-documents)
   - [Smart documents: PDF reading, review and reminders](#5a-smart-documents)
6. [Tasks](#6-tasks)
7. [Approvals](#7-approvals)
8. [Client tickets](#8-client-tickets)
9. [Appointments](#9-appointments)
10. [Time sheets](#10-time-sheets)
11. [Cash forecast](#11-cash-forecast)
12. [Accounting](#12-accounting)
13. [Receivables (invoicing)](#13-receivables-invoicing)
14. [Payables](#14-payables)
15. [Financial statements](#15-financial-statements)
16. [Analytics](#16-analytics)
17. [Human resources](#17-human-resources)
18. [Inbox and notifications](#18-inbox-and-notifications)
19. [Settings](#19-settings)
20. [Document types and customization](#20-document-types-and-customization)
21. [Client portal](#21-client-portal)
22. [Tips, language and accessibility](#22-tips-language-and-accessibility)
23. [Troubleshooting](#23-troubleshooting)
24. [Glossary](#24-glossary)

---

## 1. Getting started

### Sign in

1. Open the application address your office gave you.
2. Enter your **Email address** and **Password**, then press **Sign in**.
3. If your account uses two-step verification, enter the **6-digit code** from your authenticator app.

Rules to know:

- Five wrong passwords in a row lock the account for **15 minutes**. Wait, then try again; do not keep trying.
- Passwords need at least **12 characters** and must not be a password that has appeared in known leaks.
- The error message is the same for an unknown email and a wrong password. This is deliberate.

### Register a new office

The **Register** page creates a new office and its owner account. It may be switched off by your administrator. After registering, follow the confirmation link sent to your email where e-mail verification is enabled.

### Turn on two-step verification

Open **mfa-setup** from your profile, scan the QR code with an authenticator app, and enter the code to confirm. From then on a code is required at every sign-in. Keep the app on a phone you will not lose.

### Sign out

Open the user menu in the header and choose **Sign out**. Do this on shared computers.

## 2. Finding your way around

| Part of the screen | What it does |
|---|---|
| **Sidebar** | The list of modules. Grouped headings (Accounting, Receivables, Payables, Statements) contain several pages. |
| **Header** | Global search, notifications bell, language switch and the user menu (shows who you are signed in as). |
| **Global search** | Searches records across modules. Recent searches are remembered. |
| **Page title and buttons** | The page name, with the main actions (for example **New client**) on the same line. |
| **Tips box** | A short blue box at the top of each module with advice. Close it with the X; bring it back with **Show tips**. |

Lists share the same habits: a search box, filters, page controls at the bottom, and often **Export page as CSV** to download what is on screen.

## 3. Dashboard

The first page after signing in. It shows only the groups relevant to your role:

| Group | Figures |
|---|---|
| **My work** | My open tasks, my overdue tasks, pending approvals, documents awaiting review |
| **Receivables and payables** | Overdue invoices, bills due in 7 days, outstanding receivables, amount due in 7 days |
| **Office** | Active clients, leave requests to decide, open client tickets, timesheets to approve |
| **Tax and compliance** | Overdue deadlines, due in 7 days, due in 30 days, returns awaiting review |

"Nothing waiting" means you are up to date. "Nothing to show for your role yet" means your role has no figures here.

## 4. Clients

**Sidebar → Clients.** The office's client records.

### Who sees which clients

Owners, office managers and super admins see every client. Chief accountants do too unless your office limited them. Everyone else sees only the clients assigned to them.

### Find a client

Type a name or registration number in **Search by name or registration number** and press **Search**. Use the status filter (**All**, Lead, Onboarding, Active, Suspended, Closed). Tick **Show archived** to include archived clients.

### Add or edit a client

1. Press **New client** (or open a client and press **Edit client**).
2. Fill the sections: **Identity** (legal name, trade name, legal form), **Registration** (commercial registration and tax registration numbers), **Business details** (address, industry, fiscal year start month), **Tax profile** (VAT registered, tax type), **Assigned accountants**.
3. Save.

The **Tax type** is a free label. The legal tax classification must be confirmed by a tax specialist.

### The client page

A client has tabs:

| Tab | Contents |
|---|---|
| **Overview** | Main details and status |
| **Contacts** | People at the client; mark the **Authorized representative** |
| **Branches** | The client's locations |
| **Bank accounts** | Bank, account number, IBAN, currency |
| **Agreements** | Engagement agreements with start, end and renewal dates and the **monthly fee**; status Draft, Active, Expired or Terminated |
| **Communication** | Call, meeting, email and note records, with an optional follow-up date |
| **History** | Who changed what, and when |
| **Onboarding** | The onboarding case (below) |
| **Documents** | Documents filed for this client |

**Lifecycle.** Use **Move to …** to change the status. A client moves Lead → Onboarding → Active; it can be Suspended or Closed later.

**Archive.** **Archive client** hides a client from the default list but does not delete it. **Restore client** brings it back.

### Onboarding a new client

Onboarding is a guided case with stages: **Document collection → Verification → Approval → Completed (active client)**. A case can also be sent back.

1. On the client page open **Onboarding** and press **Start onboarding**.
2. In **Document checklist**, work through each item (commercial register, tax card, ID of the authorized representative, signed engagement letter, plus any you add with **Add item**). Link a document to the item, then mark it **Received**, **Approved** or **Rejected**.
3. Tick the **Confirmations**: the representative's identity is verified, and the client accepted the engagement.
4. Press **Submit for verification**, then **Submit verification for approval**.
5. A **different person** presses **Approve and activate client** (or **Reject**, with a comment, which returns the case to document collection and clears the confirmations). Nobody approves their own submission.

The checklist template is editable and is **not legal advice**: the office decides which documents it needs.

## 5. Documents

**Sidebar → Documents.** Files kept for clients, with a review step.

### Upload

1. Press **Upload document**.
2. Choose the **Client**, pick the **File**, and fill **Name**, **Category** (Onboarding, Bookkeeping, Payroll, Tax, Other), **Year**, **Period** (for example `2026-09` or `Q3`), **Expiry date**, **Tags** (separated by commas) and **Description**.
3. If the document answers a request for a missing document, choose it in **Fulfils a request**.
4. Press **Upload**.

Allowed files: PDF, XLSX, CSV, PNG, JPG, up to 10 MB. The system rejects empty files, files that are too large, and files whose content does not match their extension.

### Review

Each document is **Awaiting review**, **Approved** or **Rejected**. A reviewer opens it and presses **Approve** or **Reject** (a rejection needs a reason). Review comments are kept on the document.

### Versions

**New version** adds a file as the next version. Earlier versions stay available, and the document returns to review. The detail page shows version, file name, size, who uploaded it and a SHA-256 fingerprint; **Download** gets the file.

### Expiry

Documents show **Expires soon** or **Expired**. Tick **Expiring or expired only** to list them.

### Requesting missing documents

Use **Missing documents → Request a document**: say **What is needed** and a **Due date**, then **Send request**. Requests are Open, Fulfilled or Cancelled and show **Overdue** after the due date. The client sees the request in the portal.

## 5A. Smart documents

**Sidebar → Smart documents** (needs the live system; it is not shown in the practice mode). Upload a PDF and the system reads it, suggests the details, and reminds the right people before important dates. The older **Documents** page above is separate.

### Upload and read

1. **Upload**: drag a PDF into the box (or press it to choose). Only PDF files up to the size shown are accepted. Fill in the title, document type (or leave it on **Detect automatically**), owner, department, employee and **Who can open it**. **Restricted** documents are visible only to you, the owner, the reviewer and people who manage documents.
2. The file is stored exactly as you sent it. If the same file was uploaded before, you are told and can choose **Upload it anyway**.
3. The document page shows **Reading the file…** until the system has finished. Scanned pages are read with OCR when your office has it switched on; otherwise the screen says so.

### Review and approve

Open **Review**. The PDF is on one side and the details on the other.

- Suggested values are only suggestions. **Nothing is saved to the document until you press Approve details.** The status stays **Pending review** until then.
- Fields with a coloured **confidence** badge, a warning or no confidence are highlighted: check them first. **Show source** jumps the PDF to the page and shows the exact text the value came from.
- For each suggestion you can **Accept**, edit it, or **Reject** it (the field is emptied). **Not found** means the document does not state it; the system never makes a value up. **Sensitive** fields are hidden from people without access.
- **Save draft** keeps your work so you can finish later. If the document type looks wrong, pick another and press **Read again as this type**.
- If reading failed, press **Enter the details by hand**. If AI reading is not set up, all fields start empty and you type them.

### After approval

The status follows the dates: **Active**, **Expiring soon** (within the window set for the type), **Expired** (the day after the expiry date). On the document page:

| Tab | Shows |
|---|---|
| **Overview** | The approved details |
| **File** | The PDF preview |
| **Versions** | Every uploaded file, with size and a fingerprint; download any |
| **History** | Who did what, and the steps of each reading |
| **Reminders** | The rules in force, scheduled reminders, and who was told |

- **Replace file** uploads a new version. It is read and must be approved again; reminders pause until then.
- **Start renewal** pauses reminders. **Complete renewal** asks for the new dates (the expiry must be later) and restarts the reminders from them.
- **Edit** changes details and approved values. Changing a date recalculates the reminders.
- **Archive** stops reminders and makes the document read-only. **Delete** hides it everywhere (the audit trail keeps the record).

### Reminders

**Smart documents → Reminders** has four tabs: **Upcoming**, **Failed** (with **Retry**), **Rules** and **Delivery history**. A rule says which date to count from, **when** (for example 30, 7 and 1 days before), at what time and in which time zone, **who** to tell, by **in-app** message and/or **e-mail**, whether to repeat, and whether to **escalate** to a manager if nobody acknowledges it. Rules can cover the whole office, one document type or one document. They run on the server even when nobody is signed in. **Acknowledge** a reminder you received to stop its escalation. If e-mail is not set up, e-mail reminders are recorded as **not sent**.

### Document types (administrators)

**Smart documents → Document types** lists the types. For each you can rename it, set its "expiring soon" days and keywords, and edit its **fields**: add, reorder, make required, mark **sensitive**, give a field a **meaning** (for example *Expiry date*, which reminders use), or switch it off. A switched-off field is kept, so old approved values are not lost.

### Dashboard

**Smart documents → Overview** shows real counts: documents, awaiting review, being read, expiring soon, expired, failed readings, upcoming and failed reminders, the next expiry dates and recent activity. Filter by upload dates, type, status, owner, department and reviewer. A banner lists any service that is not set up (AI, OCR, e-mail).

## 6. Tasks

**Sidebar → Tasks.**

- Switch between **My tasks** and **All visible tasks**; filter by status (including **Open (not finished)**) or **Overdue only**.
- **New task:** give it a **Title**, **Description**, **Client**, **Assignee**, **Priority** (Low, Normal, High, Urgent), **Due date**, and, if it cannot start before another task, **Depends on**.
- **Statuses:** To do, In progress, Blocked, Done, Cancelled. Use **Mark as …** on the task page.
- **Reassign** changes the assignee and requires a **Reason**.
- **Comments** and **History** on each task record who did what.

## 7. Approvals

**Sidebar → Approvals.** Your inbox of items waiting for you (for example client onboarding). Open an item and press **Approve** or **Reject**, with a comment. Filter with **Show**. You can never decide something you requested yourself.

## 8. Client tickets

**Sidebar → Client tickets.** Messages from clients.

- Open a ticket to read the conversation and reply.
- Add an **internal note** for colleagues. The client never sees internal notes.
- **Assign** the ticket to someone, **close** it when finished, **reopen** it if needed.
- You only see tickets of clients you are allowed to see.

## 9. Appointments

**Sidebar → Appointments.** Meeting requests from clients.

- **Confirm** a request, **propose another time**, or **decline** with a reason.
- Mark a meeting **done** afterwards.
- A person cannot be booked in two meetings at the same time.

## 10. Time sheets

**Sidebar → Time sheets.**

1. Log time per client: date, hours and whether it is **billable**. At most **24 hours a day**.
2. The week runs **Sunday to Thursday**. When it is complete, **submit** it.
3. An approver (chief accountant and above) **approves** it, or **returns** it with a reason. Nobody approves their own week.
4. Submitted and approved time is **locked**.

## 11. Cash forecast

**Sidebar → Cash forecast.** A thirteen-week view built from open invoices and bills by due date, the current cash balance, and optional payroll.

- **Collection rate** and the **delay for overdue invoices** are assumptions; change them to see the effect.
- Payroll is assumed to be paid on the 28th.
- It is an **estimate, not a promise**.

## 12. Accounting

**Sidebar → Accounting.** The general ledger. At the top, the **Active ledger** picker chooses between the **Firm books** and **Books of** a client.

### Chart of accounts

Lists accounts in a **Tree** or **List** view. Each account has a code, a name, a **category** (Asset, Liability, Equity, Revenue, Expense), a normal balance (Debit or Credit), a parent, and whether it is **Postable** (entries can be posted to it) or a **Group** (only organises the tree).

- **New account** / **Edit account**, **Deactivate** / **Activate** (an inactive account takes no new entries).
- **Import starter chart** adds an editable chart in the usual Egyptian layout. Codes that already exist are left unchanged. It is **not** a professional certification; an accountant must review it.
- An account with posted entries cannot change category.

### Fiscal periods

Create a **New fiscal year**; it starts on the first day of a month and has twelve monthly periods. Each period is **Open**, **Closed** or **Locked**:

| Action | Effect |
|---|---|
| **Close** | No more entries are posted into the period |
| **Lock** | A stronger close, used when statements are final |
| **Reopen** | Allows posting again. A **reason is required** and is recorded in the audit trail |

### Journal entries

A journal entry moves through: **Draft → Pending approval → Approved → Posted**, and can end **Reversed**.

1. **New entry**; choose the type (**Standard** or **Opening balance**), date, reference and description.
2. Add **Lines**: each has an **Account** and exactly one of **Debit** or **Credit**. The page shows **Balanced** when debits equal credits, otherwise how far out of balance it is.
3. **Save draft**, then **Submit for approval**.
4. A **different person** presses **Approve** (or **Return to draft** with a reason). Then **Post**.
5. Only drafts can be edited or deleted. To correct a posted entry press **Reverse**: it posts a new entry with debits and credits swapped, linked to the original, which stays in the books. You can choose the reversal date and **Also create a replacement draft**.

The **Workflow timeline** on each entry records every step.

### Reports

| Report | Shows |
|---|---|
| **Trial balance** | Balances of every account; check that the books balance |
| **General ledger** | All movement for an account |
| **Journal register** | Entries in a date range |
| **Receivables aging** / **Payables aging** | What is owed to the office / by the office, by age |
| **Revenue** | Revenue summary |
| **Reconciliation** | Cross-checks between ledgers and sub-ledgers |

Reports default to **Posted only**. **Include unposted entries (preview)** marks the report **DRAFT-INCLUDED**: it is a preview, not the books. Use **Export CSV** to download.

### Commercial settings

Under **Accounting → Commercial settings**:

- **Account mappings:** choose which ledger accounts invoices, bills and payments post to (receivables and payables control, VAT output and input, deferred revenue, customer credit, supplier prepayments, revenue per service type, expense per category, and the bank and cash accounts). **A document cannot be issued or approved while a mapping it needs is missing.**
- **Service types** and **Expense categories:** the catalogues used on invoices, bills and claims.
- **Tax rates:** VAT and withholding rates. A rate not marked as professionally verified is refused on documents unless the policy **Allow documents to use tax rates that are not professionally verified** is on; a warning shows on every document using one.

## 13. Receivables (invoicing)

**Sidebar → Receivables.** Money clients owe the office.

| Page | Use |
|---|---|
| **Invoices** | Create, approve and issue invoices; track their status |
| **Receipts** | Record customer payments and allocate them |
| **Customers** | The people and companies you bill; payment terms in days; link a customer to a client |
| **Quotations** | Offers, with a valid-until date |
| **Credit notes** | Reduce an invoice's open balance |
| **Recurring invoices** | Templates that create a normal draft on demand (nothing is created automatically) |
| **Statement** | A customer's statement of account |

**Invoice status:** Draft, Pending approval, Issued, Partially paid, Paid, Overdue, Cancelled, Credited.

### Make an invoice

1. **New invoice**: choose the customer (payment terms suggest the due date), add lines by **service type** with quantity, price and tax rate.
2. Save the draft, send for approval if your office requires it, and **issue** it. Issuing posts the journal entry.

### Record a receipt

**Record receipt** → choose the **Bank or cash account**, **Payment date**, **Amount** and **Reference**, and allocate to open invoices. Any part not allocated is held as **customer credit**; use **Allocate** later or **Refund credit**. If no bank or cash account is mapped (see Account mappings), payments cannot be recorded.

### Quotations

A quotation is Draft, Sent, Accepted, Rejected or Converted. **Mark as sent**, record the answer, then **Convert to invoice** when accepted.

### Credit notes

From an invoice press the credit action, enter **Credit amount**, **Credit date** and **Reason**. The credit cannot exceed the open balance and posts a reversing entry in proportion to the lines.

### Deferred revenue

For services billed in advance, recognition is **Deferred over a period**. **Recognize revenue** posts one journal per monthly installment due up to a date you choose. If any installment cannot be posted (for example the period is closed), nothing is posted.

## 14. Payables

**Sidebar → Payables.** Money the office owes.

| Page | Use |
|---|---|
| **Supplier bills** | Enter and approve bills |
| **Suppliers** | Supplier list, payment terms, balances (**We owe**, **Prepaid**) |
| **Expenses** | Expense claims by staff |
| **Payments** | Pay bills (payment vouchers) |
| **Supplier credits** | Credits from suppliers |
| **Recurring expenses** | Templates for regular costs |
| **Payment schedule** | Bills due within a chosen number of days, grouped Overdue, Due within 7 days, Later |
| **Statement** | A supplier's statement |

Approving a bill posts it to the ledger. A supplier can only be archived when there is no open balance. Staff submit **expense claims**; an approved claim creates an employee reimbursement payable.

## 15. Financial statements

**Sidebar → Statements.**

| Statement | Notes |
|---|---|
| **Income statement** | Revenue and expenses for a range |
| **Balance sheet** | Assets, liabilities and equity at a date |
| **Cash flow statement** | Cash movement |
| **Statement of changes in equity** | Equity movement |
| **Statement mapping** | Assigns each ledger account to a statement line |

Options: choose the **Fiscal year**, **Add a comparative period** (shows variance and variance %), and filter by **Branch** or **Cost centre** (a filtered slice does not reconcile with the whole trial balance).

Each statement shows **reconciliation checks** (assets = liabilities + equity; cash change equals ledger cash movement; closing equity). A line saying **NOT reconciled** shows the difference. The banner **Finalized: all periods are locked** or **Not finalized** tells you whether the range includes unlocked periods.

The default mapping is a **starter template and not a legal certification**. An accountant must review the mapping and the statements before anyone relies on them.

## 16. Analytics

**Sidebar → Analytics** (needs report permission). One tab per module: **Clients, Documents, Tasks, Accounting, Receivables, Payables, Tax, Statements, HR, Security & audit**. You see only the tabs for modules you may open. Figures are calculated live from current records; a ratio with a zero divisor shows a dash. Every chart prints its values and has an accessible table.

## 17. Human resources

**Sidebar → Human resources.** What you see depends on your permissions.

| Tab | Who | Contents |
|---|---|---|
| **My file** | everyone | Your profile, salary, leave balances and payslips |
| **Leave** | everyone | Request leave; managers decide |
| **Dashboard** | HR | Headcount, new hires, probation, contracts ending soon, turnover, charts, birthdays and anniversaries |
| **Employees** | HR | Employee files |
| **Organization** | HR | Departments (tree), branches, job grades, positions |
| **Contracts** | HR | Employment contracts |
| **Payroll** | owner, payroll | Monthly payroll runs |
| **HR settings** | HR | Leave types, weekend, holidays, unpaid-leave rule |

### Request leave

1. **Leave → Request leave**; choose **Leave type**, **From**, **To** and an optional **Reason**.
2. The system shows the **Working days** (weekends and listed holidays are skipped).
3. **Submit request**. Status: **Pending**, then **Approved**, **Rejected** or **Cancelled**. You can **Cancel** your own pending request.

Rules: a request must stay inside one calendar year, cannot overlap other leave and cannot exceed the balance of a limited type. Managers with approval permission use **Approve** and **Reject**; nobody decides their own request. HR can **File leave for this employee**. The entitlements shown are placeholders until the owner confirms them against the law and contracts.

### Employee files

Tabs: **Profile**, **Salary**, **Leave**, **Payslips**. Search by name, email or job title; filter by department and status (**Active** or **Terminated**). Employment types: Full time, Part time, Contract, Intern. National ID, bank details and notes are shown only to people entitled to them. **On leave today** is flagged in the list.

### Salary

Shows **Base salary**, **Allowances**, **Deductions**, each line's name, type and amount, **Effective from** and a **Change history** (who changed it, never the amounts in the audit trail). Income tax and social insurance are **not calculated**: enter them as deductions once the office has confirmed the rules.

### Contracts

Types: Permanent, Fixed term, Probation, Part time, Consultant. Statuses: Draft, Active, Renewed, Expired, Terminated. Use **New contract**, then **Activate**, **Renew** (the renewal starts the day after the old one ends so there is no gap) or **Terminate** (with a reason). **Ending within 60 days** lists contracts to act on.

### Organization

Add and edit **Departments**, **Branches**, **Job grades** and **Positions**. Units are **Closed** rather than deleted and can be **Reopened**. Each unit shows its active headcount.

### Payroll

1. Choose the **Month** and press **Generate draft**. Gross pay is base plus allowances; unpaid leave deducts base ÷ the configured days in a month per day.
2. A **draft** can be regenerated after a salary change or a leave decision. Nothing is visible to employees yet.
3. **Finalise payroll** locks the run and makes payslips visible to employees. Finalising cannot be undone.
4. Open a payslip with **View**; **Print** it.

## 18. Inbox and notifications

The **bell** in the header and **Inbox** list: new tickets and replies, appointment decisions, leave decisions, and time sheets awaiting or decided. (The Inbox page needs the live server.) E-mail and SMS delivery of notifications are not built yet.

## 19. Settings

**Sidebar → Settings** (owner and administrators).

- **Preferences → Language:** switch the interface language and reading direction.
- **My account:** your name, account type (Office staff or Client) and the permissions granted to you.
- **Office configuration:** shortcuts to account mappings, service types, expense categories, tax rates, fiscal periods, chart of accounts, statement mapping, roles, users and document types.
- **Roles and permissions:** create roles and tick what each can do. Review the starting grid before real use. Payroll permissions belong only to the owner and the HR role. Hiding a button is a convenience; the server decides what you can do.
- **Users:** assign roles to staff members. Keep the Super Admin role for one or two named people.

## 20. Document types and customization

**Sidebar → Document types** (administrators). Lets the office shape the system without a developer.

- **Customize** a built-in document type: add your own fields, reorder, hide or make them required.
- **Create** your own document type, then work with its **records** (create, edit, search, delete).
- **Workflow:** define an approval workflow for a type: states, transitions, who may move between them, parallel approvals, conditions, delegation and notifications. Pending items appear in **Approvals** and **Inbox**.
- **Scripts:** a person with the developer permission can attach client scripts (run in the form) and server scripts (run on events). They run in a restricted sandbox; a script that keeps failing is switched off automatically.

Changes affect every record of that type, so test with one record first. See the [core module guide](modules/core/README.md) for detail.

## 21. Client portal

For clients, at **/portal**. A client user sees only their own data.

| Tab | What the client does |
|---|---|
| **Home** | Sees what they owe, documents the office needs, open conversations and upcoming meetings |
| **Invoices** | Reads issued invoices (never drafts): number, date, due date, total, balance |
| **Documents** | Sees **What we need from you** and the **Documents on file** with their review status |
| **Messages** | Writes to the office (**New message**: subject, about, message) and reads replies |
| **Appointments** | **Request a meeting**: sees status and sends requests |

Internal staff notes never reach the client. Uploading documents from the portal is not built yet.

## 22. Tips, language and accessibility

- **Tips:** each module shows a **Tips** box. Close it with the X; **Show tips** reopens it. Your choice is remembered per module on this browser.
- **Language:** **العربية / English** in the header or under Settings. Arabic switches the whole screen to right-to-left.
- **Accessibility:** charts print their values and have a screen-reader table; colour is never the only signal; forms show messages next to the field.

## 23. Troubleshooting

| Problem | What to try |
|---|---|
| "Wrong credentials" | Check the email and password for spaces; make sure you are on the right address. After five failures wait 15 minutes |
| A menu item is missing | You lack the permission. Ask the owner (Settings → Roles and permissions) |
| "Not found or you do not have access" | The record does not exist or belongs to a client you cannot see |
| Cannot issue an invoice or approve a bill | A needed account mapping is missing (Accounting → Commercial settings → Account mappings) |
| Cannot post an entry | The period is Closed or Locked, or the entry is out of balance; ask someone with permission to reopen the period |
| Cannot record a payment | No bank or cash account is ticked in the account mappings |
| "You submitted this, so a different person must approve it" | Ask a colleague; this protects the office |
| My data disappeared | The module is on the demo data store, which resets with the session |

## 24. Glossary

| Term | Meaning |
|---|---|
| **Ledger** | The book of accounts. The firm has its own; each client may have one |
| **Journal entry** | A set of debit and credit lines that must balance |
| **Posting** | Making an entry part of the official books |
| **Reversal** | Correcting a posted entry with an opposite entry, leaving the original visible |
| **Fiscal period** | One accounting month; open, closed or locked |
| **Control account** | Account holding the total owed by customers or to suppliers |
| **Aging** | Grouping of unpaid amounts by how overdue they are |
| **Allocation** | Matching a receipt or payment to specific invoices or bills |
| **Credit note** | A document that reduces what a customer owes |
| **Deferred revenue** | Money billed in advance, recognised as revenue over time |
| **Four-eyes** | The rule that a different person must approve your work |
| **Onboarding** | The guided process of accepting a new client |
| **DocType** | A type of document with its own fields, permissions and workflow |
| **Tenant / office** | One organization's separate data space |
