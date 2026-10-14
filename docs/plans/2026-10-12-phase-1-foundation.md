# Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use beads-superpowers:subagent-driven-development (recommended) or beads-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Beads and git are not installed in this workspace, so "Checkpoint" steps replace commits until `git init` is run (Task 0).

**Goal:** A running Docker-based Laravel + Angular + PostgreSQL system with tenant-isolated, RBAC-protected, audited, bilingual (ar/en, RTL/LTR) foundations that every later phase builds on.

**Architecture:** Modular monolith. Laravel API under `/api/v1/{staff,portal}`, Postgres with `FORCE ROW LEVEL SECURITY` and a non-owner app role, a DB-computed per-organization audit hash chain, Angular with two lazy roots (`/app`, `/portal`).

**Tech Stack:** PHP 8.3, Laravel 11, Sanctum, spatie/laravel-permission, pragmarx/google2fa-laravel, Pest, Scramble (OpenAPI), PostgreSQL 16 + pgcrypto, MinIO, Mailpit, Angular (latest stable), Bootstrap 5 (+RTL build), ngx-translate, Jest, Playwright.

**Spec:** `docs/specs/2026-10-12-accounting-office-system-roadmap-design.md` (including its Stress Test Results).

## Implementation status (2026-10-12)

**Verified (runs and passes here):** Task 9 and Task 10, the Angular scaffold, i18n/RTL, auth, guards, interceptors, shell and Playwright specs (`ng test` 370 passing, `ng build` clean).

**Written but never executed:** everything on the backend (Tasks 1-8 and 11) and the Docker stack. The machine this was built on has no Docker, PHP, Composer or PostgreSQL. All PHP passes a syntax parse, nothing more. Expect some first-run fixes. The first run is the real verification:

```bash
./scripts/bootstrap-backend.sh && docker compose up -d
docker compose exec app php artisan migrate --database=owner --force
docker compose exec app ./vendor/bin/pest
./scripts/restore-drill.sh
```

| Task | State |
|---|---|
| 0 Repo hygiene | Git and `.gitignore` done. Installing Docker is still a user action. |
| 1 Docker + Laravel scaffold | Files written (`docker-compose.yml`, `docker/*`, `backend/.env.example`, `scripts/bootstrap-backend.sh`). Not run. |
| 2 Tenancy + RLS | Migrations, `TenantContext`, middleware, job trait, tests written. Not run. |
| 3 Auth, lockout, MFA | `LoginService`, controllers, routes, tests written. Not run. **Registration and e-mail verification added** (`RegistrationService`, `EmailVerification`, `RegisterTest`, `VerificationTest`); the plan itself had no register endpoint, the Angular register page needed one. |
| 4 RBAC | Seeder matrix, `AccessScope`, role-change auditing, access-matrix test written. Not run. |
| 5 Audit chain | Migration (triggers, verify function), `AuditLogger`, `audit:verify`, concurrency test written. Not run. |
| 6 Idempotency | Middleware and tests written. Not run. |
| 7 OpenAPI, CI, restore drill | Scramble gate, `ci.yml`, `restore-drill.sh`, runbook written. Not run. RPO/RTO remain unconfirmed targets. |
| 8 Arabic PDF spike | Both renderers, sample view and `pdf:spike` written. **Needs a native-reader review**; ADR-0001 is "Proposed". |
| 11 Demo seed + docs | `DemoSeeder`, `docs/setup.md`, `admin-guide.md`, `security.md` written. The full green pass (step 4) has not happened. |

**Deviations from the plan, and why:**

1. `acct_owner` is created with `BYPASSRLS`. The plan forces RLS on tables and also has the owner connection seed rows across tenants; with `FORCE` the owner would be blocked too. The application role still has no bypass.
2. The `owner` connection is registered in `AppServiceProvider` instead of editing `config/database.php`, so the skeleton needs no patching.
3. Added `TenantUserProvider` and `auth_org_of_user()`. The plan's session guard loads the user before the tenant is set, which row-level security would hide, so every authenticated request would have returned 401.
4. The audit hash renders `occurred_at` in UTC with a fixed format. Casting the timestamp to text depends on the session time zone and would report false tampering.
5. `TenantContext::run` restores the outer tenant after a nested call.
6. `pdf:spike` is one command with an engine argument instead of two commands.
7. A separate `accounting_test` database is used for tests, because they run `migrate:fresh`.
8. The Spatie permission migration is renamed to `2026_10_12_000005_...` by the bootstrap script so ordering is fixed.
9. Scramble is limited to `v1` routes and gated; separate staff/portal tags are not done.
10. `pint --test` in CI has not been run against the new PHP and may need `./vendor/bin/pint` first.

## Global Constraints

- Money is `NUMERIC(19,4)` (no money tables yet in Phase 1; applies to later phases).
- Every tenant table has `organization_id bigint not null` and `FORCE ROW LEVEL SECURITY`; policies fail closed (no `app.org_id` set means zero rows).
- App connects as role `acct_app` (no `BYPASSRLS`, not table owner). Migrations run as `acct_owner`.
- Tenant is set with `set_config('app.org_id', ?, true)` (transaction-local) inside a transaction wrapping every request and job.
- `users.type` is `staff` or `client`. Staff routes: `/api/v1/staff/*`. Portal routes: `/api/v1/portal/*`.
- Audit rows are written in the same transaction as the change; hash computed in the DB.
- Default timezone `Africa/Cairo`; business dates are `DATE`, event times `timestamptz` UTC.
- No secrets in source control. `.env` is git-ignored; `.env.example` has placeholders only.
- No Egyptian tax or payroll rate is seeded as fact.
- Demo seed data is labelled `DEMO` and fictional.

## Out of scope for Phase 1 (tracked, not dropped)

Clients/CRM (Phase 2), ledger and number sequences (Phase 3), invoicing (4), tax/ETA (5), payroll/portal features (6). Phase 1 provides the portal *route group and guard* only.

## File Structure

```
docker-compose.yml
docker/{php/Dockerfile, nginx/default.conf, postgres/init/01-roles.sql}
backend/ (Laravel)
  app/Support/Tenancy/{TenantContext.php, SetTenantMiddleware.php, TenantAwareJob.php}
  app/Support/Idempotency/IdempotencyMiddleware.php
  app/Modules/Platform/{Models,Http/Controllers,Policies,Services}
  app/Modules/Platform/Audit/{AuditLogger.php, VerifyAuditChainCommand.php}
  database/migrations/*  (organizations, users, rbac, rls, audit, idempotency, auth_lookup)
  tests/{Feature,Unit}/...
frontend/ (Angular)
  src/app/core/{auth,i18n,http,config}
  src/app/shared/{directives,components}
  src/app/layout/{shell,sidebar,header}
  src/app/features/{auth,admin}
  src/assets/i18n/{ar.json,en.json}
scripts/{restore-drill.sh}
.github/workflows/ci.yml
```

---

### Task 0: Prerequisites and repo hygiene

**Files:** Create `.gitignore`, `README.md`

**Acceptance Criteria:**
- `docker --version` and `docker compose version` succeed.
- `git status` works.

- [ ] **Step 1: Install Docker** (user action, Ubuntu): follow https://docs.docker.com/engine/install/ubuntu/ then `sudo usermod -aG docker $USER` and re-login. Verify: `docker run --rm hello-world`. Expected: "Hello from Docker!".
- [ ] **Step 2: Init git**: `cd "/home/omar/Desktop/Accouting App" && git init`
- [ ] **Step 3: Create `.gitignore`**

```
.env
node_modules/
vendor/
/backend/storage/*.key
/frontend/dist/
.angular/
*.log
```

- [ ] **Step 4: Checkpoint**: `git add -A && git commit -m "chore: init repo, specs and plan"`

---

### Task 1: Docker environment and Laravel scaffold

**Files:**
- Create: `docker-compose.yml`, `docker/php/Dockerfile`, `docker/nginx/default.conf`, `docker/postgres/init/01-roles.sql`, `backend/` (via composer), `.env.example`

**Interfaces:** Produces services `app` (php-fpm), `web` (nginx :8080), `db` (postgres:16), `minio`, `mailpit`, `queue`, `scheduler`.

**Acceptance Criteria:**
- `docker compose up -d` starts all services healthy.
- `curl -s localhost:8080/api/health` returns `{"status":"ok"}`.
- `psql` as `acct_app` shows `rolbypassrls = false` and the role owns no tables.

- [ ] **Step 1: Write `docker/postgres/init/01-roles.sql`**

```sql
CREATE ROLE acct_owner LOGIN PASSWORD 'owner_dev_only' CREATEDB;
CREATE ROLE acct_app   LOGIN PASSWORD 'app_dev_only' NOBYPASSRLS NOSUPERUSER;
CREATE DATABASE accounting OWNER acct_owner;
\c accounting
CREATE EXTENSION IF NOT EXISTS pgcrypto;
GRANT CONNECT ON DATABASE accounting TO acct_app;
GRANT USAGE ON SCHEMA public TO acct_app;
ALTER DEFAULT PRIVILEGES FOR ROLE acct_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO acct_app;
ALTER DEFAULT PRIVILEGES FOR ROLE acct_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO acct_app;
```

Dev passwords are placeholders for local use only; production uses a secret store.

- [ ] **Step 2: Write `docker/php/Dockerfile`**

```dockerfile
FROM php:8.3-fpm
RUN apt-get update && apt-get install -y git unzip libpq-dev libzip-dev libicu-dev libpng-dev \
    && docker-php-ext-install pdo_pgsql bcmath intl zip gd pcntl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /var/www/backend
```

- [ ] **Step 3: Write `docker/nginx/default.conf`**

```nginx
server {
  listen 80;
  root /var/www/backend/public;
  index index.php;
  client_max_body_size 25m;
  location / { try_files $uri /index.php?$query_string; }
  location ~ \.php$ {
    fastcgi_pass app:9000;
    fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
    include fastcgi_params;
  }
}
```

- [ ] **Step 4: Write `docker-compose.yml`**

```yaml
services:
  app:
    build: ./docker/php
    volumes: [ "./backend:/var/www/backend" ]
    env_file: ./backend/.env
    depends_on: [ db ]
  web:
    image: nginx:1.27
    ports: [ "8080:80" ]
    volumes:
      - ./backend:/var/www/backend
      - ./docker/nginx/default.conf:/etc/nginx/conf.d/default.conf
    depends_on: [ app ]
  queue:
    build: ./docker/php
    command: php artisan queue:work --tries=3
    volumes: [ "./backend:/var/www/backend" ]
    env_file: ./backend/.env
    depends_on: [ db ]
  scheduler:
    build: ./docker/php
    command: php artisan schedule:work
    volumes: [ "./backend:/var/www/backend" ]
    env_file: ./backend/.env
    depends_on: [ db ]
  db:
    image: postgres:16
    environment: { POSTGRES_PASSWORD: postgres_dev_only }
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/postgres/init:/docker-entrypoint-initdb.d
    ports: [ "5432:5432" ]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U postgres"], interval: 5s, retries: 10 }
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment: { MINIO_ROOT_USER: minio_dev, MINIO_ROOT_PASSWORD: minio_dev_only }
    ports: [ "9000:9000", "9001:9001" ]
    volumes: [ "miniodata:/data" ]
  mailpit:
    image: axllent/mailpit
    ports: [ "8025:8025", "1025:1025" ]
volumes: { pgdata: {}, miniodata: {} }
```

- [ ] **Step 5: Create Laravel**: `docker compose build app && docker compose run --rm app composer create-project laravel/laravel . "^11.0"` (run with `-w /var/www` into `backend`, or create in a temp dir and move into `backend/`).
- [ ] **Step 6: Configure `.env.example` (and copy to `backend/.env`)**

```
APP_TIMEZONE=Africa/Cairo
DB_CONNECTION=pgsql
DB_HOST=db
DB_DATABASE=accounting
DB_USERNAME=acct_app
DB_PASSWORD=app_dev_only
DB_OWNER_USERNAME=acct_owner
DB_OWNER_PASSWORD=owner_dev_only
MAIL_MAILER=smtp
MAIL_HOST=mailpit
MAIL_PORT=1025
FILESYSTEM_DISK=s3
SESSION_DRIVER=database
QUEUE_CONNECTION=database
SANCTUM_STATEFUL_DOMAINS=localhost:4200
```

- [ ] **Step 7: Add an `owner` connection in `config/database.php`** copying `pgsql` with `username => env('DB_OWNER_USERNAME')`, `password => env('DB_OWNER_PASSWORD')`. Run migrations with `php artisan migrate --database=owner`.
- [ ] **Step 8: Health route** in `routes/api.php`: `Route::get('/health', fn () => ['status' => 'ok']);` (served at `/api/health`).
- [ ] **Step 9: Verify**: `docker compose up -d && curl -s localhost:8080/api/health` → `{"status":"ok"}`; `docker compose exec db psql -U postgres -c "select rolbypassrls from pg_roles where rolname='acct_app'"` → `f`.
- [ ] **Step 10: Checkpoint** commit `feat: docker env and laravel scaffold`.

---

### Task 2: Tenancy core with row-level security

**Files:**
- Create: `app/Support/Tenancy/TenantContext.php`, `SetTenantMiddleware.php`, `TenantAwareJob.php`
- Create migrations: `2026_10_12_000001_create_organizations_table.php`, `..._000002_create_users_table.php`, `..._000003_enable_rls.php`, `..._000004_auth_lookup_function.php`
- Test: `tests/Feature/Tenancy/RlsTest.php`

**Interfaces:**
- Produces: `TenantContext::run(int $orgId, Closure $fn): mixed`; `TenantContext::runForUser(User $u, Closure $fn)`; trait `TenantAwareJob` exposing `public int $organizationId`; SQL function `auth_lookup_user(email text)` returning `(id bigint, organization_id bigint, type text)`.

**Acceptance Criteria:**
- With no tenant set, `select count(*) from users` as `acct_app` returns 0 even when rows exist.
- With org A set, org B's rows are invisible and cannot be inserted.
- Tenant setting does not leak to the next request on the same connection.

- [ ] **Step 1: Write failing test `tests/Feature/Tenancy/RlsTest.php`**

```php
<?php
use App\Support\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;

function seedTwoOrgs(): array {
    $a = DB::connection('owner')->table('organizations')->insertGetId(['name' => 'DEMO Org A', 'created_at' => now(), 'updated_at' => now()]);
    $b = DB::connection('owner')->table('organizations')->insertGetId(['name' => 'DEMO Org B', 'created_at' => now(), 'updated_at' => now()]);
    foreach ([[$a, 'a@demo.test'], [$b, 'b@demo.test']] as [$org, $email]) {
        DB::connection('owner')->table('users')->insert([
            'organization_id' => $org, 'name' => 'DEMO', 'email' => $email,
            'password' => 'x', 'type' => 'staff', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }
    return [$a, $b];
}

it('returns zero rows when no tenant is set (fail closed)', function () {
    seedTwoOrgs();
    expect(DB::table('users')->count())->toBe(0);
});

it('only shows the current tenant rows', function () {
    [$a, $b] = seedTwoOrgs();
    $emails = TenantContext::run($a, fn () => DB::table('users')->pluck('email')->all());
    expect($emails)->toBe(['a@demo.test']);
});

it('rejects inserting a row for another tenant', function () {
    [$a, $b] = seedTwoOrgs();
    expect(fn () => TenantContext::run($a, fn () => DB::table('users')->insert([
        'organization_id' => $b, 'name' => 'x', 'email' => 'evil@demo.test',
        'password' => 'x', 'type' => 'staff', 'created_at' => now(), 'updated_at' => now(),
    ])))->toThrow(\Illuminate\Database\QueryException::class);
});

it('does not leak the tenant after the transaction ends', function () {
    [$a] = seedTwoOrgs();
    TenantContext::run($a, fn () => DB::table('users')->count());
    expect(DB::selectOne("select current_setting('app.org_id', true) as v")->v)->toBeIn([null, '']);
});
```

Configure Pest's `TestCase` to run `migrate:fresh --database=owner` and wrap tests so the `owner` connection is cleaned between tests (`TRUNCATE ... CASCADE` in `afterEach`).

- [ ] **Step 2: Run, expect FAIL**: `docker compose exec app ./vendor/bin/pest tests/Feature/Tenancy` → fails (tables/class missing).
- [ ] **Step 3: Migrations (run on owner connection).** `organizations(id, name, timezone default 'Africa/Cairo', locale default 'ar', status, timestamps)`. `users(id, organization_id fk, name, email, password, type check in ('staff','client'), client_id nullable (used from Phase 2), locked_until timestamptz null, failed_logins int default 0, mfa_secret text null, mfa_enabled bool default false, remember_token, timestamps)`, unique `(email)` globally (login lookup needs a unique email).
- [ ] **Step 4: RLS migration `..._000003_enable_rls.php`**

```php
public function up(): void
{
    foreach (['users'] as $t) {
        DB::statement("ALTER TABLE $t ENABLE ROW LEVEL SECURITY");
        DB::statement("ALTER TABLE $t FORCE ROW LEVEL SECURITY");
        DB::statement("CREATE POLICY tenant_isolation ON $t
            USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::bigint)
            WITH CHECK (organization_id = NULLIF(current_setting('app.org_id', true), '')::bigint)");
    }
}
```

A NULL comparison yields no rows, which is the fail-closed behaviour. Every later tenant table's migration must call a shared helper `Schema::tenantPolicy('table')`; add that macro in `AppServiceProvider` wrapping the three statements.

- [ ] **Step 5: Login lookup function.** Login must find a user before the tenant is known, but the `users` policy blocks that. Use a narrow security-definer function:

```php
DB::statement(<<<'SQL'
CREATE FUNCTION auth_lookup_user(p_email text)
RETURNS TABLE(id bigint, organization_id bigint, type text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, organization_id, type FROM users WHERE email = lower(p_email) LIMIT 1
$$
SQL);
DB::statement("REVOKE ALL ON FUNCTION auth_lookup_user(text) FROM PUBLIC");
DB::statement("GRANT EXECUTE ON FUNCTION auth_lookup_user(text) TO acct_app");
```

It returns only three non-sensitive columns. Credential checks then run inside `TenantContext::run`.

- [ ] **Step 6: `TenantContext`**

```php
<?php
namespace App\Support\Tenancy;

use Closure;
use Illuminate\Support\Facades\DB;

final class TenantContext
{
    public static function run(int $organizationId, Closure $fn): mixed
    {
        return DB::transaction(function () use ($organizationId, $fn) {
            DB::statement("SELECT set_config('app.org_id', ?, true)", [(string) $organizationId]);
            return $fn();
        });
    }
}
```

- [ ] **Step 7: `SetTenantMiddleware`**: runs after authentication; wraps `$next($request)` in `TenantContext::run($request->user()->organization_id, ...)`. For unauthenticated routes it does nothing (RLS then returns zero rows). `TenantAwareJob` trait: constructor stores `$organizationId`, and `handle()` implementers call `TenantContext::run($this->organizationId, ...)`; add a Pest arch test asserting every class in `App\Jobs` uses the trait.
- [ ] **Step 8: Run tests, expect PASS**, then run the whole suite.
- [ ] **Step 9: Add CI guard test** `tests/Feature/Tenancy/AllTablesHaveRlsTest.php`: query `pg_class`/`pg_policies` and assert every table with an `organization_id` column has `relrowsecurity` and `relforcerowsecurity` true and at least one policy.
- [ ] **Step 10: Checkpoint**.

---

### Task 3: Authentication, lockout and MFA

**Files:**
- Create: `app/Modules/Platform/Http/Controllers/AuthController.php`, `MfaController.php`, `app/Modules/Platform/Services/LoginService.php`, `routes/api.php` (groups)
- Test: `tests/Feature/Auth/LoginTest.php`, `MfaTest.php`, `LockoutTest.php`

**Interfaces:**
- Produces: `POST /api/v1/auth/login` `{email,password,otp?}` → 200 `{user:{id,name,type,permissions[]}}` or 401/422/423; `POST /api/v1/auth/logout`; `POST /api/v1/auth/mfa/setup` → `{secret, otpauth_url}`; `POST /api/v1/auth/mfa/confirm {otp}`; `GET /api/v1/auth/me`.
- `LoginService::attempt(string $email, string $password, ?string $otp): User` throws `AuthenticationException`/`LockedException`.

**Acceptance Criteria:**
- Correct credentials create a cookie session (Sanctum SPA) with CSRF protection.
- 5 consecutive failures lock the account for 15 minutes (HTTP 423) and write an audit event.
- A user with MFA enabled cannot log in without a valid TOTP code.
- Login is rate-limited (6/min per email+IP).
- Passwords: min length 12, breached-password check (`Password::min(12)->uncompromised()`) when creating or changing.

- [ ] **Step 1: Install**: `composer require laravel/sanctum pragmarx/google2fa-laravel spatie/laravel-permission dedoc/scramble` then `php artisan install:api`. Pest: `composer require pestphp/pest pestphp/pest-plugin-laravel --dev`.
- [ ] **Step 2: Write failing tests**

```php
it('logs in with valid credentials and returns the user', function () {
    $u = demoUser(password: 'CorrectHorse-123!');
    $this->getJson('/sanctum/csrf-cookie');
    $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'CorrectHorse-123!'])
        ->assertOk()->assertJsonPath('user.type', 'staff');
});

it('locks the account after five failures', function () {
    $u = demoUser(password: 'CorrectHorse-123!');
    foreach (range(1, 5) as $i) {
        $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'wrong'])->assertStatus(422);
    }
    $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'CorrectHorse-123!'])->assertStatus(423);
});

it('requires an otp when mfa is enabled', function () {
    $u = demoUser(password: 'CorrectHorse-123!', mfa: true);
    $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'CorrectHorse-123!'])
        ->assertStatus(422)->assertJsonValidationErrors('otp');
    $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'CorrectHorse-123!', 'otp' => totp($u)])
        ->assertOk();
});
```

`demoUser()` and `totp()` are helpers in `tests/Pest.php` creating an org and user via the owner connection and generating a TOTP with `Google2FA::getCurrentOtp`.

- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement `LoginService`**: call `auth_lookup_user` to get `(id, organization_id)`, then inside `TenantContext::run` load the user, check `locked_until`, verify `Hash::check`, on failure increment `failed_logins` (lock at 5, set `locked_until = now()+15min`), verify OTP with `Google2FA::verifyKey` when `mfa_enabled`, on success reset counters. Always run a dummy `Hash::check` when the email is unknown so response time doesn't reveal account existence. Return a generic 422 message for unknown email and wrong password alike.
- [ ] **Step 5: Controllers and routes.** Login route uses `throttle:6,1` keyed by email+IP (custom `RateLimiter::for('login')`). After success: `Auth::login($user)`, `$request->session()->regenerate()`. Logout invalidates the session. `mfa/setup` stores the secret encrypted using Laravel `encrypted` cast on `mfa_secret`; `confirm` sets `mfa_enabled` only after a valid OTP.
- [ ] **Step 6: Route groups** in `routes/api.php`:

```php
Route::prefix('v1')->group(function () {
    Route::prefix('auth')->group(base_path('routes/auth.php'));
    Route::middleware(['auth:sanctum', 'tenant', 'user.type:staff'])->prefix('staff')->group(base_path('routes/staff.php'));
    Route::middleware(['auth:sanctum', 'tenant', 'user.type:client'])->prefix('portal')->group(base_path('routes/portal.php'));
});
```

- [ ] **Step 7: Middleware `user.type`**: `abort_unless($request->user()->type === $type, 403)`. Test: a client session on `/api/v1/staff/ping` gets 403 and the reverse.
- [ ] **Step 8: Run tests, expect PASS.**
- [ ] **Step 9: Checkpoint.**

---

### Task 4: RBAC, assignments and policies

**Files:**
- Create: `database/seeders/RolesAndPermissionsSeeder.php`, migration `..._create_client_assignments_table.php`, `app/Modules/Platform/Policies/*`, `app/Modules/Platform/Services/AccessScope.php`
- Test: `tests/Feature/Rbac/RolePermissionTest.php`, `tests/Feature/Rbac/AccessMatrixTest.php`

**Interfaces:**
- Produces: roles `super_admin, owner, office_manager, chief_accountant, accountant, tax_specialist, auditor, hr_payroll, sales, client, read_only`; permission names `domain.action` (for example `clients.view`, `journals.post`, `payroll.view`); `AccessScope::clientIdsFor(User $u): ?array` (`null` means office-wide); table `client_assignments(id, organization_id, user_id, client_id, role_on_client, starts_on date, ends_on date null)` with RLS; Spatie teams enabled with `organization_id` as team key.

**Acceptance Criteria:**
- Permissions are checked server-side by policies/middleware (`can:` middleware), never by the UI.
- `payroll.*` permissions are held only by `owner` and `hr_payroll`.
- A generated access-matrix test covers every route in `staff.php` × every role and asserts the expected status.

- [ ] **Step 1: Enable teams**: in `config/permission.php` set `'teams' => true`, `'team_foreign_key' => 'organization_id'`. Set the team id in `SetTenantMiddleware` via `setPermissionsTeamId($user->organization_id)`.
- [ ] **Step 2: Failing test**

```php
it('gives payroll permissions only to owner and hr_payroll', function () {
    $this->seed(RolesAndPermissionsSeeder::class);
    foreach (['accountant','chief_accountant','tax_specialist','auditor','sales','read_only','office_manager'] as $role) {
        expect(roleHas($role, 'payroll.view'))->toBeFalse("$role must not view payroll");
    }
    expect(roleHas('hr_payroll', 'payroll.view'))->toBeTrue();
});
```

- [ ] **Step 3: Seeder** defines a `$matrix` array (role → permission list) as a single readable source of truth, and creates roles per organization. Initial permission domains: `clients, journals, invoices, expenses, tax, payroll, reports, documents, workflows, admin`. Mark the matrix with a comment that office managers must review it before production.
- [ ] **Step 4: `AccessScope`**: returns `null` for `super_admin, owner, office_manager` (and `chief_accountant` when config `access.chief_accountant_office_wide` is true), otherwise the client ids from current assignments (`starts_on <= today`, `ends_on` null or `>= today`). Phase 2's `ClientPolicy` and RLS use it. Add the second RLS dimension then: `set_config('app.client_ids', ...)`.
- [ ] **Step 5: Staff route stub `GET /api/v1/staff/ping`** guarded by `can:clients.view` to give the matrix test something to hit. Each later phase adds its routes to the same matrix automatically, because the test iterates `Route::getRoutes()`.
- [ ] **Step 6: Matrix test** builds one user per role, calls every `staff/*` GET route, and compares to an `expectedAccess()` map in the test file. Unmapped routes fail the test, which forces authors to declare access for any new route.
- [ ] **Step 7: Run, expect PASS. Checkpoint.**

---

### Task 5: Audit chain

**Files:**
- Create: migration `..._create_audit_events.php`, `app/Modules/Platform/Audit/AuditLogger.php`, `VerifyAuditChainCommand.php`
- Test: `tests/Feature/Audit/AuditChainTest.php`

**Interfaces:**
- Produces: `AuditLogger::log(string $action, string $entityType, string|int|null $entityId, ?array $before = null, ?array $after = null): void`; command `php artisan audit:verify {organization?}` exits non-zero on a break; SQL function `audit_verify_chain(p_org bigint) returns table(first_bad_seq bigint)`.

**Acceptance Criteria:**
- Rows get `seq`, `prev_hash`, `hash` assigned by the database, not the app.
- UPDATE or DELETE on `audit_events` fails for `acct_app` and `acct_owner` (trigger).
- Two concurrent writers in the same org get distinct, contiguous `seq` values.
- `audit:verify` detects a row modified with the trigger disabled.

- [ ] **Step 1: Failing tests**

```php
it('chains events per organization', function () {
    [$a] = seedTwoOrgs();
    TenantContext::run($a, function () {
        app(AuditLogger::class)->log('test.one', 'thing', 1);
        app(AuditLogger::class)->log('test.two', 'thing', 1);
    });
    $rows = DB::connection('owner')->table('audit_events')->orderBy('seq')->get();
    expect($rows->pluck('seq')->all())->toBe([1, 2])
        ->and($rows[1]->prev_hash)->toBe($rows[0]->hash);
});

it('rejects update and delete', function () {
    [$a] = seedTwoOrgs();
    TenantContext::run($a, fn () => app(AuditLogger::class)->log('x', 'thing', 1));
    expect(fn () => DB::connection('owner')->table('audit_events')->update(['action' => 'tamper']))
        ->toThrow(\Illuminate\Database\QueryException::class);
});

it('detects tampering', function () {
    [$a] = seedTwoOrgs();
    TenantContext::run($a, function () {
        app(AuditLogger::class)->log('a', 't', 1);
        app(AuditLogger::class)->log('b', 't', 1);
    });
    DB::connection('owner')->unprepared('ALTER TABLE audit_events DISABLE TRIGGER audit_events_immutable');
    DB::connection('owner')->table('audit_events')->where('seq', 1)->update(['action' => 'forged']);
    DB::connection('owner')->unprepared('ALTER TABLE audit_events ENABLE TRIGGER audit_events_immutable');
    $this->artisan('audit:verify', ['organization' => $a])->assertFailed();
});
```

- [ ] **Step 2: Migration SQL** (owner connection): table `audit_events(id bigserial pk, organization_id bigint not null, seq bigint not null, actor_id bigint null, action text not null, entity_type text not null, entity_id text null, before jsonb null, after jsonb null, ip inet null, occurred_at timestamptz not null default now(), prev_hash text not null default '', hash text not null default '', unique(organization_id, seq))`, `audit_chain_heads(organization_id pk, last_seq bigint default 0, last_hash text default repeat('0',64))` (no grants to `acct_app`), RLS via the helper, and:

```sql
CREATE FUNCTION audit_events_chain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h audit_chain_heads%ROWTYPE;
BEGIN
  INSERT INTO audit_chain_heads(organization_id) VALUES (NEW.organization_id) ON CONFLICT DO NOTHING;
  SELECT * INTO h FROM audit_chain_heads WHERE organization_id = NEW.organization_id FOR UPDATE;
  NEW.seq := h.last_seq + 1;
  NEW.prev_hash := h.last_hash;
  NEW.hash := encode(digest(
      h.last_hash || '|' || NEW.seq || '|' || NEW.organization_id || '|' || coalesce(NEW.actor_id::text,'') || '|' ||
      NEW.action || '|' || NEW.entity_type || '|' || coalesce(NEW.entity_id,'') || '|' ||
      coalesce(NEW.before::text,'') || '|' || coalesce(NEW.after::text,'') || '|' || NEW.occurred_at::text,
      'sha256'), 'hex');
  UPDATE audit_chain_heads SET last_seq = NEW.seq, last_hash = NEW.hash WHERE organization_id = NEW.organization_id;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_events_chain BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION audit_events_chain();

CREATE FUNCTION audit_events_block_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_events is append-only'; END $$;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_block_change();
```

`audit_verify_chain` recomputes each row's hash with the same expression in SQL, in `seq` order, and returns the first `seq` where `prev_hash` or `hash` does not match.

- [ ] **Step 3: `AuditLogger`** inserts `actor_id` (from `auth()->id()`), `ip` and JSON values; it does not supply `seq/hash`. It throws if called outside a transaction (guard with `DB::transactionLevel() > 0`) so an audit row can never exist without the change it describes.
- [ ] **Step 4: `audit:verify` command** calls `audit_verify_chain` for one or all organizations, prints the first bad seq, returns `Command::FAILURE` on any break. Schedule nightly in `routes/console.php`; add a TODO-free alert hook that logs at `critical` level (mail wiring comes with notifications in Phase 6, but a critical log line is the Phase 1 alert).
- [ ] **Step 5: Wire audit calls** into login success/failure, lockout, MFA enable, and role/permission changes (`LoginService`, `MfaController`).
- [ ] **Step 6: Concurrency test** using `pcntl_fork` or two parallel artisan processes writing 50 events each; assert `seq` is 1..100 with no duplicates.
- [ ] **Step 7: Run, expect PASS. Checkpoint.**

---

### Task 6: Idempotency middleware

**Files:**
- Create: migration `..._create_idempotency_keys.php`, `app/Support/Idempotency/IdempotencyMiddleware.php`
- Test: `tests/Feature/Idempotency/IdempotencyTest.php`

**Interfaces:**
- Produces: middleware alias `idempotent`. Requires header `Idempotency-Key` on routes using it (400 if missing). Table `idempotency_keys(organization_id, user_id, key, route, request_hash, status_code, response_body, created_at)` unique on `(organization_id, user_id, key, route)`, RLS enabled.

**Acceptance Criteria:**
- The same key and body replays the stored response with header `Idempotent-Replayed: true` and executes the handler once.
- The same key with a different body returns 422.
- Two parallel identical requests execute the handler once (second waits or replays).

- [ ] **Step 1: Failing test** registers a test route `POST /api/v1/staff/_test/charge` (only in the testing environment) that increments a counter, and asserts counter == 1 after two identical requests, 422 on a changed body, and 400 without the header.
- [ ] **Step 2: Implement.** Inside the tenant transaction: `INSERT ... ON CONFLICT DO NOTHING` claiming the key row with null response; if the insert claimed it, run the handler and store status and body; if it didn't, `SELECT ... FOR UPDATE` the row (blocks until the first request commits), compare `request_hash` (sha256 of method, path and canonical JSON body), and replay. Because the claim and the handler share the transaction, a failed handler rolls back the claim, so retries after a failure work.
- [ ] **Step 3: Run, expect PASS. Checkpoint.** Later phases attach `idempotent` to post, issue, pay, allocate and submit routes.

---

### Task 7: OpenAPI, CI and restore drill

**Files:**
- Create: `.github/workflows/ci.yml`, `scripts/restore-drill.sh`, `docs/runbooks/backup-restore.md`
- Modify: `config/scramble.php`

**Acceptance Criteria:**
- `/docs/api` serves OpenAPI generated by Scramble (staff and portal groups tagged separately; disabled in production unless configured).
- CI runs `pint --test`, `pest`, `ng test`, `ng build` on every push.
- `scripts/restore-drill.sh` backs up the dev DB, restores it to a scratch database, and checks table row counts, `audit:verify`, and that a sample of document keys exists in MinIO. Exit non-zero on any mismatch.

- [ ] **Step 1: Scramble**: restrict to `v1/*` routes in `config/scramble.php`; add middleware gate `viewApiDocs` limited to `local` and authorized staff.
- [ ] **Step 2: `ci.yml`**: services `postgres:16` with the init SQL mounted via a setup step; steps: checkout, setup-php 8.3 with `pdo_pgsql,bcmath,intl`, `composer install`, create roles, `php artisan migrate --database=owner --force`, `./vendor/bin/pest`, `./vendor/bin/pint --test`; second job: setup-node 22, `npm ci`, `npx ng test --watch=false`, `npx ng build`.
- [ ] **Step 3: `restore-drill.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d%H%M%S)
docker compose exec -T db pg_dump -U postgres -Fc accounting > "/tmp/accounting-$STAMP.dump"
docker compose exec -T db psql -U postgres -c "DROP DATABASE IF EXISTS drill; CREATE DATABASE drill OWNER acct_owner;"
cat "/tmp/accounting-$STAMP.dump" | docker compose exec -T db pg_restore -U postgres -d drill --no-owner --role=acct_owner
for t in organizations users audit_events; do
  a=$(docker compose exec -T db psql -U postgres -d accounting -Atc "select count(*) from $t")
  b=$(docker compose exec -T db psql -U postgres -d drill -Atc "select count(*) from $t")
  [ "$a" = "$b" ] || { echo "MISMATCH $t: $a vs $b"; exit 1; }
done
docker compose exec -T app php artisan audit:verify
echo "restore drill OK ($STAMP)"
```

(Extended with the MinIO sample check once Phase 2 stores documents.)

- [ ] **Step 4: Write `docs/runbooks/backup-restore.md`**: states the proposed RPO ≤ 15 min and RTO ≤ 4 h as **unconfirmed targets**, describes WAL archiving/pgBackRest for production, off-site encrypted storage, key escrow, and how to run the drill.
- [ ] **Step 5: Run the drill locally; expect "restore drill OK". Checkpoint.**

---

### Task 8: Arabic PDF renderer spike

**Files:**
- Create: `backend/app/Modules/Platform/Pdf/Spike/*`, `docs/decisions/ADR-0001-arabic-pdf-renderer.md`

**Acceptance Criteria:**
- The same Arabic RTL sample (mixed Arabic text, Latin text, Arabic-Indic and Western digits, an EGP amount, a table) is rendered with mPDF and with headless Chromium (Browsershot).
- Both outputs are visually reviewed by a native Arabic reader (the user) for letter joining, digit order and table direction; the result is recorded in the ADR.
- ADR picks one renderer. Default to Chromium if mPDF has any defect.

- [ ] **Step 1: Install** `mpdf/mpdf` and `spatie/browsershot` (add chromium + a font with Arabic coverage, for example Noto Naskh Arabic, to the PHP image).
- [ ] **Step 2: Write `PdfSample` Blade view** (`dir="rtl" lang="ar"`) and two artisan commands `pdf:spike-mpdf` and `pdf:spike-chromium` that write to `storage/app/spike/`.
- [ ] **Step 3: Run both; open and compare the PDFs with the user.**
- [ ] **Step 4: Write the ADR** (Context/Decision/Rationale/Consequences) and a `PdfRenderer` interface with the chosen implementation, used by later phases.
- [ ] **Step 5: Checkpoint.**

---

### Task 9: Angular scaffold, i18n and RTL

**Files:**
- Create: `frontend/` via `ng new`, `src/app/core/i18n/{language.service.ts,language.service.spec.ts}`, `src/assets/i18n/{ar,en}.json`
- Modify: `angular.json`, `src/index.html`, `src/styles.scss`

**Interfaces:**
- Produces: `LanguageService.current(): 'ar' | 'en'`, `use(lang)`, `dir(): 'rtl' | 'ltr'`; on change it sets `<html lang dir>` and swaps the Bootstrap stylesheet (`bootstrap.min.css` vs `bootstrap.rtl.min.css`).

**Acceptance Criteria:**
- Default language is Arabic (RTL); the choice persists in `localStorage` (guarded by try/catch) and falls back gracefully when storage is unavailable.
- Switching to English sets `dir="ltr"` and loads the LTR stylesheet with no page reload.
- Dates and numbers format through Angular's locale (`ar-EG`, `en-GB`), with Gregorian dates by default.

- [ ] **Step 1: Scaffold**: `npx @angular/cli@latest new frontend --routing --style=scss --skip-git`; `npm i bootstrap @ngx-translate/core @ngx-translate/http-loader`; add a font with Arabic support (for example Noto Naskh Arabic / IBM Plex Sans Arabic) self-hosted in `src/assets/fonts`.
- [ ] **Step 2: Failing test `language.service.spec.ts`**

```ts
describe('LanguageService', () => {
  it('defaults to Arabic RTL', () => {
    const svc = TestBed.inject(LanguageService);
    expect(svc.current()).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });
  it('switches to English LTR', () => {
    const svc = TestBed.inject(LanguageService);
    svc.use('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
  });
  it('works when localStorage throws', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    expect(() => TestBed.inject(LanguageService)).not.toThrow();
  });
});
```

- [ ] **Step 3: Implement `LanguageService`** using a `signal<'ar'|'en'>`, `effect` to set `lang`/`dir` on `document.documentElement` and to toggle a `<link id="bootstrap-css">` href between the two built files (copy `bootstrap.min.css` and `bootstrap.rtl.min.css` from `node_modules/bootstrap/dist/css` via `angular.json` assets). Register ngx-translate with the HTTP loader and the two JSON files containing the Phase 1 strings (login, nav, errors, validation).
- [ ] **Step 4: Use logical CSS properties** (`margin-inline-start`, `padding-inline`, Bootstrap `ms-*`/`me-*` utilities) everywhere; add a stylelint rule banning physical `left/right` in `src/app` styles.
- [ ] **Step 5: Run `ng test`, expect PASS. Checkpoint.**

---

### Task 10: Angular core: auth, interceptors, guards, shell

**Files:**
- Create: `core/auth/{auth.service.ts,auth.guard.ts,permission.guard.ts}`, `core/http/{xsrf-credentials.interceptor.ts,idempotency.interceptor.ts,error.interceptor.ts}`, `shared/directives/has-permission.directive.ts`, `layout/shell/*`, `features/auth/{login,mfa-setup}/*`, `app.routes.ts`
- Test: `*.spec.ts` beside each, `e2e/rtl.spec.ts` (Playwright)

**Interfaces:**
- Consumes: Task 3 endpoints.
- Produces: `AuthService.user(): Signal<AuthUser|null>`, `login(email, password, otp?)`, `logout()`, `can(permission: string): boolean`; `*appHasPermission="'journals.post'"` directive; `HttpContext` token `IDEMPOTENT` marking requests that need a generated `Idempotency-Key`.

**Acceptance Criteria:**
- All API calls use `withCredentials` and send the CSRF token (`X-XSRF-TOKEN`) correctly for Sanctum SPA mode.
- Unauthenticated users are redirected to `/login`; `portal` users cannot enter `/app` routes and vice versa (client-side guard for UX only; the server enforces).
- 401 clears the session and redirects to login; 403 shows a clear message; 423 shows the lockout message; 422 maps field errors onto reactive forms.
- The shell has sidebar, header with language switch and user menu, and a dashboard placeholder that states plainly "Dashboard widgets arrive in later phases" (an honest empty state, not a fake dashboard).
- Playwright test: login, switch language, assert `dir` flips and sidebar sits on the right in Arabic and the left in English.

- [ ] **Step 1: Failing test for `has-permission.directive.spec.ts`**: renders the host content only when `AuthService.can()` is true; hides otherwise.
- [ ] **Step 2: Failing test for the idempotency interceptor**: a POST marked with `IDEMPOTENT` gets an `Idempotency-Key` header (UUID); the key is reused if the same logical action is retried via `retry()` and differs for a new action.
- [ ] **Step 3: Implement interceptors.** `xsrf-credentials.interceptor.ts` sets `withCredentials: true` and relies on Angular's built-in XSRF support by configuring `provideHttpClient(withXsrfConfiguration({cookieName:'XSRF-TOKEN', headerName:'X-XSRF-TOKEN'}))`. `error.interceptor.ts` centralizes 401/403/423/422/5xx handling and shows toasts via a `NotificationService`.
- [ ] **Step 4: `AuthService`** calls `GET /sanctum/csrf-cookie` before `login`, stores the user in a signal, never stores tokens in `localStorage` (cookie session only), and loads `/auth/me` on bootstrap via `APP_INITIALIZER`.
- [ ] **Step 5: Routes**: lazy `app` root (`staff` guard) and lazy `portal` root (`client` guard); `/login`, `/mfa-setup`. Shell layout with sidebar items driven by a static nav config filtered with `AuthService.can()`.
- [ ] **Step 6: Forms**: reactive forms with shared validation message component that reads translation keys; keyboard focus order and `aria-*` labels on the login form; contrast checked against WCAG AA.
- [ ] **Step 7: Playwright RTL test.** Run against `docker compose up` stack with seeded DEMO users: log in, take screenshots in both languages, and assert layout direction.
- [ ] **Step 8: Run `ng test` and `npx playwright test`, expect PASS. Checkpoint.**

---

### Task 11: Demo seed data and documentation

**Files:**
- Create: `database/seeders/DemoSeeder.php`, `docs/setup.md`, `docs/admin-guide.md` (stub sections that state what exists in Phase 1, no promises), `docs/security.md`

**Acceptance Criteria:**
- `php artisan db:seed --class=DemoSeeder` creates 2 DEMO organizations, one user per role in each, with obviously fake names prefixed `DEMO`, and password printed once to the console (dev only, refuses to run when `APP_ENV=production`).
- `docs/setup.md` lets a new developer reach a working login using only Docker.

- [ ] **Step 1: Failing test**: seeder aborts in production env; creates users for every role; two orgs do not see each other's users through the app role.
- [ ] **Step 2: Implement seeder via owner connection.**
- [ ] **Step 3: Write docs.** `docs/security.md` lists implemented controls and the open items from the spec's Stress Test Results.
- [ ] **Step 4: Full pass**: `docker compose down -v && docker compose up -d --build`, migrate, seed, `pest`, `ng test`, Playwright, restore drill. All green.
- [ ] **Step 5: Checkpoint.**

---

## Self-Review

**Spec coverage (Phase 1 scope plus stress-test items that land in Phase 1):**

| Requirement | Task |
|---|---|
| Docker env, Laravel and Angular scaffolds | 1, 9 |
| Multi-tenant isolation, RLS mechanics (branch 1) | 2 |
| Authentication, lockout, rate limiting, MFA, password policy | 3 |
| Staff vs client route groups (branch 9) | 3, 10 |
| RBAC, payroll as separate domain, client assignments (branch 5) | 4 |
| Audit hash chain, tamper evidence, verification (branch 2) | 5 |
| Idempotency (branch 11) | 6 |
| OpenAPI, CI, restore drill from Phase 1, backup runbook (branch 8) | 7 |
| Arabic PDF spike and ADR (branch 10) | 8 |
| Ar/En, RTL/LTR, Gregorian/locale formats | 9, 10 |
| Time zone default Africa/Cairo (branch 12) | 1 (env), 2 (org default) |
| Email delivery (Mailpit) | 1 (compose and env); password-reset mail is Phase 1 follow-up below |
| DEMO seed data, docs | 11 |

**Deferred with explicit owner (not silent cuts):** number sequences and fiscal/ledger tables to Phase 3; key rotation implementation for field encryption to Phase 2 (first encrypted business field is client tax IDs; Phase 1 only uses Laravel's `encrypted` cast on the MFA secret, so a keyed-rotation scheme with key IDs must be designed before Phase 2 stores client data); password-reset and invitation emails to be added as Task 12 when the user confirms the invitation flow for clients (Phase 2 onboarding); object-lock anchoring of audit digests to Phase 7 production deployment (needs cloud storage choice).

**Placeholder scan:** none intentionally left; dev passwords in Task 1 are explicitly local-only.

**Type consistency:** `TenantContext::run`, `AuditLogger::log`, `AccessScope::clientIdsFor`, `LanguageService.use/current/dir`, and `AuthService.can` are defined once and referenced consistently.

**Execution caveat:** nothing here can run until Docker is installed (Task 0). Estimated effort is substantial; the Playwright and concurrency tests are the likeliest to need iteration.
