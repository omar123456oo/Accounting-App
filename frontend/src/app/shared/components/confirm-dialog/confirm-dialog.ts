import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, OnDestroy, afterNextRender, inject, input, output, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

let nextId = 0;

/**
 * Modal confirmation. Render it with @if only while it is needed: it takes focus (on Cancel, the safe
 * choice) when it appears, keeps Tab inside, closes on Esc and returns focus to the opener when removed.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [TranslatePipe],
  styleUrl: './confirm-dialog.scss',
  template: `
    <div class="backdrop" (click)="cancelled.emit()"></div>
    <div #panel class="panel card shadow" role="alertdialog" aria-modal="true" [attr.aria-labelledby]="id + '-title'" [attr.aria-describedby]="id + '-msg'" (keydown)="onKeydown($event)">
      <div class="card-body">
        <h2 class="h5" [id]="id + '-title'">{{ title() }}</h2>
        <p [id]="id + '-msg'">{{ message() }}</p>
        <div class="d-flex justify-content-end gap-2">
          <button #cancel type="button" class="btn btn-outline-secondary" (click)="cancelled.emit()">{{ 'common.cancel' | translate }}</button>
          <button type="button" class="btn" [class]="danger() ? 'btn-danger' : 'btn-primary'" (click)="confirmed.emit()">{{ confirmLabel() }}</button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmDialog implements OnDestroy {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly danger = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly id = `confirm-dialog-${nextId++}`;
  private readonly doc = inject(DOCUMENT);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly cancel = viewChild.required<ElementRef<HTMLButtonElement>>('cancel');
  private readonly opener = this.doc.activeElement as HTMLElement | null;

  constructor() {
    afterNextRender(() => this.cancel().nativeElement.focus());
  }

  ngOnDestroy(): void {
    this.opener?.focus?.();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.cancelled.emit();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const items = Array.from(this.panel().nativeElement.querySelectorAll<HTMLElement>('button:not([disabled])'));
    const first = items[0];
    const last = items[items.length - 1];
    const active = this.doc.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
