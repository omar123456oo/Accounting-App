import { CanDeactivateFn } from '@angular/router';

export interface HasUnsavedChanges {
  /** Resolves true when it is fine to leave (nothing to lose, or the user confirmed). */
  canLeave(): boolean | Promise<boolean>;
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => component.canLeave();
