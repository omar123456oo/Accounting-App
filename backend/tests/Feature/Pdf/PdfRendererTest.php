<?php

use App\Modules\Platform\Pdf\ChromiumPdfRenderer;
use App\Modules\Platform\Pdf\MpdfPdfRenderer;
use App\Modules\Platform\Pdf\PdfRenderer;

it('binds the renderer chosen in ADR-0001', function () {
    expect(app(PdfRenderer::class))->toBeInstanceOf(ChromiumPdfRenderer::class);
});

it('renders the Arabic sample to a PDF with both engines', function (string $class) {
    $pdf = (new $class)->render(view('pdf.sample')->render());
    expect(substr($pdf, 0, 5))->toBe('%PDF-');
})->with([MpdfPdfRenderer::class, ChromiumPdfRenderer::class]);
