---
title: "Data Dictionary"
id: "SYS-DATA-001"
document_type: "generated-reference"
status: "generated"
verification_status: "source-scanned"
source_of_truth: "application-source-code"
generated_by: "scripts/docs/scan.mjs"
---

# Data Dictionary

> Generated from the source code by `node scripts/docs/scan.mjs`. Do not edit by hand: change the code and run the scan again.
> **Verification status:** source-scanned (read from the code; not exercised at runtime).
> Scope: Mongoose models in `backend-mongo`. Field types are shown as written in the schema.


**40 models.** Every tenant collection carries `organizationId` (see `backend-mongo/src/db/tenant.ts`); a row `...x` is a spread of shared fields defined in the same file.

## AuditChainHead

Source: `backend-mongo/src/models/audit-event.ts:27`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | Schema.Types.ObjectId | yes |  |
| lastSeq | Number | no |  |
| lastHash | String | no |  |

## AuditEvent

Source: `backend-mongo/src/models/audit-event.ts:4`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | Schema.Types.ObjectId | yes |  |
| seq | Number | yes |  |
| actorId | Schema.Types.ObjectId | no |  |
| action | String | yes |  |
| entityType | String | yes |  |
| entityId | String | no |  |
| before | Schema.Types.Mixed | no |  |
| after | Schema.Types.Mixed | no |  |
| ip | String | no |  |
| occurredAt | Date | yes |  |
| prevHash | String | yes |  |
| hash | String | yes |  |

Indexes:

- `{ organizationId: 1, seq: 1 }, { unique: true }`
- `{ organizationId: 1, entityType: 1, entityId: 1 }`

## Branch

Source: `backend-mongo/src/hr/models.ts:12`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| ...common | (spread) |  |  |
| code | String | yes |  |
| name | String | yes |  |
| nameAr | String | no |  |
| address | String | no |  |

Indexes:

- `{ organizationId: 1, code: 1 }, { unique: true }`

## ClientAssignment

Source: `backend-mongo/src/models/client-assignment.ts:3`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | Schema.Types.ObjectId | yes |  |
| userId | Schema.Types.ObjectId | yes |  |
| clientId | Schema.Types.ObjectId | yes |  |
| roleOnClient | String | no |  |
| startsOn | Date | yes |  |
| endsOn | Date | no |  |

Indexes:

- `{ organizationId: 1, userId: 1 }`

## Contract

Source: `backend-mongo/src/hr/models.ts:67`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| employeeId |  | yes |  |
| number | String | yes |  |
| version | Number | no |  |
| type | String | yes |  |
| status | String | yes | CONTRACT_STATUSES |
| startDate | String | yes |  |
| endDate | String | no |  |
| probationMonths | Number | no |  |
| renewalTerms | String | no |  |
| alertDays | Number | no |  |
| previousContractId | ref('Contract') | no |  |
| attachments | [{ _id: false, name: String, documentId: String }] | no |  |
| amendments | [{ _id: false, at: Date, by: ref('User'), reason: String, changes: Schema.Types.Mixed }] | no |  |
| termination | { _id: false, date: String, reason: String, by: ref('User') } | no |  |
| createdBy | ref('User') | no |  |

Indexes:

- `{ organizationId: 1, number: 1 }, { unique: true }`
- `{ organizationId: 1, employeeId: 1, status: 1 }`
- `{ organizationId: 1, status: 1, endDate: 1 }`

## Counter

Source: `backend-mongo/src/hr/models.ts:85`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| key | String | yes |  |
| seq | Number | no |  |

Indexes:

- `{ organizationId: 1, key: 1 }, { unique: true }`

## CustomField

Source: `backend-mongo/src/core/models.ts:32`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| doctype | String | yes |  |
| ...fieldShape | (spread) |  |  |

Indexes:

- `{ organizationId: 1, doctype: 1, fieldname: 1 }, { unique: true }`

## Delegation

Source: `backend-mongo/src/core/workflow.models.ts:23`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| fromUserId | Schema.Types.ObjectId | yes |  |
| toUserId | Schema.Types.ObjectId | yes |  |
| startDate | String | yes |  |
| endDate | String | yes |  |

Indexes:

- `{ organizationId: 1, toUserId: 1 }`
- `{ organizationId: 1, fromUserId: 1 }`

## Department

Source: `backend-mongo/src/hr/models.ts:15`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| ...common | (spread) |  |  |
| code | String | yes |  |
| name | String | yes |  |
| nameAr | String | no |  |
| parentId | ref('Department') | no |  |
| managerId | ref('Employee') | no |  |
| costCenter | String | no |  |

Indexes:

- `{ organizationId: 1, code: 1 }, { unique: true }`
- `{ organizationId: 1, parentId: 1 }`

## DocCounter

Source: `backend-mongo/src/core/models.ts:56`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| doctype | String | yes |  |
| seq | Number | no |  |

Indexes:

- `{ organizationId: 1, doctype: 1 }, { unique: true }`

## DocDelivery

Source: `backend-mongo/src/docs/models.ts:142`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| jobId | ref('DocReminderJob') | no |  |
| documentId | ref('DocDocument') | no |  |
| userId |  | yes |  |
| channel | String | yes | ['in_app', 'email'] |
| status | String | yes | ['submitted', 'failed', 'skipped'] |
| providerMessageId | String | no |  |
| to | String | no |  |
| subject | String | no |  |
| error | String | no |  |
| attempts | Number | no |  |
| idempotencyKey | String | yes |  |

Indexes:

- `{ idempotencyKey: 1 }, { unique: true }`
- `{ organizationId: 1, createdAt: -1 }`
- `{ organizationId: 1, userId: 1, createdAt: -1 }`

## DocDocument

Source: `backend-mongo/src/docs/models.ts:38`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| typeKey | String | yes |  |
| typeChosen | Boolean | no |  |
| title | String | yes |  |
| number | String | no |  |
| status | String | no | DOC_STATUSES |
| extractionStatus | String | no | EXTRACTION_STATUSES |
| reminderStatus | String | no | REMINDER_STATUSES |
| visibility | String | no | ['office', 'restricted'] |
| ownerId | ref('User') | no |  |
| employeeId | ref('Employee') | no |  |
| departmentId | ref('Department') | no |  |
| reviewerId | ref('User') | no |  |
| related |  | no |  |
| values | Schema.Types.Mixed | no |  |
| expiryDate | String | no |  |
| startDate | String | no |  |
| endDate | String | no |  |
| renewalDate | String | no |  |
| currentVersion | Number | no |  |
| contentHash | String | yes |  |
| approvedAt | Date | no |  |
| approvedBy | ref('User') | no |  |
| renewalStartedAt | Date | no |  |
| archivedAt | Date | no |  |
| deletedAt | Date | no |  |
| createdBy | ref('User') | no |  |

Indexes:

- `{ organizationId: 1, status: 1, createdAt: -1 }`
- `{ organizationId: 1, deletedAt: 1, typeKey: 1 }`
- `{ organizationId: 1, expiryDate: 1 }`
- `{ organizationId: 1, contentHash: 1 }`
- `{ organizationId: 1, employeeId: 1 }`
- `{ organizationId: 1, departmentId: 1 }`
- `{ organizationId: 1, ownerId: 1 }`
- `{ organizationId: 1, title: 'text', number: 'text' }`

## DocExtraction

Source: `backend-mongo/src/docs/models.ts:81`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| documentId |  | yes |  |
| versionId | ref('DocVersion') | no |  |
| versionNumber | Number | no |  |
| status | String | no | EXTRACTION_STATUSES |
| provider |  | no |  |
| steps | [step] | no |  |
| pages | [page] | no |  |
| detectedType |  | no |  |
| fields | [extField] | no |  |
| notes | [String] | no |  |
| error | String | no |  |
| draft | Schema.Types.Mixed | no |  |
| draftSavedAt | Date | no |  |
| draftBy | ref('User') | no |  |
| corrections | [new Schema({ key: String, proposed: Schema.Types.Mixed, approved: Schema.Types.Mixed, by: | no |  |
| approvedAt | Date | no |  |

Indexes:

- `{ organizationId: 1, documentId: 1, createdAt: -1 }`

## DocJob

Source: `backend-mongo/src/docs/models.ts:96`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| kind | String | no | ['extract'] |
| documentId | ref('DocDocument') | no |  |
| versionId | ref('DocVersion') | no |  |
| status | String | no | ['queued', 'running', 'succeeded', 'failed'] |
| attempts | Number | no |  |
| maxAttempts | Number | no |  |
| runAfter | Date | no |  |
| lockedUntil | Date | no |  |
| lastError | String | no |  |
| finishedAt | Date | no |  |

Indexes:

- `{ status: 1, runAfter: 1 }`
- `{ organizationId: 1, documentId: 1 }`

## DocRecord

Source: `backend-mongo/src/core/models.ts:36`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| doctype | String | yes |  |
| name | String | yes |  |
| data | Schema.Types.Mixed | no |  |
| createdBy | Schema.Types.ObjectId | no |  |
| workflowState | String | no |  |
| stateEnteredAt | Date | no |  |
| approvals | [new Schema({ transition: String, userId: Schema.Types.ObjectId, at: Date }, { _id: false  | no |  |
| escalatedAt | Date | no |  |
| history | [new Schema({ at: { type: Date, required: true }, actorId: Schema.Types.ObjectId, actorNam | no |  |

Indexes:

- `{ organizationId: 1, doctype: 1, name: 1 }, { unique: true }`

## DocReminderJob

Source: `backend-mongo/src/docs/models.ts:128`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| documentId |  | yes |  |
| ruleId |  | yes |  |
| kind | String | no | ['reminder', 'escalation'] |
| targetDate | String | yes |  |
| label | String | no |  |
| dueAt | Date | yes |  |
| status | String | no | ['scheduled', 'processing', 'sent', 'failed', 'cancelled', 'skipped'] |
| attempts | Number | no |  |
| maxAttempts | Number | no |  |
| lockedUntil | Date | no |  |
| lastError | String | no |  |
| reason | String | no |  |
| sentAt | Date | no |  |
| acknowledgedAt | Date | no |  |
| acknowledgedBy | ref('User') | no |  |
| parentJobId | ref('DocReminderJob') | no |  |
| idempotencyKey | String | yes |  |

Indexes:

- `{ idempotencyKey: 1 }, { unique: true }`
- `{ status: 1, dueAt: 1 }`
- `{ organizationId: 1, documentId: 1, status: 1 }`
- `{ organizationId: 1, status: 1, dueAt: 1 }`

## DocReminderRule

Source: `backend-mongo/src/docs/models.ts:109`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| scope | String | yes | ['global', 'type', 'document'] |
| typeKey | String | no |  |
| documentId | ref('DocDocument') | no |  |
| mode | String | no | ['add', 'override'] |
| name | String | yes |  |
| description | String | no |  |
| dateField | String | yes |  |
| offsets | [offset] | no |  |
| recurring |  | no |  |
| time | String | no |  |
| timezone | String | no |  |
| recipients | recipients | no |  |
| channels |  | no |  |
| escalation |  | no |  |
| subject | String | no |  |
| message | String | no |  |
| active | Boolean | no |  |
| createdBy | ref('User') | no |  |

Indexes:

- `{ organizationId: 1, scope: 1, typeKey: 1 }`
- `{ organizationId: 1, documentId: 1 }`

## DocType

Source: `backend-mongo/src/core/models.ts:17`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| name | String | yes |  |
| label | String | yes |  |
| module | String | yes |  |
| fields | [new Schema(fieldShape, { _id: false })] | no |  |
| titleField | String | yes |  |
| searchFields | [String] | no |  |
| viewPermission | String | yes |  |
| managePermission | String | yes |  |

Indexes:

- `{ organizationId: 1, name: 1 }, { unique: true }`

## DocVersion

Source: `backend-mongo/src/docs/models.ts:64`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| documentId |  | yes |  |
| version | Number | yes |  |
| storageKey | String | yes |  |
| fileName | String | yes |  |
| mimeType | String | no |  |
| sizeBytes | Number | yes |  |
| sha256 | String | yes |  |
| pageCount | Number | no |  |
| uploadedBy | ref('User') | no |  |
| reason | String | no |  |

Indexes:

- `{ organizationId: 1, documentId: 1, version: 1 }, { unique: true }`

## Employee

Source: `backend-mongo/src/hr/models.ts:31`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| employeeNo | String | yes |  |
| userId | ref('User') | no |  |
| firstName | String | yes |  |
| lastName | String | yes |  |
| nameAr | String | no |  |
| email | String | no |  |
| phone | String | no |  |
| dateOfBirth | String | no |  |
| gender | String | no | ['female', 'male'] |
| nationalId | String | no |  |
| address | String | no |  |
| emergencyContacts | [{ _id: false, name: { type: String, required: true }, relation: String, phone: { type: St | no |  |
| departmentId | ref('Department') | no |  |
| branchId | ref('Branch') | no |  |
| positionId | ref('Position') | no |  |
| gradeId | ref('Grade') | no |  |
| managerId | ref('Employee') | no |  |
| workLocation | String | no |  |
| employmentType | String | yes | EMPLOYMENT_TYPES |
| status | String | yes | EMPLOYEE_STATUSES |
| hireDate | String | yes |  |
| probationEndDate | String | no |  |
| confirmationDate | String | no |  |
| education | [{ _id: false, degree: String, institution: String, year: Number }] | no |  |
| certifications | [{ _id: false, name: String, issuer: String, issuedOn: String, expiresOn: String }] | no |  |
| skills | [String] | no |  |
| previousEmployment | [{ _id: false, employer: String, title: String, from: String, to: String }] | no |  |
| bank | { _id: false, bankName: String, accountName: String, iban: String } | no |  |
| notes | String | no |  |
| exit | { _id: false, date: String, reason: String, rehireEligible: { type: Boolean, default: true | no |  |
| archivedAt | Date | no |  |

Indexes:

- `{ organizationId: 1, employeeNo: 1 }, { unique: true }`
- `{ organizationId: 1, userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } }`
- `{ organizationId: 1, status: 1, departmentId: 1 }`
- `{ organizationId: 1, managerId: 1 }`

## EmployeeEvent

Source: `backend-mongo/src/hr/models.ts:60`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| employeeId |  | yes |  |
| kind | String | yes |  |
| effectiveFrom | String | yes |  |
| changes | Schema.Types.Mixed | no |  |
| note | String | no |  |
| actorId | ref('User') | no |  |
| at | Date | no |  |

Indexes:

- `{ organizationId: 1, employeeId: 1, at: -1 }`

## Grade

Source: `backend-mongo/src/hr/models.ts:22`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| ...common | (spread) |  |  |
| code | String | yes |  |
| name | String | yes |  |
| level | Number | yes |  |

Indexes:

- `{ organizationId: 1, code: 1 }, { unique: true }`

## HrSettings

Source: `backend-mongo/src/hr/leave.models.ts:16`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId |  | no |  |
| weekendDays | [Number] | no |  |
| holidays | [String] | no |  |
| unpaidLeaveDivisor | Number | no |  |

## IdempotencyKey

Source: `backend-mongo/src/models/idempotency-key.ts:3`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | Schema.Types.ObjectId | yes |  |
| userId | Schema.Types.ObjectId | yes |  |
| key | String | yes |  |
| route | String | yes |  |
| requestHash | String | yes |  |
| statusCode | Number | no |  |
| responseBody | String | no |  |
| createdAt | Date | no |  |

Indexes:

- `{ organizationId: 1, userId: 1, key: 1, route: 1 }, { unique: true }`

## LeaveBalanceHead

Source: `backend-mongo/src/hr/leave.models.ts:32`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| employeeId | employee | no |  |
| typeId | Schema.Types.ObjectId | yes |  |
| year | Number | yes |  |
| used | Number | no |  |
| pending | Number | no |  |
| adjustment | Number | no |  |

Indexes:

- `{ organizationId: 1, employeeId: 1, typeId: 1, year: 1 }, { unique: true }`

## LeaveLedger

Source: `backend-mongo/src/hr/leave.models.ts:40`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| employeeId | employee | no |  |
| typeId | Schema.Types.ObjectId | yes |  |
| year | Number | yes |  |
| kind | String | yes | LEDGER_KINDS |
| days | Number | yes |  |
| requestId | Schema.Types.ObjectId | no |  |
| reason | String | no |  |
| actorId | Schema.Types.ObjectId | no |  |
| at | Date | no |  |

Indexes:

- `{ organizationId: 1, requestId: 1, kind: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'objectId' } } }`
- `{ organizationId: 1, employeeId: 1, typeId: 1, year: 1 }`

## LeaveLock

Source: `backend-mongo/src/hr/leave.models.ts:49`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| employeeId | employee | no |  |
| n | Number | no |  |

Indexes:

- `{ organizationId: 1, employeeId: 1 }, { unique: true }`

## LeaveRequest

Source: `backend-mongo/src/hr/leave.models.ts:21`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| employeeId | employee | no |  |
| typeId | Schema.Types.ObjectId | yes |  |
| from | String | yes |  |
| to | String | yes |  |
| days | Number | yes |  |
| reason | String | no |  |
| status | String | yes | LEAVE_STATUSES |
| decidedBy | String | no |  |
| decidedById | Schema.Types.ObjectId | no |  |
| decidedAt | Date | no |  |
| note | String | no |  |
| createdById | Schema.Types.ObjectId | no |  |

Indexes:

- `{ organizationId: 1, employeeId: 1, status: 1, from: 1 }`
- `{ organizationId: 1, status: 1, from: -1 }`

## LeaveType

Source: `backend-mongo/src/hr/leave.models.ts:8`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| nameAr | String | yes |  |
| nameEn | String | yes |  |
| entitlementDays | Number | no |  |
| paid | Boolean | no |  |
| active | Boolean | no |  |

Indexes:

- `{ organizationId: 1, nameEn: 1 }, { unique: true }`

## Notification

Source: `backend-mongo/src/core/workflow.models.ts:30`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| userId | Schema.Types.ObjectId | yes |  |
| kind | String | yes | ['workflow', 'escalation', 'document_reminder', 'document'] |
| title | String | yes |  |
| body | String | no |  |
| link | String | no |  |
| readAt | Date | no |  |
| idempotencyKey | String | no |  |

Indexes:

- `{ organizationId: 1, userId: 1, createdAt: -1 }`
- `{ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }`

## Organization

Source: `backend-mongo/src/models/organization.ts:3`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| name | String | yes |  |
| timezone | String | no |  |
| locale | String | no |  |
| status | String | no | ['active', 'suspended'] |

## PasswordResetToken

Source: `backend-mongo/src/models/password-reset-token.ts:3`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| email | String | yes |  |
| tokenHash | String | yes |  |
| createdAt | Date | no |  |

## Position

Source: `backend-mongo/src/hr/models.ts:25`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| ...common | (spread) |  |  |
| code | String | yes |  |
| title | String | yes |  |
| titleAr | String | no |  |
| departmentId | ref('Department') | no |  |
| gradeId | ref('Grade') | no |  |
| description | String | no |  |

Indexes:

- `{ organizationId: 1, code: 1 }, { unique: true }`

## Role

Source: `backend-mongo/src/models/role.ts:4`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | Schema.Types.ObjectId | yes |  |
| name | String | yes |  |
| permissions | [String] | no |  |

Indexes:

- `{ organizationId: 1, name: 1 }, { unique: true }`

## Script

Source: `backend-mongo/src/core/script.models.ts:13`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| doctype | String | yes |  |
| kind | String | yes | SCRIPT_KINDS |
| name | String | yes |  |
| event | String | no | [...SERVER_EVENTS, null] |
| code | String | yes |  |
| enabled | Boolean | no |  |
| order | Number | no |  |
| description | String | no |  |
| version | Number | no |  |
| createdBy | Schema.Types.ObjectId | no |  |
| updatedBy | Schema.Types.ObjectId | no |  |

Indexes:

- `{ organizationId: 1, doctype: 1, kind: 1, name: 1 }, { unique: true }`
- `{ organizationId: 1, doctype: 1, kind: 1, event: 1, enabled: 1 }`

## ScriptLog

Source: `backend-mongo/src/core/script.models.ts:33`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| scriptId | Schema.Types.ObjectId | yes |  |
| name | String | no |  |
| doctype | String | no |  |
| event | String | no |  |
| record | String | no |  |
| userId | Schema.Types.ObjectId | no |  |
| ok | Boolean | yes |  |
| kind | String | no |  |
| message | String | no |  |
| durationMs | Number | no |  |
| logs | [String] | no |  |
| messages | [String] | no |  |
| createdAt | Date | no |  |

Indexes:

- `{ organizationId: 1, scriptId: 1, createdAt: -1 }`

## Session

Source: `backend-mongo/src/models/session.ts:4`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| tokenHash | String | yes |  |
| userId | Schema.Types.ObjectId | yes |  |
| organizationId | Schema.Types.ObjectId | yes |  |
| ip | String | no |  |
| userAgent | String | no |  |
| lastActivityAt | Date | no |  |
| expiresAt | Date | yes |  |

## SmartDocType

Source: `backend-mongo/src/docs/models.ts:29`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| key | String | yes |  |
| label | String | yes |  |
| labelAr | String | no |  |
| category | String | no |  |
| fields | [fieldDef] | no |  |
| keywords | [String] | no |  |
| expiringSoonDays | Number | no |  |
| active | Boolean | no |  |
| builtin | Boolean | no |  |

Indexes:

- `{ organizationId: 1, key: 1 }, { unique: true }`

## User

Source: `backend-mongo/src/models/user.ts:3`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | Schema.Types.ObjectId | yes |  |
| name | String | yes |  |
| email | String | yes |  |
| emailVerifiedAt | Date | no |  |
| passwordHash | String | yes |  |
| type | String | yes | ['staff', 'client'] |
| roles | [String] | no |  |
| clientId | Schema.Types.ObjectId | no |  |
| lockedUntil | Date | no |  |
| failedLogins | Number | no |  |
| mfaSecret | String | no |  |
| mfaEnabled | Boolean | no |  |

## Workflow

Source: `backend-mongo/src/core/workflow.models.ts:16`

| Field | Type | Required | Allowed values |
|---|---|---|---|
| organizationId | org | no |  |
| doctype | String | yes |  |
| name | String | yes |  |
| active | Boolean | no |  |
| states | [state] | no |  |
| initialState | String | yes |  |
| transitions | [transition] | no |  |
| escalations | [escalation] | no |  |

Indexes:

- `{ organizationId: 1, doctype: 1 }, { unique: true }`

