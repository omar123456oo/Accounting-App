<?php

namespace Database\Seeders;

use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RuntimeException;
use Spatie\Permission\PermissionRegistrar;

/** Local-development data only: two fictional DEMO organizations with one user per role. Refuses to run in production. */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('production')) {
            throw new RuntimeException('DemoSeeder must never run in production.');
        }

        $password = Str::password(20);
        $owner = DB::connection('owner');
        $roles = RolesAndPermissionsSeeder::roleNames();
        $rows = [];

        foreach ([1 => 'DEMO Cairo Accounting', 2 => 'DEMO Alexandria Audit'] as $n => $orgName) {
            $orgId = $owner->table('organizations')->insertGetId(['name' => $orgName, 'created_at' => now(), 'updated_at' => now()]);
            foreach ($roles as $role) {
                $email = "demo.$role.$n@demo.test";
                $userId = $owner->table('users')->insertGetId([
                    'organization_id' => $orgId,
                    'name' => 'DEMO '.str_replace('_', ' ', $role).' '.$n,
                    'email' => $email,
                    'password' => Hash::make($password),
                    'email_verified_at' => now(),
                    'type' => $role === 'client' ? 'client' : 'staff',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $rows[] = [$orgId, $userId, $role, $email];
            }
        }

        $this->call(RolesAndPermissionsSeeder::class);
        foreach ($rows as [$orgId, $userId, $role]) {
            app(PermissionRegistrar::class)->setPermissionsTeamId($orgId);
            TenantContext::run($orgId, fn () => \App\Modules\Platform\Models\User::findOrFail($userId)->assignRole($role));
        }

        $this->command?->warn('DEMO users created. The password below is shown once and is for local development only.');
        $this->command?->line("Password for every demo user: $password");
        $this->command?->table(['Organization', 'Role', 'Email'], array_map(fn ($r) => [$r[0], $r[2], $r[3]], $rows));
    }
}
