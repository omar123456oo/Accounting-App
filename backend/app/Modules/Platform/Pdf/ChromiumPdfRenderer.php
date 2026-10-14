<?php

namespace App\Modules\Platform\Pdf;

use Spatie\Browsershot\Browsershot;

/** Headless Chromium: full browser text shaping, so Arabic joining, bidi and table direction follow the web page exactly. */
class ChromiumPdfRenderer implements PdfRenderer
{
    public function render(string $html): string
    {
        return Browsershot::html($html)
            ->setChromePath(env('PUPPETEER_EXECUTABLE_PATH', '/usr/bin/chromium'))
            ->noSandbox() // runs as root inside the container
            ->format('A4')
            ->margins(15, 12, 15, 12)
            ->showBackground()
            ->emulateMedia('print')
            ->pdf();
    }
}
