<?php

use App\Support\Tenancy\TenantAwareJob;

arch('every queued job carries its tenant')
    ->expect('App\Jobs')
    ->toUseTrait(TenantAwareJob::class);
