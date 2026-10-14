<?php

use App\Modules\Platform\Models\User;
use App\Modules\Platform\Services\AccessScope;
use App\Modules\Platform\Services\RoleAssignmentService;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

function roleHas(string $role, string $permission, int $org): bool
{
    app(PermissionRegistrar::class)->setPermissionsTeamId($org);

    return TenantContext::run($org, fn () => Role::findByName($role, 'web')->hasPermissionTo($permission));
}

it('gives payroll permissions only to owner and hr_payroll', function () {
    [$org] = seedTwoOrgs();
    (new RolesAndPermissionsSeeder)->run();
    foreach (['accountant', 'chief_accountant', 'tax_specialist', 'auditor', 'sales', 'read_only', 'office_manager'] as $role) {
        expect(roleHas($role, 'payroll.view', $org))->toBeFalse("$role must not view payroll");
    }
    expect(roleHas('hr_payroll', 'payroll.view', $org))->toBeTrue()->and(roleHas('owner', 'payroll.view', $org))->toBeTrue();
});

it('keeps each organization roles separate', function () {
    [$a, $b] = seedTwoOrgs();
    (new RolesAndPermissionsSeeder)->run();
    app(PermissionRegistrar::class)->setPermissionsTeamId($a);
    $names = TenantContext::run($a, fn () => DB::table('roles')->where('name', 'owner')->count());
    expect($names)->toBe(1);
    expect(DB::connection('owner')->table('roles')->where('name', 'owner')->count())->toBe(2);
});

it('lets the super admin through every check', function () {
    $u = demoUser(role: 'super_admin');
    $this->actingAs($u, 'web')->getJson('/api/v1/staff/ping')->assertOk();
});

it('scopes office-wide roles to everything and others to their assignments', function () {
    $owner = demoUser(role: 'owner');
    $acct = demoUser(role: 'accountant');
    $scope = new AccessScope;
    app(PermissionRegistrar::class)->setPermissionsTeamId($owner->organization_id);
    expect(TenantContext::run($owner->organization_id, fn () => $scope->clientIdsFor($owner)))->toBeNull();

    DB::connection('owner')->table('client_assignments')->insert([
        ['organization_id' => $acct->organization_id, 'user_id' => $acct->id, 'client_id' => 11, 'starts_on' => now()->subDay(), 'ends_on' => null, 'created_at' => now(), 'updated_at' => now()],
        ['organization_id' => $acct->organization_id, 'user_id' => $acct->id, 'client_id' => 12, 'starts_on' => now()->subMonth(), 'ends_on' => now()->subDay(), 'created_at' => now(), 'updated_at' => now()],
    ]);
    app(PermissionRegistrar::class)->setPermissionsTeamId($acct->organization_id);
    expect(TenantContext::run($acct->organization_id, fn () => $scope->clientIdsFor($acct)))->toBe([11]);
});

it('audits role changes', function () {
    $u = demoUser(role: 'accountant');
    app(PermissionRegistrar::class)->setPermissionsTeamId($u->organization_id);
    TenantContext::run($u->organization_id, fn () => app(RoleAssignmentService::class)->sync(User::findOrFail($u->id), ['auditor']));
    $event = DB::connection('owner')->table('audit_events')->where('action', 'rbac.roles_changed')->first();
    expect(json_decode($event->before, true))->toBe(['roles' => ['accountant']])->and(json_decode($event->after, true))->toBe(['roles' => ['auditor']]);
});
