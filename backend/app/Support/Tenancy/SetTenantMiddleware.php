<?php

namespace App\Support\Tenancy;

use Closure;
use Illuminate\Http\Request;
use Spatie\Permission\PermissionRegistrar;
use Symfony\Component\HttpFoundation\Response;

/** Runs after authentication and wraps the whole request in the user's tenant. Unauthenticated requests see zero rows. */
class SetTenantMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            return $next($request);
        }
        app(PermissionRegistrar::class)->setPermissionsTeamId($user->organization_id);

        return TenantContext::run((int) $user->organization_id, fn () => $next($request));
    }
}
