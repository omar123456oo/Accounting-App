import { Component, effect, input, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Shows the first error of a control. Client-side validators map to `validation.*` translation keys;
 * a `server` error carries the already-localised message returned by the API (HTTP 422).
 */
@Component({
  selector: 'app-field-error',
  imports: [TranslatePipe],
  template: `
    @if (message(); as m) {
      <div class="invalid-feedback d-block" role="alert">
        @if (m.key) {
          {{ m.key | translate: m.params }}
        } @else {
          {{ m.text }}
        }
      </div>
    }
  `,
})
export class FieldError {
  readonly control = input.required<AbstractControl>();
  /** Bumped on every control event (value, status, touched) so the OnPush view re-renders. */
  private readonly tick = signal(0);

  constructor() {
    effect((onCleanup) => {
      const sub = this.control().events.subscribe(() => this.tick.update((n) => n + 1));
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected message() {
    this.tick();
    return this.describe(this.control());
  }

  private describe(control: AbstractControl): { key?: string; text?: string; params?: object } | null {
    const errors = control.errors;
    if (!errors || !(control.touched || control.dirty)) {
      return null;
    }
    if (typeof errors['server'] === 'string') {
      return { text: errors['server'] };
    }
    if (errors['required']) return { key: 'validation.required' };
    if (errors['email']) return { key: 'validation.email' };
    if (errors['minlength']) return { key: 'validation.minlength', params: { min: errors['minlength'].requiredLength } };
    return null;
  }
}
