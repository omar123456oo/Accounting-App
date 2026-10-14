<?php

use App\Modules\Platform\Mail\VerifyEmailMail;
use App\Modules\Platform\Models\User;
use App\Support\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

function registration(array $over = []): array
{
    return array_merge([
        'officeName' => 'DEMO Nile Accounting',
        'name' => 'DEMO Owner',
        'email' => 'owner@new-office.test',
        'password' => 'Correct-Horse-Battery-42',
        'passwordConfirmation' => 'Correct-Horse-Battery-42',
    ], $over);
}

beforeEach(function () {
    Mail::fake();
    // No real call to the breach API from tests: an empty range response means "not found in a breach".
    Http::fake(['api.pwnedpasswords.com/*' => Http::response('', 200)]);
});

it('creates the office, its owner and the roles, and asks for e-mail verification', function () {
    $this->postJson('/api/v1/auth/register', registration())->assertCreated()->assertExactJson(['emailVerificationRequired' => true]);

    $user = DB::connection('owner')->table('users')->where('email', 'owner@new-office.test')->first();
    expect($user->type)->toBe('staff')->and($user->email_verified_at)->toBeNull()->and($user->password)->not->toContain('Correct-Horse');
    expect(DB::connection('owner')->table('organizations')->where('id', $user->organization_id)->value('name'))->toBe('DEMO Nile Accounting');

    $roleNames = DB::connection('owner')->table('model_has_roles')->join('roles', 'roles.id', '=', 'model_has_roles.role_id')->where('model_id', $user->id)->pluck('roles.name')->all();
    expect($roleNames)->toBe(['owner']);
    expect(DB::connection('owner')->table('audit_events')->where('action', 'auth.register')->where('organization_id', $user->organization_id)->count())->toBe(1);
    Mail::assertSent(VerifyEmailMail::class, fn ($m) => $m->hasTo('owner@new-office.test'));
});

it('does not sign the new owner in', function () {
    $this->postJson('/api/v1/auth/register', registration())->assertCreated();
    $this->getJson('/api/v1/auth/me')->assertUnauthorized();
});

it('stores the organization locale from the language header', function () {
    $this->withHeaders(['Accept-Language' => 'en'])->postJson('/api/v1/auth/register', registration())->assertCreated();
    expect(DB::connection('owner')->table('organizations')->value('locale'))->toBe('en');
});

it('answers validation errors under the same field names the form uses', function () {
    $this->postJson('/api/v1/auth/register', [])->assertStatus(422)->assertJsonValidationErrors(['officeName', 'name', 'email', 'password', 'passwordConfirmation']);
    $this->postJson('/api/v1/auth/register', registration(['email' => 'not-an-email']))->assertJsonValidationErrors('email');
    $this->postJson('/api/v1/auth/register', registration(['password' => 'short', 'passwordConfirmation' => 'short']))->assertJsonValidationErrors('password');
    $this->postJson('/api/v1/auth/register', registration(['passwordConfirmation' => 'different-123456']))->assertJsonValidationErrors('passwordConfirmation');
    expect(DB::connection('owner')->table('users')->count())->toBe(0);
    Mail::assertNothingSent();
});

it('answers in Arabic when asked to', function () {
    $r = $this->withHeaders(['Accept-Language' => 'ar'])->postJson('/api/v1/auth/register', registration(['name' => '']))->assertStatus(422);
    expect($r->json('errors.name.0'))->toBe('هذا الحقل مطلوب.');
});

it('rejects a password found in a breach', function () {
    $password = 'Correct-Horse-Battery-42';
    $sha = strtoupper(sha1($password));
    Http::fake(['api.pwnedpasswords.com/*' => Http::response(substr($sha, 5).':3000', 200)]);
    $this->postJson('/api/v1/auth/register', registration())->assertStatus(422)->assertJsonValidationErrors('password');
});

it('rejects an address that is already registered, whatever its case, and creates nothing', function () {
    $existing = demoUser();
    $before = DB::connection('owner')->table('organizations')->count();
    $r = $this->postJson('/api/v1/auth/register', registration(['email' => strtoupper($existing->email)]))->assertStatus(422)->assertJsonValidationErrors('email');
    expect($r->json('errors.email.0'))->toBe('An account with this email already exists.');
    expect(DB::connection('owner')->table('organizations')->count())->toBe($before);
});

it('keeps two newly registered offices apart', function () {
    $this->postJson('/api/v1/auth/register', registration())->assertCreated();
    $this->postJson('/api/v1/auth/register', registration(['email' => 'second@new-office.test', 'officeName' => 'DEMO Second']))->assertCreated();
    $first = DB::connection('owner')->table('users')->where('email', 'owner@new-office.test')->first();
    $seen = TenantContext::run($first->organization_id, fn () => User::query()->pluck('email')->all());
    expect($seen)->toBe(['owner@new-office.test']);
});

it('can be switched off', function () {
    config(['accounting.registration_open' => false]);
    $this->postJson('/api/v1/auth/register', registration())->assertForbidden();
    expect(DB::connection('owner')->table('organizations')->count())->toBe(0);
});

it('is rate limited per address', function () {
    foreach (range(1, 5) as $i) {
        $this->postJson('/api/v1/auth/register', registration(['email' => "o$i@new-office.test"]))->assertCreated();
    }
    $this->postJson('/api/v1/auth/register', registration(['email' => 'o6@new-office.test']))->assertStatus(429);
});

it('rolls everything back if the owner cannot be created', function () {
    // A duplicate address slipping past the pre-check (a race) must not leave an empty office behind.
    $this->partialMock(\App\Modules\Platform\Audit\AuditLogger::class, fn ($m) => $m->shouldReceive('log')->andThrow(new RuntimeException('boom')));
    $this->withoutExceptionHandling();
    expect(fn () => $this->postJson('/api/v1/auth/register', registration()))->toThrow(RuntimeException::class);
    expect(DB::connection('owner')->table('organizations')->count())->toBe(0)->and(DB::connection('owner')->table('users')->count())->toBe(0);
    Mail::assertNothingSent();
});
