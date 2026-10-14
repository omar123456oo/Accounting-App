<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Authentication must find a user before the tenant is known, but the users policy hides every row until app.org_id is set.
 * These two narrow SECURITY DEFINER functions are the only way around it, and they expose no secrets.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
CREATE OR REPLACE FUNCTION auth_lookup_user(p_email text)
RETURNS TABLE(id bigint, organization_id bigint, type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.organization_id, u.type FROM users u WHERE u.email = lower(p_email) LIMIT 1
$$
SQL);
        DB::statement(<<<'SQL'
CREATE OR REPLACE FUNCTION auth_org_of_user(p_id bigint)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.organization_id FROM users u WHERE u.id = p_id
$$
SQL);
        foreach (['auth_lookup_user(text)', 'auth_org_of_user(bigint)'] as $fn) {
            DB::statement("REVOKE ALL ON FUNCTION $fn FROM PUBLIC");
            DB::statement("GRANT EXECUTE ON FUNCTION $fn TO acct_app");
        }
    }

    public function down(): void
    {
        DB::statement('DROP FUNCTION IF EXISTS auth_lookup_user(text)');
        DB::statement('DROP FUNCTION IF EXISTS auth_org_of_user(bigint)');
    }
};
