import { Component, ElementRef, NgZone, OnDestroy, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SmartDocsApi } from './smart-docs-api.service';

/** A spot on a page, as fractions of the page (0..1) from its top-left corner. */
export interface Highlight { page: number; bbox?: { x: number; y: number; width: number; height: number } }

interface PageBox { n: number; width: number; height: number; rendered: boolean }
const ASSETS = 'assets/pdfjs/';
const MIN = 0.5; const MAX = 3;

/**
 * An in-page PDF viewer: every page in one scrolling column, rendered as it comes into view, with zoom, page jump and an optional highlight.
 * The bytes come through the authenticated API as a Blob; there is no public URL.
 */
@Component({
  selector: 'app-pdf-preview',
  imports: [TranslatePipe],
  template: `
    <div class="viewer border rounded d-flex flex-column" [style.height]="height()">
      <div class="toolbar d-flex flex-wrap align-items-center gap-2 p-2 border-bottom bg-body-tertiary">
        <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="current() <= 1" (click)="go(current() - 1)" [attr.aria-label]="'smartDocs.preview.prev' | translate"><i class="fa-solid fa-chevron-up" aria-hidden="true"></i></button>
        <label class="visually-hidden" for="pv-page">{{ 'smartDocs.preview.page' | translate }}</label>
        <input id="pv-page" type="number" min="1" [max]="pages().length || 1" class="form-control form-control-sm page-input" dir="ltr" [value]="current()" (change)="go(+$any($event.target).value)" />
        <span class="small text-body-secondary" dir="ltr">/ {{ pages().length }}</span>
        <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="current() >= pages().length" (click)="go(current() + 1)" [attr.aria-label]="'smartDocs.preview.next' | translate"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
        <span class="vr"></span>
        <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="zoom() <= min" (click)="zoomBy(-0.25)" [attr.aria-label]="'smartDocs.preview.zoomOut' | translate"><i class="fa-solid fa-magnifying-glass-minus" aria-hidden="true"></i></button>
        <span class="small" dir="ltr" aria-live="polite">{{ zoomLabel() }}</span>
        <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="zoom() >= max" (click)="zoomBy(0.25)" [attr.aria-label]="'smartDocs.preview.zoomIn' | translate"><i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i></button>
        <button type="button" class="btn btn-outline-secondary btn-sm" (click)="fit()">{{ 'smartDocs.preview.fit' | translate }}</button>
      </div>
      <div #scroller class="scroller flex-grow-1 p-3" tabindex="0" role="document" [attr.aria-label]="'smartDocs.preview.title' | translate" (scroll)="onScroll()">
        @if (failed()) {
          <div class="alert alert-warning m-0" role="alert">{{ 'smartDocs.preview.failed' | translate }}</div>
        } @else if (!ready()) {
          <p role="status" class="m-0">{{ 'common.loading' | translate }}</p>
        }
        @for (p of pages(); track p.n) {
          <div class="page-wrap mx-auto mb-3 position-relative shadow-sm bg-white" [attr.data-page]="p.n" [style.width.px]="p.width * zoom()" [style.height.px]="p.height * zoom()">
            <canvas class="d-block w-100 h-100" [attr.aria-label]="('smartDocs.preview.pageN' | translate: { n: p.n })"></canvas>
            @if (mark(); as m) {
              @if (m.page === p.n && m.bbox) {
                <div class="mark position-absolute" aria-hidden="true" [style.left.%]="m.bbox.x * 100" [style.top.%]="m.bbox.y * 100" [style.width.%]="m.bbox.width * 100" [style.height.%]="m.bbox.height * 100"></div>
              }
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .scroller { overflow: auto; background: var(--bs-secondary-bg); }
    .page-input { inline-size: 4.5rem; }
    .mark { background: rgba(255, 193, 7, 0.35); outline: 2px solid #ffc107; border-radius: 2px; pointer-events: none; }
  `,
})
export class PdfPreview implements OnDestroy {
  readonly docId = input.required<string>();
  readonly version = input<number | undefined>(undefined);
  /** Jump to this page when it changes. */
  readonly page = input(1);
  /** A spot to mark, for example where a field's value was read from. */
  readonly highlight = input<Highlight | null>(null);
  readonly height = input('38rem');

  private readonly api = inject(SmartDocsApi);
  private readonly zone = inject(NgZone);
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  protected readonly min = MIN;
  protected readonly max = MAX;
  protected readonly pages = signal<PageBox[]>([]);
  protected readonly zoom = signal(1);
  protected readonly current = signal(1);
  protected readonly ready = signal(false);
  protected readonly failed = signal(false);
  protected readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);
  protected readonly mark = computed(() => this.highlight());

  // pdf.js objects are not Angular's business: keep them out of change detection.
  private pdf: import('pdfjs-dist').PDFDocumentProxy | null = null;
  private observer: IntersectionObserver | null = null;
  private tasks = new Map<number, import('pdfjs-dist').RenderTask>();
  private generation = 0;

  constructor() {
    effect((onCleanup) => {
      const id = this.docId(); const version = this.version();
      const gen = ++this.generation;
      this.ready.set(false); this.failed.set(false); this.pages.set([]);
      const sub = this.api.file(id, { version, inline: true }).subscribe({
        next: (blob) => { void this.open(blob, gen); },
        error: () => this.failed.set(true),
      });
      onCleanup(() => sub.unsubscribe());
    });
    // Jump when the requested page or highlight changes (after the pages exist).
    effect(() => {
      const wanted = this.highlight()?.page ?? this.page();
      if (this.ready() && wanted >= 1) queueMicrotask(() => this.go(wanted));
    });
  }

  private async open(blob: Blob, gen: number): Promise<void> {
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `${ASSETS}pdf.worker.min.mjs`;
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), cMapUrl: `${ASSETS}cmaps/`, cMapPacked: true, standardFontDataUrl: `${ASSETS}standard_fonts/`, isEvalSupported: false }).promise;
      if (gen !== this.generation) { void doc.destroy(); return; }
      this.pdf?.destroy().catch(() => undefined);
      this.pdf = doc;
      const boxes: PageBox[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const v = (await doc.getPage(n)).getViewport({ scale: 1 });
        boxes.push({ n, width: v.width, height: v.height, rendered: false });
      }
      if (gen !== this.generation) return;
      this.pages.set(boxes);
      this.ready.set(true);
      // Fit the first page to the available width.
      queueMicrotask(() => { this.fit(); this.watch(); });
    } catch {
      if (gen === this.generation) this.failed.set(true);
    }
  }

  /** Draws a page only when it is near the screen, and again when the zoom changes. */
  private watch(): void {
    this.observer?.disconnect();
    this.observer = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) void this.render(Number((e.target as HTMLElement).dataset['page']));
    }, { root: this.scroller().nativeElement, rootMargin: '300px 0px' });
    this.scroller().nativeElement.querySelectorAll('.page-wrap').forEach((el) => this.observer!.observe(el));
  }

  private async render(n: number): Promise<void> {
    const pdf = this.pdf; const gen = this.generation;
    const wrap = this.scroller().nativeElement.querySelector<HTMLElement>(`.page-wrap[data-page="${n}"]`);
    const canvas = wrap?.querySelector('canvas');
    if (!pdf || !canvas) return;
    this.tasks.get(n)?.cancel();
    const page = await pdf.getPage(n);
    if (gen !== this.generation) return;
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: this.zoom() * dpr });
    canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
    const task = page.render({ canvasContext: canvas.getContext('2d')!, viewport });
    this.tasks.set(n, task);
    try { await task.promise; } catch { /* cancelled by a newer render */ }
  }

  protected zoomBy(delta: number): void { this.setZoom(this.zoom() + delta); }
  protected fit(): void {
    const first = this.pages()[0]; const box = this.scroller().nativeElement;
    if (first && box.clientWidth) this.setZoom((box.clientWidth - 32) / first.width);
  }

  private setZoom(z: number): void {
    this.zoom.set(Math.min(MAX, Math.max(MIN, Math.round(z * 100) / 100)));
    // Sizes change on the next render; redraw what is on screen.
    queueMicrotask(() => this.watch());
  }

  protected go(n: number): void {
    const total = this.pages().length;
    if (!total) return;
    const page = Math.min(total, Math.max(1, Math.round(n) || 1));
    this.current.set(page);
    const el = this.scroller().nativeElement.querySelector<HTMLElement>(`.page-wrap[data-page="${page}"]`);
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  protected onScroll(): void {
    const box = this.scroller().nativeElement.getBoundingClientRect();
    let best = this.current(); let bestOverlap = 0;
    this.scroller().nativeElement.querySelectorAll<HTMLElement>('.page-wrap').forEach((el) => {
      const r = el.getBoundingClientRect();
      const overlap = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
      if (overlap > bestOverlap) { bestOverlap = overlap; best = Number(el.dataset['page']); }
    });
    if (best !== this.current()) this.current.set(best);
  }

  ngOnDestroy(): void {
    this.generation++;
    this.observer?.disconnect();
    this.tasks.forEach((t) => t.cancel());
    void this.pdf?.destroy();
  }
}
