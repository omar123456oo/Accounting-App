<?php

namespace App\Modules\Platform\Services;

use App\Modules\Platform\Rules\StrongPassword;

/** One place for the password rule: at least 12 characters and not found in known breaches. Use it wherever a password is set. */
final class PasswordPolicy
{
    public static function rule(): StrongPassword
    {
        return new StrongPassword;
    }
}
