<?php

namespace App\Modules\Platform\Http\Controllers;

use App\Modules\Platform\Http\Requests\RegisterRequest;
use App\Modules\Platform\Services\RegistrationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

class RegisterController extends Controller
{
    /** Creates the office and its owner. It never signs the user in: they confirm their e-mail first. */
    public function register(RegisterRequest $request, RegistrationService $registration): JsonResponse
    {
        $registration->register($request->safe()->only(['officeName', 'name', 'email', 'password']), app()->getLocale());

        return response()->json(['emailVerificationRequired' => true], 201);
    }
}
