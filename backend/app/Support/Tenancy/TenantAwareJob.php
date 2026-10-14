<?php

namespace App\Support\Tenancy;

use Closure;
use Spatie\Permission\PermissionRegistrar;

/** Every queued job carries its tenant. Implement handle() by calling $this->inTenant(fn () => ...). */
trait TenantAwareJob
{
    public int $organizationId;

    protected function inTenant(Closure $fn): mixed
    {
        app(PermissionRegistrar::class)->setPermissionsTeamId($this->organizationId);

        return TenantContext::run($this->organizationId, $fn);
    }
}
