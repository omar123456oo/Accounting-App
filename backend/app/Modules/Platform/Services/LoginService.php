<?php

namespace App\Modules\Platform\Services;

use App\Modules\Platform\Audit\AuditLogger;
use App\Modules\Platform\Models\User;
use App\Support\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PragmaRX\Google2FA\Google2FA;
use Symfony\Component\HttpKernel\Exception\HttpException;

class LoginService
{
    public const MAX_FAILURES = 5;

    public const LOCK_MINUTES = 15;

    public function __construct(private readonly AuditLogger $audit, private readonly Google2FA $google2fa) {}

    /**
     * @throws ValidationException 422 for wrong credentials (the same message for unknown email and wrong password), or a missing/invalid OTP
     * @throws HttpException       423 while the account is locked
     */
    public function attempt(string $email, string $password, ?string $otp): User
    {
        $row = DB::selectOne('select * from auth_lookup_user(?)', [$email]);
        if (! $row) {
            // Same work as a real check, so the response time does not reveal whether the account exists.
            Hash::check($password, $this->dummyHash());
            throw ValidationException::withMessages(['email' => [__('These credentials do not match our records.')]]);
        }

        // The outcome is returned, not thrown: throwing inside the transaction would roll back the failure counter and audit rows.
        $result = TenantContext::run((int) $row->organization_id, fn () => $this->check((int) $row->id, $password, $otp));

        return match ($result['status']) {
            'ok' => $result['user'],
            'locked' => throw new HttpException(423, __('Too many failed attempts. The account is locked for 15 minutes.')),
            'unverified' => throw ValidationException::withMessages(['email' => [__('Please verify your e-mail address first. Use the link we sent you.')]]),
            'otp_required' => throw ValidationException::withMessages(['otp' => [__('The verification code is required.')]]),
            'otp_invalid' => throw ValidationException::withMessages(['otp' => [__('The verification code is invalid.')]]),
            default => throw ValidationException::withMessages(['email' => [__('These credentials do not match our records.')]]),
        };
    }

    private function dummyHash(): string
    {
        static $hash = null;

        return $hash ??= Hash::make(Str::random(32));
    }

    /** @return array{status: string, user?: User} */
    private function check(int $userId, string $password, ?string $otp): array
    {
        $user = User::query()->lockForUpdate()->findOrFail($userId);

        if ($user->locked_until && $user->locked_until->isFuture()) {
            return ['status' => 'locked'];
        }
        if (! Hash::check($password, $user->password)) {
            return ['status' => $this->recordFailure($user, 'bad_password')];
        }
        // Checked after the password, so the answer never reveals whether an unverified account exists.
        if (! $user->email_verified_at) {
            return ['status' => 'unverified'];
        }
        if ($user->mfa_enabled) {
            if (! $otp) {
                return ['status' => 'otp_required'];
            }
            if (! $this->google2fa->verifyKey((string) $user->mfa_secret, $otp)) {
                return ['status' => $this->recordFailure($user, 'bad_otp', 'otp_invalid')];
            }
        }

        $user->forceFill(['failed_logins' => 0, 'locked_until' => null])->save();
        $this->audit->log('auth.login', 'user', $user->id, actorId: $user->id);

        return ['status' => 'ok', 'user' => $user];
    }

    private function recordFailure(User $user, string $reason, string $status = 'invalid'): string
    {
        $failures = $user->failed_logins + 1;
        $this->audit->log('auth.login_failed', 'user', $user->id, after: ['reason' => $reason, 'attempt' => $failures], actorId: $user->id);
        if ($failures >= self::MAX_FAILURES) {
            $user->forceFill(['failed_logins' => 0, 'locked_until' => now()->addMinutes(self::LOCK_MINUTES)])->save();
            $this->audit->log('auth.lockout', 'user', $user->id, actorId: $user->id);
        } else {
            $user->forceFill(['failed_logins' => $failures])->save();
        }

        return $status;
    }
}
