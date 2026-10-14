<?php

namespace App\Support\Tenancy;

use Closure;
use Illuminate\Support\Facades\DB;

final class TenantContext
{
    /**
     * Runs $fn in a transaction whose row-level-security tenant is $organizationId. The setting is transaction-local,
     * so it cannot leak to the next request that reuses the connection. A nested call restores the outer tenant on exit.
     */
    public static function run(int $organizationId, Closure $fn): mixed
    {
        $nested = DB::transactionLevel() > 0;

        return DB::transaction(function () use ($organizationId, $fn, $nested) {
            $previous = $nested ? DB::selectOne("select current_setting('app.org_id', true) as v")->v : null;
            DB::statement("SELECT set_config('app.org_id', ?, true)", [(string) $organizationId]);
            try {
                return $fn();
            } finally {
                if ($nested) {
                    DB::statement("SELECT set_config('app.org_id', ?, true)", [(string) $previous]);
                }
            }
        });
    }
}
