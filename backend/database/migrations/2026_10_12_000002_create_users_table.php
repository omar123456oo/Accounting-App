<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $t->string('name');
            // Globally unique and lower-case: login finds the user before the tenant is known.
            $t->string('email')->unique();
            $t->timestampTz('email_verified_at')->nullable();
            $t->string('password');
            $t->string('type'); // staff | client
            $t->unsignedBigInteger('client_id')->nullable(); // used from Phase 2
            $t->timestampTz('locked_until')->nullable();
            $t->unsignedInteger('failed_logins')->default(0);
            $t->text('mfa_secret')->nullable(); // encrypted by the model cast
            $t->boolean('mfa_enabled')->default(false);
            $t->rememberToken();
            $t->timestamps();
            $t->index('organization_id');
        });
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_type_check CHECK (type IN ('staff','client'))");
        DB::statement('ALTER TABLE users ADD CONSTRAINT users_email_lower CHECK (email = lower(email))');
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
