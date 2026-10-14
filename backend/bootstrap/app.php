<?php

use App\Modules\Platform\Http\Middleware\EnsureUserType;
use App\Modules\Platform\Http\Middleware\SetLocaleFromHeader;
use App\Support\Idempotency\IdempotencyMiddleware;
use App\Support\Tenancy\SetTenantMiddleware;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Sanctum SPA mode: cookie session + CSRF for the Angular app on a stateful domain.
        $middleware->statefulApi();
        // Messages follow the Accept-Language header the Angular app sends (Arabic by default).
        $middleware->api(append: [SetLocaleFromHeader::class]);
        $middleware->alias([
            'tenant' => SetTenantMiddleware::class,
            'user.type' => EnsureUserType::class,
            'idempotent' => IdempotencyMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
