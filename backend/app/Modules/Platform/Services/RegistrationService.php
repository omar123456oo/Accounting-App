<?php

namespace App\Modules\Platform\Services;

use App\Modules\Platform\Audit\AuditLogger;
use App\Modules\Platform\Models\Organization;
use App\Modules\Platform\Models\User;
use App\Support\Tenancy\TenantContext;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Creates an accounting office and its owner in one transaction: either all of it exists afterwards, or none of it. */
class RegistrationService
{
    public function __construct(private readonly AuditLogger $audit, private readonly EmailVerification $verification) {}

    /** @param array{officeName: string, name: string, email: string, password: string} $data */
    public function register(array $data, string $locale): User
    {
        // A friendly answer for the common case; the unique index below still decides a real race.
        if (DB::selectOne('select 1 as taken from auth_lookup_user(?)', [$data['email']])) {
            throw $this->emailTaken();
        }

        try {
            $user = DB::transaction(function () use ($data, $locale) {
                $org = Organization::create(['name' => $data['officeName'], 'locale' => $locale]);

                $user = TenantContext::run($org->id, function () use ($data, $org) {
                    $user = User::create([
                        'organization_id' => $org->id,
                        'name' => $data['name'],
                        'email' => $data['email'],
                        'password' => $data['password'], // hashed by the model cast
                        'type' => 'staff',
                    ]);
                    $seeder = new RolesAndPermissionsSeeder;
                    $seeder->seedPermissions();
                    $seeder->seedOrganization($org->id);
                    $user->assignRole('owner');
                    $this->audit->log('auth.register', 'user', $user->id, after: ['organization_id' => $org->id], actorId: $user->id);

                    return $user;
                });

                // Only after the office really exists; a failed commit sends nothing.
                DB::afterCommit(fn () => $this->verification->send($user, $locale));

                return $user;
            });
        } catch (UniqueConstraintViolationException) {
            throw $this->emailTaken();
        }

        return $user;
    }

    private function emailTaken(): ValidationException
    {
        return ValidationException::withMessages(['email' => [__('An account with this email already exists.')]]);
    }
}
