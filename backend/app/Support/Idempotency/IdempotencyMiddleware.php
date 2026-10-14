<?php

namespace App\Support\Idempotency;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Makes a state-changing route safe to retry. It must run inside the tenant transaction (the `tenant` middleware), so the key claim
 * and the handler's own writes commit or roll back together: a handler that fails leaves no claim behind and the retry runs again.
 *
 * Two identical parallel requests: the second INSERT blocks on the first's uncommitted row, then either finds the stored
 * response (replay) or, if the first rolled back, claims the key itself.
 */
class IdempotencyMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $key = (string) $request->header('Idempotency-Key');
        if ($key === '' || strlen($key) > 128) {
            return response()->json(['message' => 'The Idempotency-Key header is required.'], 400);
        }

        $user = $request->user();
        $route = $request->method().' '.$request->route()->uri();
        $hash = hash('sha256', $request->method().'|'.$request->path().'|'.$this->canonical($request->json()->all() ?: $request->all()));
        $scope = [(int) $user->organization_id, (int) $user->id, $key, $route];

        $claimed = DB::affectingStatement(
            'insert into idempotency_keys (organization_id, user_id, "key", route, request_hash) values (?, ?, ?, ?, ?) on conflict do nothing',
            [...$scope, $hash],
        ) === 1;

        if ($claimed) {
            $response = $next($request);
            if ($response->getStatusCode() >= 500) {
                DB::delete('delete from idempotency_keys where organization_id = ? and user_id = ? and "key" = ? and route = ?', $scope);

                return $response;
            }
            DB::update(
                'update idempotency_keys set status_code = ?, response_body = ? where organization_id = ? and user_id = ? and "key" = ? and route = ?',
                [$response->getStatusCode(), $response->getContent(), ...$scope],
            );

            return $response;
        }

        $row = DB::selectOne(
            'select request_hash, status_code, response_body from idempotency_keys where organization_id = ? and user_id = ? and "key" = ? and route = ? for update',
            $scope,
        );
        if ($row->request_hash !== $hash) {
            return response()->json(['message' => 'This Idempotency-Key was already used with a different request.'], 422);
        }

        return response($row->response_body ?? '', $row->status_code ?? 409, ['Content-Type' => 'application/json', 'Idempotent-Replayed' => 'true']);
    }

    /** Key order must not change the hash. */
    private function canonical(array $data): string
    {
        $sort = function (array $a) use (&$sort): array {
            ksort($a);

            return array_map(fn ($v) => is_array($v) ? $sort($v) : $v, $a);
        };

        return json_encode($sort($data), JSON_UNESCAPED_UNICODE);
    }
}
