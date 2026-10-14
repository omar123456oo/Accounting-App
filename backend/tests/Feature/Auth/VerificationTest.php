<?php

use App\Modules\Platform\Mail\VerifyEmailMail;
use App\Modules\Platform\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;

beforeEach(function () {
    Mail::fake();
    Http::fake(['api.pwnedpasswords.com/*' => Http::response('', 200)]);
});

/** Registers an office and returns the verification link that was e-mailed. */
function registerAndGetLink(): string
{
    test()->postJson('/api/v1/auth/register', [
        'officeName' => 'DEMO Office', 'name' => 'DEMO Owner', 'email' => 'verify@new-office.test',
        'password' => 'Correct-Horse-Battery-42', 'passwordConfirmation' => 'Correct-Horse-Battery-42',
    ])->assertCreated();
    $url = null;
    Mail::assertSent(VerifyEmailMail::class, function ($m) use (&$url) {
        $url = $m->url;

        return true;
    });

    return $url;
}

it('blocks sign-in until the address is confirmed, then lets the owner in', function () {
    $link = registerAndGetLink();
    $login = ['email' => 'verify@new-office.test', 'password' => 'Correct-Horse-Battery-42'];

    $this->postJson('/api/v1/auth/login', $login)->assertStatus(422)->assertJsonValidationErrors('email');
    // The wrong password still gets the generic answer, so this message never confirms an account exists.
    $wrong = $this->postJson('/api/v1/auth/login', ['email' => 'verify@new-office.test', 'password' => 'wrong'])->assertStatus(422);
    expect($wrong->json('errors.email.0'))->toBe('These credentials do not match our records.');

    $this->get($link)->assertRedirect(config('accounting.frontend_url').'/login?verified=1');
    $ok = $this->postJson('/api/v1/auth/login', $login)->assertOk()->assertJsonPath('user.type', 'staff');
    expect($ok->json('user.permissions'))->toContain('clients.view');
});

it('records the verification once and tolerates a second click', function () {
    $link = registerAndGetLink();
    $this->get($link)->assertRedirect();
    $this->get($link)->assertRedirect();
    expect(DB::connection('owner')->table('audit_events')->where('action', 'auth.email_verified')->count())->toBe(1);
});

it('refuses an unsigned, tampered or expired link', function () {
    registerAndGetLink();
    $id = DB::connection('owner')->table('users')->value('id');
    $this->get("/api/v1/auth/verify/$id/".sha1('verify@new-office.test'))->assertForbidden(); // unsigned

    $wrongHash = URL::temporarySignedRoute('verification.verify', now()->addHour(), ['id' => $id, 'hash' => sha1('someone@else.test')]);
    $this->get($wrongHash)->assertForbidden();
    expect(DB::connection('owner')->table('users')->value('email_verified_at'))->toBeNull();

    $expired = URL::temporarySignedRoute('verification.verify', now()->subMinute(), ['id' => $id, 'hash' => sha1('verify@new-office.test')]);
    $this->get($expired)->assertForbidden();

    $unknown = URL::temporarySignedRoute('verification.verify', now()->addHour(), ['id' => 999999, 'hash' => 'x']);
    $this->get($unknown)->assertForbidden();
});

it('stops an old link from working after the address changed', function () {
    $link = registerAndGetLink();
    DB::connection('owner')->table('users')->update(['email' => 'changed@new-office.test']);
    $this->get($link)->assertForbidden();
});

it('re-sends a link only to an unverified account, and always answers the same', function () {
    registerAndGetLink();
    Mail::fake();
    $this->postJson('/api/v1/auth/verification/resend', ['email' => 'nobody@new-office.test'])->assertStatus(202);
    Mail::assertNothingSent();

    $this->postJson('/api/v1/auth/verification/resend', ['email' => 'VERIFY@new-office.test'])->assertStatus(202);
    Mail::assertSent(VerifyEmailMail::class, 1);

    Mail::fake();
    $verified = demoUser();
    $this->postJson('/api/v1/auth/verification/resend', ['email' => $verified->email])->assertStatus(202);
    Mail::assertNothingSent();
});

it('rate limits resend requests', function () {
    foreach (range(1, 3) as $i) {
        $this->postJson('/api/v1/auth/verification/resend', ['email' => 'a@new-office.test'])->assertStatus(202);
    }
    $this->postJson('/api/v1/auth/verification/resend', ['email' => 'a@new-office.test'])->assertStatus(429);
});

it('does not fail the registration when the mail server is down', function () {
    Mail::shouldReceive('to')->andThrow(new RuntimeException('smtp down'));
    $this->postJson('/api/v1/auth/register', [
        'officeName' => 'DEMO Office', 'name' => 'DEMO Owner', 'email' => 'down@new-office.test',
        'password' => 'Correct-Horse-Battery-42', 'passwordConfirmation' => 'Correct-Horse-Battery-42',
    ])->assertCreated();
    expect(User::on('owner')->where('email', 'down@new-office.test')->exists())->toBeTrue();
});
