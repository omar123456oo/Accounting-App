<?php

namespace App\Modules\Platform\Audit;

use App\Support\Tenancy\TenantContext;
use Illuminate\Console\Command;

/** Test helper for the concurrency test: writes N events for an organization, one transaction each. Not registered in production. */
class AuditBurstCommand extends Command
{
    protected $signature = 'audit:burst {organization} {count=50}';

    protected $description = 'Write N audit events (concurrency test helper)';

    public function handle(AuditLogger $audit): int
    {
        for ($i = 0; $i < (int) $this->argument('count'); $i++) {
            TenantContext::run((int) $this->argument('organization'), fn () => $audit->log('burst.event', 'thing', $i));
        }

        return self::SUCCESS;
    }
}
