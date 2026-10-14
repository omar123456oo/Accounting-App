<?php

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Route;

// Staff API. Every GET route added here is picked up by tests/Feature/Rbac/AccessMatrixTest.php,
// which fails until the route's expected access per role is declared.
Route::get('/ping', fn () => ['pong' => true])->middleware('can:clients.view');

if (app()->environment('testing')) {
    // Handler for the idempotency tests: counts how many times it really ran.
    Route::post('/_test/charge', function () {
        Cache::increment('charge_count');

        return response()->json(['charged' => Cache::get('charge_count')], 201);
    })->middleware('idempotent');
}
