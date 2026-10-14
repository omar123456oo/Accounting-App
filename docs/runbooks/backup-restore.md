# Backup and restore runbook

## Targets (unconfirmed)

| Objective | Proposed | Status |
|---|---|---|
| RPO, the most data we can lose | 15 minutes | **Unconfirmed.** Needs the office owner's sign-off. |
| RTO, the longest we can be down | 4 hours | **Unconfirmed.** Needs the office owner's sign-off. |

Do not quote these to a client as commitments until they are confirmed.

## Production design (Phase 7)

- PostgreSQL WAL archiving with pgBackRest: a full backup weekly, differentials daily, WAL shipped continuously. That is what makes a 15-minute RPO possible.
- Backups are encrypted and stored off-site, in a different failure domain from the database server.
- Encryption keys are escrowed with at least two named people. A backup nobody can decrypt is not a backup.
- Document files (MinIO/S3) are replicated separately; versioning is on.
- Audit-chain digests are anchored outside the database in Phase 7, so a restore cannot silently rewrite history.

## Restore drill (run it, do not just read it)

On the development stack:

```bash
docker compose up -d
./scripts/restore-drill.sh
```

The script takes a dump of `accounting`, restores it into a scratch database `drill`, compares row counts for `organizations`, `users` and `audit_events`, verifies the audit hash chain on the restored copy, drops the scratch database and prints `restore drill OK`. Any mismatch exits non-zero.

Schedule the drill monthly in production against a restored backup (not a fresh dump), and record the date and the measured restore time. When Phase 2 stores documents, extend the script to check a sample of object keys in MinIO.

## After a real restore

1. Run `php artisan audit:verify`. A broken chain means the restore point is not trustworthy.
2. Check the latest `audit_events.occurred_at` against the incident time to know how much was lost.
3. Rotate any credential that may have been exposed while the system was down.
