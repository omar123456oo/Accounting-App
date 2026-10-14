<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Schema::tenantPolicy() is registered by AppServiceProvider: enable + force RLS and add the fail-closed policy.
        Schema::tenantPolicy('users');
    }

    public function down(): void
    {
        Schema::dropTenantPolicy('users');
    }
};
