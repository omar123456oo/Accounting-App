<?php

namespace App\Modules\Platform\Services;

use App\Support\Tenancy\TenantContext;
use Illuminate\Auth\EloquentUserProvider;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Facades\DB;

/**
 * The session guard loads the user by id before any tenant is set, and the users policy would hide the row.
 * This provider asks a narrow SECURITY DEFINER function for the user's organization, then loads the user inside it.
 */
class TenantUserProvider extends EloquentUserProvider
{
    public function retrieveById($identifier): ?Authenticatable
    {
        $row = DB::selectOne('select auth_org_of_user(?) as org', [$identifier]);
        if (! $row || $row->org === null) {
            return null;
        }

        return TenantContext::run((int) $row->org, fn () => parent::retrieveById($identifier));
    }
}
