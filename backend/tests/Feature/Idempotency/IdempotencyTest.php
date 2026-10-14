<?php

use Illuminate\Support\Facades\Cache;

beforeEach(function () {
    Cache::forget('charge_count');
    $this->actingAs(demoUser(role: 'accountant'), 'web');
});

it('runs the handler once and replays the stored response', function () {
    $first = $this->withHeaders(['Idempotency-Key' => 'k1'])->postJson('/api/v1/staff/_test/charge', ['amount' => 5])->assertCreated();
    $second = $this->withHeaders(['Idempotency-Key' => 'k1'])->postJson('/api/v1/staff/_test/charge', ['amount' => 5])->assertCreated();

    expect(Cache::get('charge_count'))->toBe(1)
        ->and($second->headers->get('Idempotent-Replayed'))->toBe('true')
        ->and($second->json())->toBe($first->json());
});

it('ignores key order inside the body', function () {
    $this->withHeaders(['Idempotency-Key' => 'k2'])->postJson('/api/v1/staff/_test/charge', ['a' => 1, 'b' => 2])->assertCreated();
    $this->withHeaders(['Idempotency-Key' => 'k2'])->postJson('/api/v1/staff/_test/charge', ['b' => 2, 'a' => 1])->assertCreated();
    expect(Cache::get('charge_count'))->toBe(1);
});

it('rejects the same key with a different body', function () {
    $this->withHeaders(['Idempotency-Key' => 'k3'])->postJson('/api/v1/staff/_test/charge', ['amount' => 5])->assertCreated();
    $this->withHeaders(['Idempotency-Key' => 'k3'])->postJson('/api/v1/staff/_test/charge', ['amount' => 6])->assertStatus(422);
    expect(Cache::get('charge_count'))->toBe(1);
});

it('requires the header', function () {
    $this->postJson('/api/v1/staff/_test/charge', ['amount' => 5])->assertStatus(400);
    expect(Cache::get('charge_count'))->toBeNull();
});

it('treats the same key on a different user as a new request', function () {
    $this->withHeaders(['Idempotency-Key' => 'k4'])->postJson('/api/v1/staff/_test/charge', [])->assertCreated();
    $this->actingAs(demoUser(role: 'accountant'), 'web')->withHeaders(['Idempotency-Key' => 'k4'])->postJson('/api/v1/staff/_test/charge', [])->assertCreated();
    expect(Cache::get('charge_count'))->toBe(2);
});
