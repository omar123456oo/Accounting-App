<?php

namespace App\Modules\Platform\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Keeps staff and client sessions on their own route groups. The server decides; the SPA guard is only for UX. */
class EnsureUserType
{
    public function handle(Request $request, Closure $next, string $type): Response
    {
        abort_unless($request->user()?->type === $type, 403);

        return $next($request);
    }
}
