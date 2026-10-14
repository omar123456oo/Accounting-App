<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/** Spatie runs with teams, so roles and role/permission assignments carry organization_id and are tenant data. `permissions` itself is global. */
return new class extends Migration
{
    private const TABLES = ['roles', 'model_has_roles', 'model_has_permissions'];

    public function up(): void
    {
        foreach (self::TABLES as $t) {
            Schema::tenantPolicy($t);
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $t) {
            Schema::dropTenantPolicy($t);
        }
    }
};
