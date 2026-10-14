---
title: "Documentation Home"
id: "SYS-README-001"
document_type: "system-doc"
status: "active"
verification_status: "implemented-not-runtime-verified"
source_of_truth: "application-source-code"
last_verified: null
---

# Documentation Home

This folder is the knowledge base for the accounting / ERP application. It is built from the source code, not from assumptions.

**Start here**

- [System overview](SYSTEM_OVERVIEW.md): what the application is and what is real versus mock.
- [Documentation index](DOCUMENTATION_INDEX.md): every managed document with its status and verification state.
- [Documentation coverage](DOCUMENTATION_COVERAGE.md): what is documented, with the formula and the numbers.

**Generated references** (rewritten from the code; do not edit)

- [API catalog](API_CATALOG.md) · [Data dictionary](DATA_DICTIONARY.md) · [Permissions matrix](PERMISSIONS_MATRIX.md) · [Route map](APPLICATION_ROUTE_MAP.md) · [Module catalog](MODULE_CATALOG.md)

**Module guides:** [core](modules/core/README.md) (document types, custom fields) and [search](modules/search/README.md) (global search). Other modules are listed as "not yet written" in the [module catalog](MODULE_CATALOG.md).

**Existing documents** that predate this system: [setup](setup.md), [MongoDB setup](setup-mongodb.md), [security](security.md), [administrator guide](admin-guide.md), [backup and restore](runbooks/backup-restore.md), [decisions](decisions/).

## Keeping the documentation true

| Command (from the repository root) | What it does |
|---|---|
| `node scripts/docs/scan.mjs` | Re-reads the code and rewrites the generated references. |
| `node scripts/docs/validate.mjs` | Checks front matter, unique ids, links and placeholders, then rewrites the index and coverage report. |
| `node scripts/docs/scan.mjs --check && node scripts/docs/validate.mjs --check` | The same checks without writing; exits 1 when anything is stale or broken. Suitable for CI. |

Rules for authors

1. Copy a file from [templates/](templates/feature-template.md) and fill every section that applies; delete the ones that do not.
2. Give each document a unique `id` and set `verification_status` honestly: `verified` only after the behaviour was exercised, with `last_verified` set; otherwise `partial`, `implemented-not-runtime-verified`, `planned` or `unverified`.
3. Cite source files, endpoints and tests. Do not describe a planned feature as an existing one.
4. When code changes a route, form, endpoint, model, permission or rule, update the affected document in the same commit. If the code now contradicts an approved business procedure, flag the difference for the owner instead of rewriting the procedure.
