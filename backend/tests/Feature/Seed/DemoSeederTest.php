<?php

use Database\Seeders\DemoSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Support\Facades\DB;

it('creates two organizations with one user per role', function () {
    (new DemoSeeder)->run();
    expect(DB::connection('owner')->table('organizations')->count())->toBe(2);
    $roles = count(RolesAndPermissionsSeeder::roleNames());
    expect(DB::connection('owner')->table('users')->count())->toBe(2 * $roles)
        ->and(DB::connection('owner')->table('users')->where('name', 'not like', 'DEMO%')->count())->toBe(0);
});

it('does not let one organization see the other through the app role', function () {
    (new DemoSeeder)->run();
    $first = DB::connection('owner')->table('organizations')->orderBy('id')->value('id');
    $seen = \App\Support\Tenancy\TenantContext::run($first, fn () => DB::table('users')->distinct()->pluck('organization_id')->all());
    expect($seen)->toBe([$first]);
});

it('refuses to run in production', function () {
    app()->detectEnvironment(fn () => 'production');
    expect(fn () => (new DemoSeeder)->run())->toThrow(RuntimeException::class);
});
