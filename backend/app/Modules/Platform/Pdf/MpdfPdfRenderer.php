<?php

namespace App\Modules\Platform\Pdf;

use Mpdf\Mpdf;

/** mPDF with its bundled DejaVu fonts (Arabic coverage). Kept for the spike comparison in ADR-0001. */
class MpdfPdfRenderer implements PdfRenderer
{
    public function render(string $html): string
    {
        $mpdf = new Mpdf([
            'mode' => 'utf-8',
            'format' => 'A4',
            'default_font' => 'dejavusans',
            'autoScriptToLang' => true,
            'autoLangToFont' => true,
            'directionality' => 'rtl',
            'tempDir' => storage_path('app/mpdf'),
        ]);
        $mpdf->WriteHTML($html);

        return $mpdf->Output('', 'S');
    }
}
