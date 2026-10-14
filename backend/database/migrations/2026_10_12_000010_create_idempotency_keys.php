<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('idempotency_keys', function (Blueprint $t) {
            $t->unsignedBigInteger('organization_id');
            $t->unsignedBigInteger('user_id');
            $t->string('key', 128);
            $t->string('route');
            $t->string('request_hash', 64);
            $t->unsignedSmallInteger('status_code')->nullable();
            $t->longText('response_body')->nullable();
            $t->timestampTz('created_at')->useCurrent();
            $t->unique(['organization_id', 'user_id', 'key', 'route']);
        });
        Schema::tenantPolicy('idempotency_keys');
    }

    public function down(): void
    {
        Schema::dropIfExists('idempotency_keys');
    }
};
