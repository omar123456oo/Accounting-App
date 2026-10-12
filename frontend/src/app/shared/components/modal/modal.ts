import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, OnDestroy, afterNextRender, inject, input, output, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

let nextId = 0;
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Modal shell for forms and detail views. Render it with @if only while it is open: it moves focus to the
 * first field when it appears, keeps Tab inside, closes on Esc and returns focus to the opener when removed.
 */
@Component({
  selector: 'app-modal',
  imports: [TranslatePipe],
  styleUrl: './modal.scss',
  host: { '[style.--modal-width]': 'width()' },
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <div #panel class="panel card shadow" role="dialog" aria-modal="true" [attr.aria-labelledby]="id + '-title'" (keydown)="onKeydown($event)">
      <div class="card-body">
        <div class="d-flex align-items-start justify-content-between gap-2 mb-3">
          <h2 class="h5 mb-0" [id]="id + '-title'">{{ title() }}</h2>
          <button type="button" class="btn-close" [attr.aria-label]="'common.close' | translate" (click)="closed.emit()"></button>
        </div>
        <ng-content />
      </div>
    </div>
  `,
})
export class Modal implements OnDestroy {
  readonly title = input.required<string>();
  readonly width = input('32rem');
  readonly closed = output<void>();

  protected readonly id = `modal-${nextId++}`;
  private readonly doc = inject(DOCUMENT);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly opener = this.doc.activeElement as HTMLElement | null;

  constructor() {
    afterNextRender(() => {
      const fields = this.panel().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE);
      // The close button comes first in the DOM; prefer the first real field after it.
      (fields[1] ?? fields[0])?.focus();
    });
  }

  ngOnDestroy(): void {
    this.opener?.focus?.();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closed.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(this.panel().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && this.doc.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && this.doc.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
