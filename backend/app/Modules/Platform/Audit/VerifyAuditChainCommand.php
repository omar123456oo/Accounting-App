<?php

namespace App\Modules\Platform\Audit;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class VerifyAuditChainCommand extends Command
{
    protected $signature = 'audit:verify {organization? : Organization id; all organizations when omitted}';

    protected $description = 'Recompute the audit hash chain and report the first broken event per organization';

    public function handle(): int
    {
        // Reads every tenant, so it runs as the owner role; the verify function is not granted to the app role.
        $db = DB::connection('owner');
        $orgs = $this->argument('organization')
            ? [(int) $this->argument('organization')]
            : $db->table('organizations')->pluck('id')->all();

        $broken = false;
        foreach ($orgs as $org) {
            $bad = $db->selectOne('select first_bad_seq from audit_verify_chain(?)', [$org]);
            if ($bad) {
                $broken = true;
                $this->error("Organization $org: chain broken at seq {$bad->first_bad_seq}");
                Log::critical('Audit chain broken', ['organization_id' => $org, 'first_bad_seq' => $bad->first_bad_seq]);
            } else {
                $this->info("Organization $org: chain intact");
            }
        }

        return $broken ? self::FAILURE : self::SUCCESS;
    }
}
