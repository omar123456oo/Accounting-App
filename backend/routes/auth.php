<?php

use App\Modules\Platform\Http\Controllers\AuthController;
use App\Modules\Platform\Http\Controllers\MfaController;
use App\Modules\Platform\Http\Controllers\RegisterController;
use App\Modules\Platform\Http\Controllers\VerificationController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [RegisterController::class, 'register'])->middleware('throttle:register');
Route::get('/verify/{id}/{hash}', [VerificationController::class, 'verify'])->middleware('signed')->name('verification.verify');
Route::post('/verification/resend', [VerificationController::class, 'resend'])->middleware('throttle:verification');
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware(['auth:sanctum', 'tenant'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/mfa/setup', [MfaController::class, 'setup']);
    Route::post('/mfa/confirm', [MfaController::class, 'confirm']);
});
