<?php

use App\Support\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;

it('returns zero rows when no tenant is set (fail closed)', function () {
    seedTwoOrgs();
    expect(DB::table('users')->count())->toBe(0);
});

it('only shows the current tenant rows', function () {
    [$a] = seedTwoOrgs();
    $emails = TenantContext::run($a, fn () => DB::table('users')->pluck('email')->all());
    expect($emails)->toBe(['a@demo.test']);
});

it('rejects inserting a row for another tenant', function () {
    [$a, $b] = seedTwoOrgs();
    expect(fn () => TenantContext::run($a, fn () => DB::table('users')->insert([
        'organization_id' => $b, 'name' => 'x', 'email' => 'evil@demo.test',
        'password' => 'x', 'type' => 'staff', 'created_at' => now(), 'updated_at' => now(),
    ])))->toThrow(\Illuminate\Database\QueryException::class);
});

it('does not leak the tenant after the transaction ends', function () {
    [$a] = seedTwoOrgs();
    TenantContext::run($a, fn () => DB::table('users')->count());
    expect(DB::selectOne("select current_setting('app.org_id', true) as v")->v)->toBeIn([null, '']);
});

it('restores the outer tenant after a nested run', function () {
    [$a, $b] = seedTwoOrgs();
    $seen = TenantContext::run($a, function () use ($b) {
        TenantContext::run($b, fn () => null);

        return DB::table('users')->pluck('email')->all();
    });
    expect($seen)->toBe(['a@demo.test']);
});

it('runs the application as a role that cannot bypass row-level security', function () {
    $role = DB::selectOne("select rolbypassrls as b, rolsuper as s from pg_roles where rolname = current_user");
    expect($role->b)->toBeFalse()->and($role->s)->toBeFalse();
});
