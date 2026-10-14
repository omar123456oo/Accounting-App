<?php

use Illuminate\Support\Facades\DB;

it('requires an otp when mfa is enabled', function () {
    $u = demoUser(password: 'CorrectHorse-123!', mfa: true);
    $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'CorrectHorse-123!'])
        ->assertStatus(422)->assertJsonValidationErrors('otp');
    $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'CorrectHorse-123!', 'otp' => totp($u)])
        ->assertOk();
});

it('rejects a wrong otp and counts it as a failure', function () {
    $u = demoUser(password: 'CorrectHorse-123!', mfa: true);
    $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'CorrectHorse-123!', 'otp' => '000000'])
        ->assertStatus(422)->assertJsonValidationErrors('otp');
    expect(DB::connection('owner')->table('users')->where('id', $u->id)->value('failed_logins'))->toBe(1);
});

it('enables mfa only after a valid code', function () {
    $u = demoUser(password: 'CorrectHorse-123!');
    $this->actingAs($u, 'web');

    $setup = $this->postJson('/api/v1/auth/mfa/setup')->assertOk()->assertJsonStructure(['secret', 'otpauth_url']);
    expect(DB::connection('owner')->table('users')->where('id', $u->id)->value('mfa_enabled'))->toBeFalse();

    $this->postJson('/api/v1/auth/mfa/confirm', ['otp' => '000000'])->assertStatus(422);
    $this->postJson('/api/v1/auth/mfa/confirm', ['otp' => (new PragmaRX\Google2FA\Google2FA)->getCurrentOtp($setup->json('secret'))])->assertOk();
    expect(DB::connection('owner')->table('users')->where('id', $u->id)->value('mfa_enabled'))->toBeTrue();
    expect(DB::connection('owner')->table('audit_events')->where('action', 'auth.mfa_enabled')->count())->toBe(1);
});
