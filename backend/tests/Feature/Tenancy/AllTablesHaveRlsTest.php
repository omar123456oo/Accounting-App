<?php

use Illuminate\Support\Facades\DB;

it('enables forced row-level security with a policy on every table that has organization_id', function () {
    $tables = DB::connection('owner')->select(<<<'SQL'
        select c.relname, c.relrowsecurity, c.relforcerowsecurity,
               (select count(*) from pg_policies p where p.tablename = c.relname and p.schemaname = 'public') as policies
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
        join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
        where c.relkind = 'r'
    SQL);

    expect($tables)->not->toBeEmpty();
    foreach ($tables as $t) {
        expect($t->relrowsecurity)->toBeTrue("{$t->relname} must enable RLS");
        expect($t->relforcerowsecurity)->toBeTrue("{$t->relname} must force RLS");
        expect($t->policies)->toBeGreaterThan(0, "{$t->relname} needs a policy");
    }
});
