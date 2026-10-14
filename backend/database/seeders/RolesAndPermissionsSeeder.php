<?php

namespace Database\Seeders;

use App\Modules\Platform\Models\Organization;
use App\Support\Tenancy\TenantContext;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * The single, readable source of truth for who may do what. Permissions are global; roles exist per organization.
 *
 * NOTE: office managers must review this matrix with the owner before production use. It is a starting point, not a legal or
 * accounting judgement. `super_admin` passes every check through Gate::before, so it is not listed here.
 */
class RolesAndPermissionsSeeder extends Seeder
{
    /** Permission names are `domain.action`. */
    public const PERMISSIONS = [
        'clients.view', 'clients.create', 'clients.update', 'clients.archive',
        'journals.view', 'journals.create', 'journals.update', 'journals.delete', 'journals.amend', 'journals.approve', 'journals.post',
        'invoices.view', 'invoices.create', 'invoices.update', 'invoices.delete', 'invoices.amend', 'invoices.approve', 'invoices.issue',
        'expenses.view', 'expenses.create', 'expenses.approve',
        'tax.view', 'tax.prepare', 'tax.review',
        'hr.view', 'hr.manage', 'leave.apply', 'leave.approve',
        'payroll.view', 'payroll.process',
        'reports.view',
        'documents.view', 'documents.upload', 'documents.review',
        'workflows.view', 'workflows.approve',
        'admin.users', 'admin.roles', 'admin.settings', 'admin.audit',
    ];

    /** @return array<string, string[]> role => permissions */
    public static function matrix(): array
    {
        $all = self::PERMISSIONS;
        $nonPayroll = array_values(array_filter($all, fn ($p) => ! str_starts_with($p, 'payroll.')));
        // HR files and leave decisions belong to the owner and the HR role, not to every office role.
        $nonHr = array_values(array_filter($nonPayroll, fn ($p) => ! in_array($p, ['hr.view', 'hr.manage', 'leave.approve'], true)));
        $view = array_values(array_filter($all, fn ($p) => str_ends_with($p, '.view') && ! str_starts_with($p, 'payroll.') && ! str_starts_with($p, 'hr.')));

        return [
            'owner' => $all,
            'office_manager' => $nonPayroll, // keeps hr.view/hr.manage/leave.approve but never payroll
            'chief_accountant' => array_values(array_diff($nonHr, ['admin.users', 'admin.roles', 'admin.settings'])),
            'accountant' => [
                'leave.apply', 'clients.view', 'clients.update', 'journals.view', 'journals.create', 'journals.update', 'journals.delete',
                'invoices.view', 'invoices.create', 'invoices.update', 'invoices.delete', 'expenses.view', 'expenses.create',
                'tax.view', 'tax.prepare', 'reports.view', 'documents.view', 'documents.upload', 'workflows.view',
            ],
            'tax_specialist' => ['leave.apply', 'clients.view', 'journals.view', 'invoices.view', 'tax.view', 'tax.prepare', 'tax.review', 'reports.view', 'documents.view', 'documents.upload'],
            'auditor' => [...$view, 'leave.apply', 'admin.audit'],
            'hr_payroll' => ['clients.view', 'hr.view', 'hr.manage', 'leave.apply', 'leave.approve', 'payroll.view', 'payroll.process', 'documents.view', 'documents.upload'],
            'sales' => ['leave.apply', 'clients.view', 'clients.create', 'clients.update', 'invoices.view', 'invoices.create', 'documents.view'],
            'client' => [], // portal users; their access is portal-scoped, not staff permissions
            'read_only' => $view,
        ];
    }

    public static function roleNames(): array
    {
        return ['super_admin', ...array_keys(self::matrix())];
    }

    public function seedPermissions(): void
    {
        foreach (self::PERMISSIONS as $name) {
            Permission::findOrCreate($name, 'web');
        }
    }

    public function run(): void
    {
        $this->seedPermissions();
        foreach (Organization::all() as $org) {
            $this->seedOrganization($org->id);
        }
    }

    public function seedOrganization(int $orgId): void
    {
        app(PermissionRegistrar::class)->setPermissionsTeamId($orgId);
        TenantContext::run($orgId, function () {
            Role::findOrCreate('super_admin', 'web');
            foreach (self::matrix() as $role => $permissions) {
                Role::findOrCreate($role, 'web')->syncPermissions($permissions);
            }
        });
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}
