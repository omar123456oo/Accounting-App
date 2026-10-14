<?php

use Illuminate\Support\Facades\Route;

// Client portal API (Phase 6). Phase 1 provides the route group and the user.type:client guard only.
Route::get('/ping', fn () => ['pong' => true]);
