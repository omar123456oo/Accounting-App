<?php

use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Support\Facades\Route;

/**
 * Expected HTTP status for every staff GET route, per role. A new route without an entry here fails the test, which forces its
 * author to decide who may call it. Roles not listed for a route are expected to get 403.
 */
function expectedAccess(): array
{
    // clients.view is held by every staff role (auditor and read_only through the `.view` set; super_admin through Gate::before).
    $staff = array_fill_keys(['super_admin', 'owner', 'office_manager', 'chief_accountant', 'accountant', 'tax_specialist', 'auditor', 'hr_payroll', 'sales', 'read_only'], 200);

    return [
        'api/v1/staff/ping' => $staff + ['client' => 403], // a client-type user is refused by user.type:staff
    ];
}

it('declares access for every staff GET route and every role', function () {
    $routes = collect(Route::getRoutes()->getRoutes())
        ->filter(fn ($r) => str_starts_with($r->uri(), 'api/v1/staff/') && in_array('GET', $r->methods(), true) && ! str_contains($r->uri(), '_test'))
        ->map(fn ($r) => $r->uri())->values();

    $expected = expectedAccess();
    expect($routes->diff(array_keys($expected))->all())->toBe([], 'Routes with no declared access: add them to expectedAccess()');

    $roles = RolesAndPermissionsSeeder::roleNames();
    foreach ($routes as $uri) {
        foreach ($roles as $role) {
            $user = demoUser(role: $role, type: $role === 'client' ? 'client' : 'staff');
            $status = $this->actingAs($user, 'web')->getJson('/'.$uri)->status();
            expect($status)->toBe($expected[$uri][$role] ?? 403, "$role on $uri");
        }
    }
});
