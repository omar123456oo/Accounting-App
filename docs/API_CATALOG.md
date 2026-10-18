---
title: "API Catalog"
id: "SYS-API-001"
document_type: "generated-reference"
status: "generated"
verification_status: "source-scanned"
source_of_truth: "application-source-code"
generated_by: "scripts/docs/scan.mjs"
---

# API Catalog

> Generated from the source code by `node scripts/docs/scan.mjs`. Do not edit by hand: change the code and run the scan again.
> **Verification status:** source-scanned (read from the code; not exercised at runtime).
> Scope: `backend-mongo` only. The Angular app uses an in-memory mock API for every module not listed here (see [SYSTEM_OVERVIEW](SYSTEM_OVERVIEW.md)).


**107 endpoint definitions found; 107 reachable from `app.ts`.**

## Endpoints

| Method | URL | Permission (backend) | Reads body | Source |
|---|---|---|---|---|
| GET | `/api/health` | — | no | `backend-mongo/src/app.ts:17` |
| POST | `/api/v1/auth/login` | — | yes | `backend-mongo/src/auth/routes.ts:48` |
| POST | `/api/v1/auth/logout` | — | no | `backend-mongo/src/auth/routes.ts:75` |
| GET | `/api/v1/auth/me` | — | no | `backend-mongo/src/auth/routes.ts:81` |
| POST | `/api/v1/auth/register` | — | yes | `backend-mongo/src/auth/routes.ts:20` |
| GET | `/api/v1/me/hrm/contracts` | — | no | `backend-mongo/src/hr/contract.routes.ts:189` |
| GET | `/api/v1/me/hrm/employee` | — | no | `backend-mongo/src/hr/employee.routes.ts:227` |
| GET | `/api/v1/staff/core/customize/:doctype` | admin.settings | no | `backend-mongo/src/core/customize.routes.ts:56` |
| PUT | `/api/v1/staff/core/customize/:doctype` | admin.settings | yes | `backend-mongo/src/core/customize.routes.ts:62` |
| GET | `/api/v1/staff/core/directory` | admin.settings | no | `backend-mongo/src/core/workflow.routes.ts:40` |
| GET | `/api/v1/staff/core/doctypes` | — | no | `backend-mongo/src/core/meta.routes.ts:20` |
| POST | `/api/v1/staff/core/doctypes` | admin.settings | yes | `backend-mongo/src/core/customize.routes.ts:83` |
| DELETE | `/api/v1/staff/core/doctypes/:name` | admin.settings | no | `backend-mongo/src/core/customize.routes.ts:112` |
| GET | `/api/v1/staff/core/meta/:doctype` | — | no | `backend-mongo/src/core/meta.routes.ts:9` |
| GET | `/api/v1/staff/core/notifications` | — | no | `backend-mongo/src/core/workflow.routes.ts:220` |
| POST | `/api/v1/staff/core/notifications/:id/read` | — | no | `backend-mongo/src/core/workflow.routes.ts:227` |
| GET | `/api/v1/staff/core/people` | — | no | `backend-mongo/src/core/workflow.routes.ts:47` |
| GET | `/api/v1/staff/core/records/:doctype` | — | no | `backend-mongo/src/core/records.routes.ts:87` |
| POST | `/api/v1/staff/core/records/:doctype` | — | yes | `backend-mongo/src/core/records.routes.ts:107` |
| DELETE | `/api/v1/staff/core/records/:doctype/:name` | — | no | `backend-mongo/src/core/records.routes.ts:155` |
| GET | `/api/v1/staff/core/records/:doctype/:name` | — | no | `backend-mongo/src/core/records.routes.ts:99` |
| PUT | `/api/v1/staff/core/records/:doctype/:name` | — | yes | `backend-mongo/src/core/records.routes.ts:134` |
| POST | `/api/v1/staff/core/records/:doctype/:name/actions` | — | yes | `backend-mongo/src/core/workflow.routes.ts:103` |
| GET | `/api/v1/staff/core/scripts` | developer.scripts | no | `backend-mongo/src/core/scripts.routes.ts:36` |
| POST | `/api/v1/staff/core/scripts` | developer.scripts | yes | `backend-mongo/src/core/scripts.routes.ts:68` |
| DELETE | `/api/v1/staff/core/scripts/:id` | developer.scripts | no | `backend-mongo/src/core/scripts.routes.ts:114` |
| GET | `/api/v1/staff/core/scripts/:id` | developer.scripts | no | `backend-mongo/src/core/scripts.routes.ts:50` |
| PUT | `/api/v1/staff/core/scripts/:id` | developer.scripts | yes | `backend-mongo/src/core/scripts.routes.ts:89` |
| GET | `/api/v1/staff/core/scripts/:id/logs` | developer.scripts | no | `backend-mongo/src/core/scripts.routes.ts:139` |
| POST | `/api/v1/staff/core/scripts/:id/test` | developer.scripts | yes | `backend-mongo/src/core/scripts.routes.ts:122` |
| GET | `/api/v1/staff/core/scripts/client/:doctype` | — | no | `backend-mongo/src/core/scripts.routes.ts:29` |
| GET | `/api/v1/staff/core/search` | — | no | `backend-mongo/src/core/search.routes.ts:14` |
| GET | `/api/v1/staff/core/workflow/delegations` | — | no | `backend-mongo/src/core/workflow.routes.ts:189` |
| POST | `/api/v1/staff/core/workflow/delegations` | — | yes | `backend-mongo/src/core/workflow.routes.ts:194` |
| DELETE | `/api/v1/staff/core/workflow/delegations/:id` | — | no | `backend-mongo/src/core/workflow.routes.ts:211` |
| GET | `/api/v1/staff/core/workflow/inbox` | — | no | `backend-mongo/src/core/workflow.routes.ts:164` |
| GET | `/api/v1/staff/core/workflows/:doctype` | admin.settings | no | `backend-mongo/src/core/workflow.routes.ts:52` |
| PUT | `/api/v1/staff/core/workflows/:doctype` | admin.settings | yes | `backend-mongo/src/core/workflow.routes.ts:61` |
| GET | `/api/v1/staff/docs/config` | documents.view | no | `backend-mongo/src/docs/config.routes.ts:22` |
| GET | `/api/v1/staff/docs/dashboard` | documents.view | no | `backend-mongo/src/docs/config.routes.ts:126` |
| GET | `/api/v1/staff/docs/documents` | documents.view | no | `backend-mongo/src/docs/documents.routes.ts:70` |
| POST | `/api/v1/staff/docs/documents` | documents.upload | yes | `backend-mongo/src/docs/documents.routes.ts:106` |
| DELETE | `/api/v1/staff/docs/documents/:id` | documents.delete | no | `backend-mongo/src/docs/documents.routes.ts:378` |
| GET | `/api/v1/staff/docs/documents/:id` | documents.view | no | `backend-mongo/src/docs/documents.routes.ts:98` |
| PATCH | `/api/v1/staff/docs/documents/:id` | documents.edit | yes | `backend-mongo/src/docs/documents.routes.ts:307` |
| POST | `/api/v1/staff/docs/documents/:id/approve` | documents.review | yes | `backend-mongo/src/docs/documents.routes.ts:280` |
| POST | `/api/v1/staff/docs/documents/:id/complete-renewal` | documents.review | yes | `backend-mongo/src/docs/documents.routes.ts:359` |
| POST | `/api/v1/staff/docs/documents/:id/extract` | documents.edit | yes | `backend-mongo/src/docs/documents.routes.ts:215` |
| GET | `/api/v1/staff/docs/documents/:id/extraction` | documents.view | no | `backend-mongo/src/docs/documents.routes.ts:190` |
| GET | `/api/v1/staff/docs/documents/:id/extraction/pages/:n` | documents.review | no | `backend-mongo/src/docs/documents.routes.ts:205` |
| GET | `/api/v1/staff/docs/documents/:id/file` | documents.view | no | `backend-mongo/src/docs/documents.routes.ts:171` |
| GET | `/api/v1/staff/docs/documents/:id/history` | documents.view | no | `backend-mongo/src/docs/documents.routes.ts:386` |
| GET | `/api/v1/staff/docs/documents/:id/reminder-rules` | documents.view | no | `backend-mongo/src/docs/reminders.routes.ts:124` |
| POST | `/api/v1/staff/docs/documents/:id/renew` | documents.edit | yes | `backend-mongo/src/docs/documents.routes.ts:350` |
| PUT | `/api/v1/staff/docs/documents/:id/review` | documents.review | yes | `backend-mongo/src/docs/documents.routes.ts:235` |
| POST | `/api/v1/staff/docs/documents/:id/transition` | — | yes | `backend-mongo/src/docs/documents.routes.ts:334` |
| GET | `/api/v1/staff/docs/documents/:id/versions` | documents.view | no | `backend-mongo/src/docs/documents.routes.ts:142` |
| POST | `/api/v1/staff/docs/documents/:id/versions` | documents.upload | yes | `backend-mongo/src/docs/documents.routes.ts:149` |
| GET | `/api/v1/staff/docs/lookups` | documents.view | no | `backend-mongo/src/docs/config.routes.ts:110` |
| GET | `/api/v1/staff/docs/notifications/history` | documents.view | no | `backend-mongo/src/docs/reminders.routes.ts:219` |
| GET | `/api/v1/staff/docs/reminder-rules` | documents.view | no | `backend-mongo/src/docs/reminders.routes.ts:114` |
| POST | `/api/v1/staff/docs/reminder-rules` | documents.manage | yes | `backend-mongo/src/docs/reminders.routes.ts:131` |
| DELETE | `/api/v1/staff/docs/reminder-rules/:id` | documents.manage | no | `backend-mongo/src/docs/reminders.routes.ts:157` |
| PATCH | `/api/v1/staff/docs/reminder-rules/:id` | documents.manage | yes | `backend-mongo/src/docs/reminders.routes.ts:143` |
| GET | `/api/v1/staff/docs/reminders` | documents.view | no | `backend-mongo/src/docs/reminders.routes.ts:174` |
| POST | `/api/v1/staff/docs/reminders/:id/acknowledge` | documents.view | no | `backend-mongo/src/docs/reminders.routes.ts:200` |
| POST | `/api/v1/staff/docs/reminders/:id/retry` | documents.manage | no | `backend-mongo/src/docs/reminders.routes.ts:209` |
| GET | `/api/v1/staff/docs/types` | documents.view | no | `backend-mongo/src/docs/config.routes.ts:35` |
| POST | `/api/v1/staff/docs/types` | documents.manage | yes | `backend-mongo/src/docs/config.routes.ts:60` |
| GET | `/api/v1/staff/docs/types/:key` | documents.view | no | `backend-mongo/src/docs/config.routes.ts:43` |
| PATCH | `/api/v1/staff/docs/types/:key` | documents.manage | yes | `backend-mongo/src/docs/config.routes.ts:75` |
| PUT | `/api/v1/staff/docs/types/:key/fields` | documents.manage | yes | `backend-mongo/src/docs/config.routes.ts:92` |
| GET | `/api/v1/staff/hr/leave` | leave.apply | no | `backend-mongo/src/hr/leave.routes.ts:200` |
| POST | `/api/v1/staff/hr/leave` | leave.apply | yes | `backend-mongo/src/hr/leave.routes.ts:214` |
| POST | `/api/v1/staff/hr/leave-adjustments` | hr.manage | yes | `backend-mongo/src/hr/leave.routes.ts:172` |
| GET | `/api/v1/staff/hr/leave-balances` | leave.apply | no | `backend-mongo/src/hr/leave.routes.ts:158` |
| GET | `/api/v1/staff/hr/leave-types` | leave.apply | no | `backend-mongo/src/hr/leave.routes.ts:108` |
| POST | `/api/v1/staff/hr/leave-types` | hr.manage | no | `backend-mongo/src/hr/leave.routes.ts:136` |
| PUT | `/api/v1/staff/hr/leave-types/:id` | hr.manage | no | `backend-mongo/src/hr/leave.routes.ts:137` |
| POST | `/api/v1/staff/hr/leave/:id/approve` | — | no | `backend-mongo/src/hr/leave.routes.ts:308` |
| POST | `/api/v1/staff/hr/leave/:id/cancel` | leave.apply | no | `backend-mongo/src/hr/leave.routes.ts:312` |
| POST | `/api/v1/staff/hr/leave/:id/reject` | — | no | `backend-mongo/src/hr/leave.routes.ts:309` |
| GET | `/api/v1/staff/hr/settings` | leave.apply | no | `backend-mongo/src/hr/leave.routes.ts:143` |
| PUT | `/api/v1/staff/hr/settings` | hr.manage | yes | `backend-mongo/src/hr/leave.routes.ts:144` |
| GET | `/api/v1/staff/hrm/${kind.path}` | hr.employees.view | no | `backend-mongo/src/hr/org.routes.ts:73` |
| POST | `/api/v1/staff/hrm/${kind.path}` | hr.org.manage | yes | `backend-mongo/src/hr/org.routes.ts:79` |
| PATCH | `/api/v1/staff/hrm/${kind.path}/:id` | hr.org.manage | yes | `backend-mongo/src/hr/org.routes.ts:93` |
| GET | `/api/v1/staff/hrm/contracts` | hr.contracts.view | no | `backend-mongo/src/hr/contract.routes.ts:43` |
| POST | `/api/v1/staff/hrm/contracts` | hr.contracts.manage | yes | `backend-mongo/src/hr/contract.routes.ts:63` |
| POST | `/api/v1/staff/hrm/contracts-expire-due` | hr.contracts.manage | no | `backend-mongo/src/hr/contract.routes.ts:183` |
| GET | `/api/v1/staff/hrm/contracts/:id` | hr.contracts.view | no | `backend-mongo/src/hr/contract.routes.ts:55` |
| POST | `/api/v1/staff/hrm/contracts/:id/activate` | hr.contracts.manage | no | `backend-mongo/src/hr/contract.routes.ts:82` |
| POST | `/api/v1/staff/hrm/contracts/:id/amend` | hr.contracts.manage | yes | `backend-mongo/src/hr/contract.routes.ts:131` |
| POST | `/api/v1/staff/hrm/contracts/:id/renew` | hr.contracts.manage | yes | `backend-mongo/src/hr/contract.routes.ts:111` |
| POST | `/api/v1/staff/hrm/contracts/:id/terminate` | hr.contracts.manage | yes | `backend-mongo/src/hr/contract.routes.ts:156` |
| GET | `/api/v1/staff/hrm/dashboard` | hr.employees.view | no | `backend-mongo/src/hr/dashboard.routes.ts:19` |
| GET | `/api/v1/staff/hrm/departments-tree` | hr.employees.view | no | `backend-mongo/src/hr/org.routes.ts:119` |
| GET | `/api/v1/staff/hrm/employees` | — | no | `backend-mongo/src/hr/employee.routes.ts:83` |
| POST | `/api/v1/staff/hrm/employees` | hr.employees.manage | yes | `backend-mongo/src/hr/employee.routes.ts:110` |
| GET | `/api/v1/staff/hrm/employees-export` | hr.reports.view | no | `backend-mongo/src/hr/employee.routes.ts:102` |
| GET | `/api/v1/staff/hrm/employees/:id` | — | no | `backend-mongo/src/hr/employee.routes.ts:133` |
| PATCH | `/api/v1/staff/hrm/employees/:id` | hr.employees.manage | yes | `backend-mongo/src/hr/employee.routes.ts:138` |
| GET | `/api/v1/staff/hrm/employees/:id/history` | — | no | `backend-mongo/src/hr/employee.routes.ts:219` |
| POST | `/api/v1/staff/hrm/employees/:id/rehire` | hr.employees.manage | yes | `backend-mongo/src/hr/employee.routes.ts:205` |
| POST | `/api/v1/staff/hrm/employees/:id/status` | hr.employees.manage | yes | `backend-mongo/src/hr/employee.routes.ts:170` |
| GET | `/api/v1/staff/ping` | clients.view | no | `backend-mongo/src/app.ts:27` |
| GET | `/sanctum/csrf-cookie` | — | no | `backend-mongo/src/app.ts:21` |

"—" means the route itself adds no `can(...)` check. It may still be limited by the staff-only mount (`requireAuth`, `requireType('staff')`) or by checks inside the handler, which this scan does not read.

## Needs review

Paths built at runtime or permission checks the scan could not resolve:

| Method | URL | Why | Source |
|---|---|---|---|
| POST | `/api/v1/staff/docs/documents` | permission via receive | `backend-mongo/src/docs/documents.routes.ts:106` |
| POST | `/api/v1/staff/docs/documents/:id/versions` | permission via receive | `backend-mongo/src/docs/documents.routes.ts:149` |
| GET | `/api/v1/staff/hrm/${kind.path}` | path is computed | `backend-mongo/src/hr/org.routes.ts:73` |
| POST | `/api/v1/staff/hrm/${kind.path}` | path is computed | `backend-mongo/src/hr/org.routes.ts:79` |
| PATCH | `/api/v1/staff/hrm/${kind.path}/:id` | path is computed | `backend-mongo/src/hr/org.routes.ts:93` |
