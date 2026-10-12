import { Component, computed, input } from '@angular/core';

export type BadgeTone = 'success' | 'warning' | 'info' | 'secondary' | 'danger';

/** The state is always conveyed by its text; the colour only reinforces it. */
@Component({
  selector: 'app-status-badge',
  template: `<span class="badge" [class]="toneClass()">{{ label() }}</span>`,
})
export class StatusBadge {
  readonly label = input.required<string>();
  readonly tone = input<BadgeTone>('secondary');
  protected readonly toneClass = computed(() => `text-bg-${this.tone()}`);
}
