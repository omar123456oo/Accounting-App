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


**54 endpoint definitions found; 54 reachable from `app.ts`.**

## Endpoints

| Method | URL | Permission (backend) | Reads body | Source |
|---|---|---|---|---|
| GET | `/api/health` | — | no | `backend-mongo/src/app.ts:16` |
| POST | `/api/v1/auth/login` | — | yes | `backend-mongo/src/auth/routes.ts:48` |
| POST | `/api/v1/auth/logout` | — | no | `backend-mongo/src/auth/routes.ts:75` |
| GET | `/api/v1/auth/me` | — | no | `backend-mongo/src/auth/routes.ts:81` |
| POST | `/api/v1/auth/register` | — | yes | `backend-mongo/src/auth/routes.ts:20` |
| GET | `/api/v1/me/hrm/contracts` | — | no | `backend-mongo/src/hr/contract.routes.ts:189` |
| GET | `/api/v1/me/hrm/employee` | — | no | `backend-mongo/src/hr/employee.routes.ts:227` |
| GET | `/api/v1/staff/core/customize/:doctype` | admin.settings | no | `backend-mongo/src/core/customize.routes.ts:54` |
| PUT | `/api/v1/staff/core/customize/:doctype` | admin.settings | yes | `backend-mongo/src/core/customize.routes.ts:60` |
| GET | `/api/v1/staff/core/doctypes` | — | no | `backend-mongo/src/core/meta.routes.ts:20` |
| POST | `/api/v1/staff/core/doctypes` | admin.settings | yes | `backend-mongo/src/core/customize.routes.ts:81` |
| DELETE | `/api/v1/staff/core/doctypes/:name` | admin.settings | no | `backend-mongo/src/core/customize.routes.ts:110` |
| GET | `/api/v1/staff/core/meta/:doctype` | — | no | `backend-mongo/src/core/meta.routes.ts:9` |
| GET | `/api/v1/staff/core/records/:doctype` | — | no | `backend-mongo/src/core/records.routes.ts:80` |
| POST | `/api/v1/staff/core/records/:doctype` | — | yes | `backend-mongo/src/core/records.routes.ts:98` |
| DELETE | `/api/v1/staff/core/records/:doctype/:name` | — | no | `backend-mongo/src/core/records.routes.ts:130` |
| GET | `/api/v1/staff/core/records/:doctype/:name` | — | no | `backend-mongo/src/core/records.routes.ts:91` |
| PUT | `/api/v1/staff/core/records/:doctype/:name` | — | yes | `backend-mongo/src/core/records.routes.ts:116` |
| GET | `/api/v1/staff/core/search` | — | no | `backend-mongo/src/core/search.routes.ts:14` |
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
| GET | `/api/v1/staff/ping` | clients.view | no | `backend-mongo/src/app.ts:26` |
| GET | `/sanctum/csrf-cookie` | — | no | `backend-mongo/src/app.ts:20` |

"—" means the route itself adds no `can(...)` check. It may still be limited by the staff-only mount (`requireAuth`, `requireType('staff')`) or by checks inside the handler, which this scan does not read.

## Needs review

Paths built at runtime or permission checks the scan could not resolve:

| Method | URL | Why | Source |
|---|---|---|---|
| GET | `/api/v1/staff/hrm/${kind.path}` | path is computed | `backend-mongo/src/hr/org.routes.ts:73` |
| POST | `/api/v1/staff/hrm/${kind.path}` | path is computed | `backend-mongo/src/hr/org.routes.ts:79` |
| PATCH | `/api/v1/staff/hrm/${kind.path}/:id` | path is computed | `backend-mongo/src/hr/org.routes.ts:93` |
