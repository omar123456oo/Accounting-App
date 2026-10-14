<?php

namespace App\Modules\Platform\Pdf;

/** Turns HTML into PDF bytes. Later phases (invoices, statements, payslips) depend on this interface only. See ADR-0001. */
interface PdfRenderer
{
    public function render(string $html): string;
}
