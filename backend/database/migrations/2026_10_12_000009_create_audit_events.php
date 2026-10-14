<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Append-only, per-organization hash chain. seq, prev_hash and hash are assigned by the database trigger, never by the app.
 *
 * The hashed text must not depend on session settings: the timestamp is rendered in UTC with a fixed format, and jsonb::text
 * is canonical. Verification therefore gives the same answer from any connection.
 */
return new class extends Migration
{
    private const HASH_EXPR = <<<'SQL'
encode(digest(
    %1$s || '|' || %2$s || '|' || %3$s || '|' || coalesce(%4$s,'') || '|' ||
    %5$s || '|' || %6$s || '|' || coalesce(%7$s,'') || '|' ||
    coalesce(%8$s,'') || '|' || coalesce(%9$s,'') || '|' ||
    to_char(%10$s AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
  'sha256'), 'hex')
SQL;

    public function up(): void
    {
        Schema::create('audit_events', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->unsignedBigInteger('seq');
            $t->unsignedBigInteger('actor_id')->nullable();
            $t->text('action');
            $t->text('entity_type');
            $t->text('entity_id')->nullable();
            $t->jsonb('before')->nullable();
            $t->jsonb('after')->nullable();
            $t->ipAddress('ip')->nullable();
            $t->timestampTz('occurred_at')->useCurrent();
            $t->text('prev_hash')->default('');
            $t->text('hash')->default('');
            $t->unique(['organization_id', 'seq']);
        });

        Schema::create('audit_chain_heads', function (Blueprint $t) {
            $t->unsignedBigInteger('organization_id')->primary();
            $t->unsignedBigInteger('last_seq')->default(0);
            $t->text('last_hash')->default(str_repeat('0', 64));
        });

        Schema::tenantPolicy('audit_events');
        Schema::tenantPolicy('audit_chain_heads');
        // The app role only appends. The heads table is touched by the SECURITY DEFINER trigger alone.
        DB::statement('REVOKE UPDATE, DELETE ON audit_events FROM acct_app');
        DB::statement('REVOKE ALL ON audit_chain_heads FROM acct_app');

        $insertHash = sprintf(self::HASH_EXPR, 'h.last_hash', 'NEW.seq', 'NEW.organization_id', 'NEW.actor_id::text', 'NEW.action', 'NEW.entity_type', 'NEW.entity_id', 'NEW."before"::text', 'NEW."after"::text', 'NEW.occurred_at');
        DB::unprepared(<<<SQL
CREATE OR REPLACE FUNCTION audit_events_chain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS \$\$
DECLARE h audit_chain_heads%ROWTYPE;
BEGIN
  INSERT INTO audit_chain_heads(organization_id) VALUES (NEW.organization_id) ON CONFLICT DO NOTHING;
  SELECT * INTO h FROM audit_chain_heads WHERE organization_id = NEW.organization_id FOR UPDATE;
  NEW.seq := h.last_seq + 1;
  NEW.prev_hash := h.last_hash;
  NEW.hash := $insertHash;
  UPDATE audit_chain_heads SET last_seq = NEW.seq, last_hash = NEW.hash WHERE organization_id = NEW.organization_id;
  RETURN NEW;
END \$\$;
SQL);
        DB::unprepared('CREATE TRIGGER audit_events_chain BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION audit_events_chain()');

        DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION audit_events_block_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_events is append-only'; END $$;
SQL);
        DB::unprepared('CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION audit_events_block_change()');

        // Recompute the chain in seq order; return the first seq whose number, prev_hash or hash does not match.
        $verifyHash = sprintf(self::HASH_EXPR, 'prev', 'r.seq', 'r.organization_id', 'r.actor_id::text', 'r.action', 'r.entity_type', 'r.entity_id', 'r."before"::text', 'r."after"::text', 'r.occurred_at');
        DB::unprepared(<<<SQL
CREATE OR REPLACE FUNCTION audit_verify_chain(p_org bigint) RETURNS TABLE(first_bad_seq bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS \$\$
DECLARE
  r audit_events%ROWTYPE;
  prev text := repeat('0', 64);
  expected bigint := 1;
BEGIN
  FOR r IN SELECT * FROM audit_events WHERE organization_id = p_org ORDER BY seq LOOP
    IF r.seq <> expected OR r.prev_hash <> prev OR r.hash <> $verifyHash THEN
      first_bad_seq := r.seq;
      RETURN NEXT;
      RETURN;
    END IF;
    prev := r.hash;
    expected := expected + 1;
  END LOOP;
END \$\$;
SQL);
        DB::statement('REVOKE ALL ON FUNCTION audit_verify_chain(bigint) FROM PUBLIC');
    }

    public function down(): void
    {
        DB::statement('DROP FUNCTION IF EXISTS audit_verify_chain(bigint)');
        Schema::dropIfExists('audit_events');
        Schema::dropIfExists('audit_chain_heads');
        DB::statement('DROP FUNCTION IF EXISTS audit_events_chain()');
        DB::statement('DROP FUNCTION IF EXISTS audit_events_block_change()');
    }
};
