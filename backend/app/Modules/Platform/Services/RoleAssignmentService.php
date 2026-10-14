<?php

namespace App\Modules\Platform\Services;

use App\Modules\Platform\Audit\AuditLogger;
use App\Modules\Platform\Models\User;
use Illuminate\Support\Facades\DB;

/** Role changes are security events: every one is audited with the roles before and after. Run inside the tenant. */
class RoleAssignmentService
{
    public function __construct(private readonly AuditLogger $audit) {}

    /** @param string[] $roles */
    public function sync(User $target, array $roles, ?User $actor = null): void
    {
        DB::transaction(function () use ($target, $roles, $actor) {
            $before = $target->getRoleNames()->all();
            $target->syncRoles($roles);
            $this->audit->log('rbac.roles_changed', 'user', $target->id, ['roles' => $before], ['roles' => $roles], $actor?->id);
        });
    }
}
