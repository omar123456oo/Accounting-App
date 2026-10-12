import { Component, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Modal } from '../modal/modal';

let nextId = 0;

/** Asks for a comment (a reason) before an action. When `required`, an empty comment cannot be confirmed. */
@Component({
  selector: 'app-comment-dialog',
  imports: [TranslatePipe, Modal],
  template: `
    <app-modal [title]="title()" (closed)="cancelled.emit()">
      @if (message()) {
        <p>{{ message() }}</p>
      }
      <label [for]="id" class="form-label">{{ label() }}@if (required()) { * }</label>
      <textarea
        [id]="id"
        class="form-control"
        rows="3"
        [class.is-invalid]="showError()"
        [attr.aria-invalid]="showError()"
        [attr.aria-describedby]="id + '-error'"
        [value]="value()"
        (input)="value.set($any($event.target).value)"
      ></textarea>
      @if (showError()) {
        <div class="invalid-feedback d-block" role="alert" [id]="id + '-error'">{{ 'validation.required' | translate }}</div>
      }
      <div class="d-flex justify-content-end gap-2 mt-3">
        <button type="button" class="btn btn-outline-secondary" (click)="cancelled.emit()">{{ 'common.cancel' | translate }}</button>
        <button type="button" class="btn" [class]="danger() ? 'btn-danger' : 'btn-primary'" (click)="confirm()">{{ confirmLabel() }}</button>
      </div>
    </app-modal>
  `,
})
export class CommentDialog {
  readonly title = input.required<string>();
  readonly message = input('');
  readonly label = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly required = input(false);
  readonly danger = input(false);
  readonly confirmed = output<string>();
  readonly cancelled = output<void>();

  protected readonly id = `comment-dialog-${nextId++}`;
  protected readonly value = signal('');
  protected readonly attempted = signal(false);

  protected showError(): boolean {
    return this.attempted() && this.required() && this.value().trim() === '';
  }

  protected confirm(): void {
    this.attempted.set(true);
    if (this.required() && this.value().trim() === '') return;
    this.confirmed.emit(this.value().trim());
  }
}
