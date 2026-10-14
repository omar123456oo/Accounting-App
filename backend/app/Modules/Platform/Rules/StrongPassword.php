<?php

namespace App\Modules\Platform\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * Wraps Laravel's Password rule so the messages are ours (Arabic and English) instead of framework language files that a
 * Laravel 11 skeleton does not ship. The breach check asks the Have I Been Pwned range API; only a 5-character hash prefix leaves the server.
 */
class StrongPassword implements ValidationRule
{
    public const MIN_LENGTH = 12;

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || mb_strlen($value) < self::MIN_LENGTH) {
            $fail(__('Use at least 12 characters.'));

            return;
        }
        if (Validator::make([$attribute => $value], [$attribute => [Password::min(self::MIN_LENGTH)->uncompromised()]])->fails()) {
            $fail(__('This password appears in known data breaches. Choose another.'));
        }
    }
}
