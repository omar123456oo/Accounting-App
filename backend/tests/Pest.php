<?php

use App\Modules\Platform\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Support\Facades\DB;
use PragmaRX\Google2FA\Google2FA;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

pest()->extend(TestCase::class)->in('Feature', 'Unit');

/** Two organizations, each with one staff user, created through the owner connection (which bypasses row-level security). */
function seedTwoOrgs(): array
{
    $a = DB::connection('owner')->table('organizations')->insertGetId(['name' => 'DEMO Org A', 'created_at' => now(), 'updated_at' => now()]);
    $b = DB::connection('owner')->table('organizations')->insertGetId(['name' => 'DEMO Org B', 'created_at' => now(), 'updated_at' => now()]);
    foreach ([[$a, 'a@demo.test'], [$b, 'b@demo.test']] as [$org, $email]) {
        DB::connection('owner')->table('users')->insert([
            'organization_id' => $org, 'name' => 'DEMO', 'email' => $email,
            'password' => 'x', 'type' => 'staff', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    return [$a, $b];
}

/** A staff user in a fresh organization. With $role set, roles are seeded and the role assigned. */
function demoUser(string $password = 'CorrectHorse-123!', bool $mfa = false, ?string $role = null, string $type = 'staff'): User
{
    $org = DB::connection('owner')->table('organizations')->insertGetId(['name' => 'DEMO Org '.uniqid(), 'created_at' => now(), 'updated_at' => now()]);
    $secret = $mfa ? (new Google2FA)->generateSecretKey() : null;
    $user = User::on('owner')->create([
        'organization_id' => $org, 'name' => 'DEMO User', 'email' => 'demo'.uniqid().'@demo.test', 'password' => $password,
        'type' => $type, 'mfa_enabled' => $mfa, 'mfa_secret' => $secret, 'email_verified_at' => now(),
    ]);
    if ($role) {
        $seeder = new RolesAndPermissionsSeeder;
        $seeder->seedPermissions();
        $seeder->seedOrganization($org);
        app(PermissionRegistrar::class)->setPermissionsTeamId($org);
        App\Support\Tenancy\TenantContext::run($org, fn () => User::findOrFail($user->id)->assignRole($role));
    }

    // Return the user as the application sees it (app connection, inside its tenant), not the privileged owner-connection model.
    return App\Support\Tenancy\TenantContext::run($org, fn () => User::findOrFail($user->id));
}

function totp(User $user): string
{
    return (new Google2FA)->getCurrentOtp((string) $user->mfa_secret);
}
