<?php

namespace App\Modules\Platform\Services;

use App\Modules\Platform\Models\User;
use Illuminate\Support\Facades\DB;

/** Which clients a staff user may see. Phase 2's ClientPolicy and the client-level RLS dimension build on this. */
class AccessScope
{
    private const OFFICE_WIDE = ['super_admin', 'owner', 'office_manager'];

    /** @return int[]|null null means office-wide (every client in the organization). Must run inside the user's tenant. */
    public function clientIdsFor(User $user): ?array
    {
        if ($user->hasAnyRole(self::OFFICE_WIDE)) {
            return null;
        }
        if (config('access.chief_accountant_office_wide') && $user->hasRole('chief_accountant')) {
            return null;
        }

        return DB::table('client_assignments')
            ->where('user_id', $user->id)
            ->whereDate('starts_on', '<=', now()->toDateString())
            ->where(fn ($q) => $q->whereNull('ends_on')->orWhereDate('ends_on', '>=', now()->toDateString()))
            ->pluck('client_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}
