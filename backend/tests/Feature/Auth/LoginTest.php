<?php

use App\Modules\Platform\Models\User;

it('logs in with valid credentials and returns the user', function () {
    $u = demoUser(password: 'CorrectHorse-123!');
    $this->getJson('/sanctum/csrf-cookie');
    $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'CorrectHorse-123!'])
        ->assertOk()->assertJsonPath('user.type', 'staff')->assertJsonStructure(['user' => ['id', 'name', 'type', 'permissions']]);
});

it('gives the same generic answer for an unknown email and a wrong password', function () {
    $u = demoUser();
    $unknown = $this->postJson('/api/v1/auth/login', ['email' => 'nobody@demo.test', 'password' => 'whatever-123456'])->assertStatus(422);
    $wrong = $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'whatever-123456'])->assertStatus(422);
    expect($unknown->json('errors.email'))->toBe($wrong->json('errors.email'));
});

it('reports the signed-in user on /me and rejects anonymous callers', function () {
    $this->getJson('/api/v1/auth/me')->assertUnauthorized();
    $u = demoUser();
    $this->actingAs($u, 'web')->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('user.id', $u->id);
});

it('keeps staff and client sessions on their own route groups', function () {
    $staff = demoUser(role: 'accountant');
    $client = demoUser(role: 'client', type: 'client');
    $this->actingAs($staff, 'web')->getJson('/api/v1/portal/ping')->assertForbidden();
    $this->actingAs($client, 'web')->getJson('/api/v1/staff/ping')->assertForbidden();
});

it('never stores the MFA secret or password in clear text', function () {
    $u = demoUser(mfa: true);
    $raw = \Illuminate\Support\Facades\DB::connection('owner')->table('users')->where('id', $u->id)->first();
    expect($raw->mfa_secret)->not->toBe($u->mfa_secret)->and($raw->password)->not->toBe('CorrectHorse-123!');
});

it('refuses short passwords under the password policy', function () {
    $v = validator(['p' => 'short'], ['p' => [\App\Modules\Platform\Services\PasswordPolicy::rule()]]);
    expect($v->fails())->toBeTrue();
});

it('refuses an unverified account even with the right password', function () {
    $u = demoUser(password: 'CorrectHorse-123!');
    \Illuminate\Support\Facades\DB::connection('owner')->table('users')->where('id', $u->id)->update(['email_verified_at' => null]);
    $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'CorrectHorse-123!'])->assertStatus(422)->assertJsonValidationErrors('email');
});

it('answers in Arabic when the app asks for Arabic', function () {
    $r = $this->withHeaders(['Accept-Language' => 'ar'])->postJson('/api/v1/auth/login', ['email' => 'nobody@demo.test', 'password' => 'whatever-123456'])->assertStatus(422);
    expect($r->json('errors.email.0'))->toBe('بيانات الدخول هذه لا تطابق سجلاتنا.');
});
