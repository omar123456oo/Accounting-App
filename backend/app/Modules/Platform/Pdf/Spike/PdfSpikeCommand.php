<?php

namespace App\Modules\Platform\Pdf\Spike;

use App\Modules\Platform\Pdf\ChromiumPdfRenderer;
use App\Modules\Platform\Pdf\MpdfPdfRenderer;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/** Renders the same Arabic sample with both engines so a native reader can compare them (ADR-0001). */
class PdfSpikeCommand extends Command
{
    protected $signature = 'pdf:spike {engine : mpdf|chromium|both}';

    protected $description = 'Render the Arabic RTL sample PDF with mPDF and/or headless Chromium into storage/app/spike';

    public function handle(): int
    {
        $html = view('pdf.sample')->render();
        $engines = $this->argument('engine') === 'both' ? ['mpdf', 'chromium'] : [$this->argument('engine')];

        foreach ($engines as $engine) {
            $renderer = match ($engine) {
                'mpdf' => new MpdfPdfRenderer,
                'chromium' => new ChromiumPdfRenderer,
                default => null,
            };
            if (! $renderer) {
                $this->error("Unknown engine: $engine");

                return self::FAILURE;
            }
            Storage::disk('local')->put("spike/sample-$engine.pdf", $renderer->render($html));
            $this->info("Wrote storage/app/spike/sample-$engine.pdf");
        }

        return self::SUCCESS;
    }
}
