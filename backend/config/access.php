<?php

return [
    // When true, chief accountants see every client; when false, only the clients they are assigned to. Ask the office.
    'chief_accountant_office_wide' => (bool) env('ACCESS_CHIEF_ACCOUNTANT_OFFICE_WIDE', true),
];
