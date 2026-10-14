<?php

namespace App\Modules\Platform\Http\Controllers;

use App\Modules\Platform\Audit\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use PragmaRX\Google2FA\Google2FA;

class MfaController extends Controller
{
    public function __construct(private readonly Google2FA $google2fa, private readonly AuditLogger $audit) {}

    public function setup(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->mfa_enabled, 409, 'Two-factor authentication is already enabled.');

        // Stored (encrypted by the cast) but not active until the user proves they can produce a code.
        $secret = $this->google2fa->generateSecretKey();
        $user->forceFill(['mfa_secret' => $secret])->save();

        return response()->json([
            'secret' => $secret,
            'otpauth_url' => $this->google2fa->getQRCodeUrl(config('app.name'), $user->email, $secret),
        ]);
    }

    public function confirm(Request $request): JsonResponse
    {
        $data = $request->validate(['otp' => ['required', 'string']]);
        $user = $request->user();
        abort_unless($user->mfa_secret, 409, 'Start the setup first.');

        if (! $this->google2fa->verifyKey((string) $user->mfa_secret, $data['otp'])) {
            return response()->json(['message' => __('The verification code is invalid.'), 'errors' => ['otp' => [__('The verification code is invalid.')]]], 422);
        }
        $user->forceFill(['mfa_enabled' => true])->save();
        $this->audit->log('auth.mfa_enabled', 'user', $user->id);

        return response()->json(['mfa_enabled' => true]);
    }
}
