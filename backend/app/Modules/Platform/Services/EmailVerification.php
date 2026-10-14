<?php

namespace App\Modules\Platform\Services;

use App\Modules\Platform\Audit\AuditLogger;
use App\Modules\Platform\Mail\VerifyEmailMail;
use App\Modules\Platform\Models\User;
use App\Support\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Throwable;

class EmailVerification
{
    public function __construct(private readonly AuditLogger $audit) {}

    /** The link is signed and expires; the hash ties it to the address, so changing the address kills old links. */
    public function url(User $user): string
    {
        return URL::temporarySignedRoute('verification.verify', now()->addHours(config('accounting.verification_link_hours')), [
            'id' => $user->id,
            'hash' => sha1($user->email),
        ]);
    }

    /** A mail failure must not undo a registration: the person can ask for a new link. */
    public function send(User $user, string $locale): void
    {
        try {
            Mail::to($user->email)->send((new VerifyEmailMail($user->name, $this->url($user)))->locale($locale));
        } catch (Throwable $e) {
            Log::error('Verification e-mail could not be sent', ['user_id' => $user->id, 'error' => $e->getMessage()]);
        }
    }

    /** Re-sends to an unverified address. Says nothing about whether the address exists. */
    public function resend(string $email, string $locale): void
    {
        $row = DB::selectOne('select * from auth_lookup_user(?)', [$email]);
        if (! $row) {
            return;
        }
        $user = TenantContext::run((int) $row->organization_id, fn () => User::find($row->id));
        if ($user && ! $user->email_verified_at) {
            $this->send($user, $locale);
        }
    }

    /** @return bool false when the link does not belong to this user's current address */
    public function verify(int $id, string $hash): bool
    {
        $org = DB::selectOne('select auth_org_of_user(?) as org', [$id])?->org;
        if ($org === null) {
            return false;
        }

        return TenantContext::run((int) $org, function () use ($id, $hash) {
            $user = User::find($id);
            if (! $user || ! hash_equals(sha1($user->email), $hash)) {
                return false;
            }
            if (! $user->email_verified_at) {
                $user->forceFill(['email_verified_at' => now()])->save();
                $this->audit->log('auth.email_verified', 'user', $user->id, actorId: $user->id);
            }

            return true;
        });
    }
}
