<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\PermissionRegistrar;

abstract class TestCase extends BaseTestCase
{
    private static bool $migrated = false;

    protected function setUp(): void
    {
        parent::setUp();
        // Schema changes need the owner role; the app role cannot create tables. Once per test run.
        if (! self::$migrated) {
            Artisan::call('migrate:fresh', ['--database' => 'owner', '--force' => true]);
            self::$migrated = true;
        }
        // Requests that look like they come from the SPA, so Sanctum starts a session.
        $this->withHeaders(['Origin' => 'http://localhost:4200', 'Referer' => 'http://localhost:4200/']);
    }

    protected function tearDown(): void
    {
        // TRUNCATE does not fire the append-only row triggers, so it can reset the audit tables between tests.
        $tables = collect(DB::connection('owner')->select("select tablename from pg_tables where schemaname = 'public' and tablename not in ('migrations')"))->pluck('tablename')->implode(', ');
        DB::connection('owner')->statement("TRUNCATE $tables RESTART IDENTITY CASCADE");
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        parent::tearDown();
    }
}
