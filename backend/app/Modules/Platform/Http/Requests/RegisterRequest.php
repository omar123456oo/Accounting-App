<?php

namespace App\Modules\Platform\Http\Requests;

use App\Modules\Platform\Services\PasswordPolicy;
use Illuminate\Foundation\Http\FormRequest;

/** Field names are camelCase on purpose: they are the names the Angular form uses to show each error under its field. */
class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return config('accounting.registration_open');
    }

    protected function failedAuthorization(): void
    {
        abort(403, __('Registration is closed. Ask the office owner for an invitation.'));
    }

    public function rules(): array
    {
        return [
            'officeName' => ['required', 'string', 'max:120'],
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email:rfc', 'max:190'],
            'password' => ['required', 'string', PasswordPolicy::rule()],
            'passwordConfirmation' => ['required', 'same:password'],
        ];
    }

    public function messages(): array
    {
        return [
            'required' => __('This field is required.'),
            'string' => __('This field is required.'),
            'email' => __('Enter a valid email address.'),
            'max' => __('This value is too long.'),
            'same' => __('The passwords do not match.'),
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['email' => strtolower(trim((string) $this->input('email')))]);
    }
}
