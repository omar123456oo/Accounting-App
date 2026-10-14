<?php

namespace App\Providers;

use App\Modules\Platform\Audit\AuditBurstCommand;
use App\Modules\Platform\Audit\VerifyAuditChainCommand;
use App\Modules\Platform\Pdf\ChromiumPdfRenderer;
use App\Modules\Platform\Pdf\PdfRenderer;
use App\Modules\Platform\Services\TenantUserProvider;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Schema\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // The migration/seed connection: same database, privileged role. Defined here so no skeleton file needs patching.
        $this->app['config']->set('database.connections.owner', array_merge(
            $this->app['config']->get('database.connections.pgsql'),
            [
                'username' => env('DB_OWNER_USERNAME', 'acct_owner'),
                'password' => env('DB_OWNER_PASSWORD', 'owner_dev_only'),
            ],
        ));

        // Users are read by the session guard before the tenant is known, so the provider resolves the tenant first.
        $this->app['config']->set('auth.providers.users.driver', 'tenant-eloquent');
        $this->app['config']->set('auth.providers.users.model', \App\Modules\Platform\Models\User::class);

        $this->app->bind(PdfRenderer::class, ChromiumPdfRenderer::class);

        if ($this->app->runningInConsole()) {
            $this->commands([VerifyAuditChainCommand::class, \App\Modules\Platform\Pdf\Spike\PdfSpikeCommand::class]);
            if ($this->app->environment(['testing', 'local'])) {
                $this->commands([AuditBurstCommand::class]);
            }
        }
    }

    public function boot(): void
    {
        Auth::provider('tenant-eloquent', fn ($app, array $config) => new TenantUserProvider($app['hash'], $config['model']));

        // Super admin passes every policy and permission check.
        Gate::before(fn ($user) => $user->hasRole('super_admin') ? true : null);

        // OpenAPI via Scramble: only the v1 API, and the docs page is local-only unless API_DOCS_ENABLED=true is set explicitly.
        \Dedoc\Scramble\Scramble::configure()->routes(fn (\Illuminate\Routing\Route $route) => str_starts_with($route->uri, 'api/v1/'));
        Gate::define('viewApiDocs', fn ($user = null) => app()->environment('local') || filter_var(env('API_DOCS_ENABLED', false), FILTER_VALIDATE_BOOL));

        RateLimiter::for('login', fn (Request $r) => Limit::perMinute(6)->by(strtolower((string) $r->input('email')).'|'.$r->ip()));

        RateLimiter::for('register', fn (Request $r) => Limit::perHour(5)->by($r->ip()));
        RateLimiter::for('verification', fn (Request $r) => Limit::perMinute(3)->by(strtolower((string) $r->input('email')).'|'.$r->ip()));

        // Every tenant table's migration calls this. Fail-closed: with no app.org_id set, the comparison is NULL and no row matches.
        Builder::macro('tenantPolicy', function (string $table) {
            $using = "organization_id = NULLIF(current_setting('app.org_id', true), '')::bigint";
            DB::statement("ALTER TABLE $table ENABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE $table FORCE ROW LEVEL SECURITY");
            DB::statement("CREATE POLICY tenant_isolation ON $table USING ($using) WITH CHECK ($using)");
        });
        Builder::macro('dropTenantPolicy', function (string $table) {
            DB::statement("DROP POLICY IF EXISTS tenant_isolation ON $table");
            DB::statement("ALTER TABLE $table NO FORCE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE $table DISABLE ROW LEVEL SECURITY");
        });
    }
}
