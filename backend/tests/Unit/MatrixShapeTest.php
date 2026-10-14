<?php

use Database\Seeders\RolesAndPermissionsSeeder;

it('only references permissions that exist', function () {
    $known = RolesAndPermissionsSeeder::PERMISSIONS;
    foreach (RolesAndPermissionsSeeder::matrix() as $role => $permissions) {
        expect(array_diff($permissions, $known))->toBe([], "$role references an unknown permission");
    }
});

it('limits payroll to owner and hr_payroll', function () {
    $holders = array_keys(array_filter(RolesAndPermissionsSeeder::matrix(), fn ($p) => in_array('payroll.view', $p, true)));
    sort($holders);
    expect($holders)->toBe(['hr_payroll', 'owner']);
});

it('gives read_only no write permission', function () {
    $writes = array_filter(RolesAndPermissionsSeeder::matrix()['read_only'], fn ($p) => ! str_ends_with($p, '.view'));
    expect($writes)->toBe([]);
});

it('keeps HR files and leave approval with owner, office manager and hr_payroll only', function () {
    foreach (['hr.view', 'hr.manage', 'leave.approve'] as $permission) {
        $holders = array_keys(array_filter(RolesAndPermissionsSeeder::matrix(), fn ($p) => in_array($permission, $p, true)));
        sort($holders);
        expect($holders)->toBe(['hr_payroll', 'office_manager', 'owner'], $permission);
    }
});

it('lets every staff role ask for leave', function () {
    foreach (RolesAndPermissionsSeeder::matrix() as $role => $permissions) {
        if (in_array($role, ['client', 'read_only', 'chief_accountant'], true)) {
            continue;
        }
        expect($permissions)->toContain('leave.apply');
    }
});
