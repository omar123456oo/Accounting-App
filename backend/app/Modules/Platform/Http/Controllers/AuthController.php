<?php

namespace App\Modules\Platform\Http\Controllers;

use App\Modules\Platform\Models\User;
use App\Modules\Platform\Services\LoginService;
use App\Support\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Spatie\Permission\PermissionRegistrar;

class AuthController extends Controller
{
    public function login(Request $request, LoginService $login): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
            'otp' => ['nullable', 'string'],
        ]);

        $user = $login->attempt($data['email'], $data['password'], $data['otp'] ?? null);

        Auth::guard('web')->login($user);
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        return response()->json(['user' => TenantContext::run((int) $user->organization_id, fn () => $this->payload($user))]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(null, 204);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->payload($request->user())]);
    }

    /** Must run inside the user's tenant: roles and permissions are tenant data. */
    private function payload(User $user): array
    {
        app(PermissionRegistrar::class)->setPermissionsTeamId($user->organization_id);

        return [
            'id' => $user->id,
            'name' => $user->name,
            'type' => $user->type,
            'permissions' => $user->hasRole('super_admin')
                ? \Spatie\Permission\Models\Permission::query()->pluck('name')->sort()->values()->all()
                : $user->getAllPermissions()->pluck('name')->sort()->values()->all(),
        ];
    }
}
