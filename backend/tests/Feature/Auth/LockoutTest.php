<?php

use Illuminate\Support\Facades\DB;

it('locks the account after five failures', function () {
    $u = demoUser(password: 'CorrectHorse-123!');
    foreach (range(1, 5) as $i) {
        $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'wrong'])->assertStatus(422);
    }
    $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'CorrectHorse-123!'])->assertStatus(423);
});

it('writes audit events for failures and the lockout', function () {
    $u = demoUser();
    foreach (range(1, 5) as $i) {
        $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'wrong']);
    }
    $actions = DB::connection('owner')->table('audit_events')->orderBy('seq')->pluck('action')->all();
    expect($actions)->toBe(['auth.login_failed', 'auth.login_failed', 'auth.login_failed', 'auth.login_failed', 'auth.login_failed', 'auth.lockout']);
});

it('unlocks after the lock period', function () {
    $u = demoUser(password: 'CorrectHorse-123!');
    DB::connection('owner')->table('users')->where('id', $u->id)->update(['locked_until' => now()->subMinute()]);
    $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'CorrectHorse-123!'])->assertOk();
});

it('rate-limits login attempts per email and address', function () {
    $u = demoUser();
    foreach (range(1, 6) as $i) {
        $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'x'.$i]);
    }
    $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'x7'])->assertStatus(429);
});
