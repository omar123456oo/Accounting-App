<?php

use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => ['status' => 'ok']);

Route::prefix('v1')->group(function () {
    Route::prefix('auth')->group(base_path('routes/auth.php'));
    Route::middleware(['auth:sanctum', 'tenant', 'user.type:staff'])->prefix('staff')->group(base_path('routes/staff.php'));
    Route::middleware(['auth:sanctum', 'tenant', 'user.type:client'])->prefix('portal')->group(base_path('routes/portal.php'));
});
