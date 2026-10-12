import { Component, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Modal } from '../../../shared/components/modal/modal';

export interface ReverseChoice {
  reason: string;
  postingDate?: string;
  createReplacement: boolean;
}

/** Reversal needs a reason. The reversing entry is posted in an open period; a replacement draft is optional. */
@Component({
  selector: 'app-reverse-dialog',
  imports: [TranslatePipe, Modal],
  template: `
    <app-modal [title]="'accounting.journals.reverse.title' | translate" (closed)="cancelled.emit()">
      <p>{{ 'accounting.journals.reverse.message' | translate: { reference: reference() } }}</p>
      <label for="rev-reason" class="form-label">{{ 'accounting.journals.reverse.reason' | translate }} *</label>
      <textarea
        id="rev-reason"
        class="form-control"
        rows="3"
        [class.is-invalid]="showError()"
        [attr.aria-invalid]="showError()"
        [attr.aria-describedby]="showError() ? 'rev-reason-error' : null"
        [value]="reason()"
        (input)="reason.set($any($event.target).value)"
      ></textarea>
      @if (showError()) {
        <div id="rev-reason-error" class="invalid-feedback d-block" role="alert">{{ 'validation.required' | translate }}</div>
      }
      <div class="mt-3">
        <label for="rev-date" class="form-label">{{ 'accounting.journals.reverse.date' | translate }}</label>
        <input id="rev-date" type="date" class="form-control" aria-describedby="rev-date-hint" [value]="date()" (input)="date.set($any($event.target).value)" />
        <div id="rev-date-hint" class="form-text">{{ 'accounting.journals.reverse.dateHint' | translate }}</div>
      </div>
      <div class="form-check mt-3">
        <input id="rev-replacement" type="checkbox" class="form-check-input" [checked]="replacement()" (change)="replacement.set($any($event.target).checked)" />
        <label for="rev-replacement" class="form-check-label">{{ 'accounting.journals.reverse.replacement' | translate }}</label>
      </div>
      <div class="d-flex justify-content-end gap-2 mt-3">
        <button type="button" class="btn btn-outline-secondary" (click)="cancelled.emit()">{{ 'common.cancel' | translate }}</button>
        <button type="button" class="btn btn-danger" (click)="confirm()">{{ 'accounting.journals.reverse.confirm' | translate }}</button>
      </div>
    </app-modal>
  `,
})
export class ReverseDialog {
  readonly reference = input.required<string>();
  readonly confirmed = output<ReverseChoice>();
  readonly cancelled = output<void>();

  protected readonly reason = signal('');
  protected readonly date = signal('');
  protected readonly replacement = signal(false);
  protected readonly attempted = signal(false);

  protected showError(): boolean {
    return this.attempted() && this.reason().trim() === '';
  }

  protected confirm(): void {
    this.attempted.set(true);
    if (this.reason().trim() === '') return;
    this.confirmed.emit({ reason: this.reason().trim(), ...(this.date() ? { postingDate: this.date() } : {}), createReplacement: this.replacement() });
  }
}
