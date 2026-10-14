<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('client_assignments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $t->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $t->unsignedBigInteger('client_id'); // the clients table arrives in Phase 2
            $t->string('role_on_client')->nullable();
            $t->date('starts_on');
            $t->date('ends_on')->nullable();
            $t->timestamps();
            $t->index(['organization_id', 'user_id']);
        });
        Schema::tenantPolicy('client_assignments');
    }

    public function down(): void
    {
        Schema::dropIfExists('client_assignments');
    }
};
