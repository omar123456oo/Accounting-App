<?php

namespace App\Modules\Platform\Audit;

use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * Appends an audit event. seq, prev_hash and hash are filled by the database trigger, so the app cannot forge or skip them.
 * It refuses to run outside a transaction: an audit row must never exist without the change it describes (and vice versa).
 */
class AuditLogger
{
    public function log(string $action, string $entityType, string|int|null $entityId, ?array $before = null, ?array $after = null, ?int $actorId = null): void
    {
        if (DB::transactionLevel() < 1) {
            throw new LogicException('AuditLogger::log must be called inside a transaction.');
        }
        // organization_id comes from the transaction's tenant setting, not from the caller: the RLS check then enforces it.
        DB::insert(
            "insert into audit_events (organization_id, actor_id, action, entity_type, entity_id, \"before\", \"after\", ip)
             values (NULLIF(current_setting('app.org_id', true), '')::bigint, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)",
            [
                $actorId ?? auth()->id(),
                $action,
                $entityType,
                $entityId === null ? null : (string) $entityId,
                $before === null ? null : json_encode($before, JSON_UNESCAPED_UNICODE),
                $after === null ? null : json_encode($after, JSON_UNESCAPED_UNICODE),
                request()?->ip(),
            ],
        );
    }
}
