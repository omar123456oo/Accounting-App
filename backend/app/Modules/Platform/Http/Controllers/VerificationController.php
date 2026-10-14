<?php

namespace App\Modules\Platform\Http\Controllers;

use App\Modules\Platform\Services\EmailVerification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class VerificationController extends Controller
{
    /** Opened from the e-mail (the `signed` middleware has already checked the signature and expiry). */
    public function verify(int $id, string $hash, EmailVerification $verification): RedirectResponse
    {
        $ok = $verification->verify($id, $hash);
        abort_unless($ok, 403);

        return redirect()->away(config('accounting.frontend_url').'/login?verified=1');
    }

    /** Always answers 202, so it cannot be used to find out which addresses have accounts. */
    public function resend(Request $request, EmailVerification $verification): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'string', 'email']]);
        $verification->resend(strtolower(trim($data['email'])), app()->getLocale());

        return response()->json(['message' => __('If this address has an unverified account, a new link is on its way.')], 202);
    }
}
