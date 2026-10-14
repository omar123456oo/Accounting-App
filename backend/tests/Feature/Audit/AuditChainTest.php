<?php

use App\Modules\Platform\Audit\AuditLogger;
use App\Support\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;

it('chains events per organization', function () {
    [$a] = seedTwoOrgs();
    TenantContext::run($a, function () {
        app(AuditLogger::class)->log('test.one', 'thing', 1);
        app(AuditLogger::class)->log('test.two', 'thing', 1);
    });
    $rows = DB::connection('owner')->table('audit_events')->orderBy('seq')->get();
    expect($rows->pluck('seq')->all())->toBe([1, 2])
        ->and($rows[1]->prev_hash)->toBe($rows[0]->hash)
        ->and($rows[0]->prev_hash)->toBe(str_repeat('0', 64));
});

it('keeps separate chains for separate organizations', function () {
    [$a, $b] = seedTwoOrgs();
    TenantContext::run($a, fn () => app(AuditLogger::class)->log('x', 'thing', 1));
    TenantContext::run($b, fn () => app(AuditLogger::class)->log('x', 'thing', 1));
    expect(DB::connection('owner')->table('audit_events')->pluck('seq')->all())->toBe([1, 1]);
});

it('rejects update and delete', function () {
    [$a] = seedTwoOrgs();
    TenantContext::run($a, fn () => app(AuditLogger::class)->log('x', 'thing', 1));
    expect(fn () => DB::connection('owner')->table('audit_events')->update(['action' => 'tamper']))->toThrow(\Illuminate\Database\QueryException::class);
    expect(fn () => DB::connection('owner')->table('audit_events')->delete())->toThrow(\Illuminate\Database\QueryException::class);
});

it('does not let the app role write seq or touch the chain heads', function () {
    [$a] = seedTwoOrgs();
    expect(fn () => TenantContext::run($a, fn () => DB::table('audit_chain_heads')->count()))->toThrow(\Illuminate\Database\QueryException::class);
});

it('refuses to log outside a transaction', function () {
    expect(fn () => app(AuditLogger::class)->log('x', 'thing', 1))->toThrow(LogicException::class);
});

it('verifies an intact chain and detects tampering', function () {
    [$a] = seedTwoOrgs();
    TenantContext::run($a, function () {
        app(AuditLogger::class)->log('a', 't', 1, ['k' => 'v'], ['k' => 'w']);
        app(AuditLogger::class)->log('b', 't', 1);
    });
    $this->artisan('audit:verify', ['organization' => $a])->assertSuccessful();

    DB::connection('owner')->unprepared('ALTER TABLE audit_events DISABLE TRIGGER audit_events_immutable');
    DB::connection('owner')->table('audit_events')->where('seq', 1)->update(['action' => 'forged']);
    DB::connection('owner')->unprepared('ALTER TABLE audit_events ENABLE TRIGGER audit_events_immutable');
    $this->artisan('audit:verify', ['organization' => $a])->assertFailed();
});

it('verifies identically under a different session time zone', function () {
    [$a] = seedTwoOrgs();
    TenantContext::run($a, fn () => app(AuditLogger::class)->log('a', 't', 1));
    DB::connection('owner')->statement("SET TIME ZONE 'Asia/Tokyo'");
    $this->artisan('audit:verify', ['organization' => $a])->assertSuccessful();
    DB::connection('owner')->statement('RESET TIME ZONE');
});

it('gives two concurrent writers distinct, contiguous sequence numbers', function () {
    [$a] = seedTwoOrgs();
    $env = array_merge(getenv(), ['APP_ENV' => 'testing', 'DB_DATABASE' => 'accounting_test']);
    $procs = [];
    foreach ([1, 2] as $i) {
        $procs[] = proc_open([PHP_BINARY, base_path('artisan'), 'audit:burst', (string) $a, '50'], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, base_path(), $env);
    }
    foreach ($procs as $p) {
        expect(proc_close($p))->toBe(0);
    }
    $seqs = DB::connection('owner')->table('audit_events')->orderBy('seq')->pluck('seq')->all();
    expect($seqs)->toBe(range(1, 100));
    $this->artisan('audit:verify', ['organization' => $a])->assertSuccessful();
});
