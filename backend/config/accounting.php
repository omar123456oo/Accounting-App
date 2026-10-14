<?php

return [
    // Where the Angular app lives; e-mail links send people back here after the API has done its work.
    'frontend_url' => rtrim(env('FRONTEND_URL', 'http://localhost:4200'), '/'),

    // Turn self-service office registration off (set REGISTRATION_OPEN=false) once the office has its accounts.
    'registration_open' => filter_var(env('REGISTRATION_OPEN', true), FILTER_VALIDATE_BOOL),

    'verification_link_hours' => 24,
];
