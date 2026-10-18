import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { filter, map, of, startWith, switchMap } from 'rxjs';

/** Route segment (after /app) to the key under `tips.` in the i18n files. */
const MODULES = [
  'clients', 'documents', 'smart-documents', 'tasks', 'approvals', 'tickets', 'appointments', 'timesheets', 'forecast',
  'analytics', 'hr', 'inbox', 'doctypes', 'records', 'accounting', 'statements', 'invoicing',
  'payables', 'settings',
] as const;

const STORAGE_KEY = 'module-tips-hidden';

function readHidden(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeHidden(value: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable: the tips just come back next visit */
  }
}

/** Short, dismissible tips for the module the user is in. Dismissal is remembered per module. */
@Component({
  selector: 'app-module-tips',
  imports: [TranslatePipe],
  template: `
    @if (module(); as m) {
      @if (tips().length) {
        @if (hidden().includes(m)) {
          <button type="button" class="btn btn-link btn-sm p-0 mb-2" (click)="show(m)">
            {{ 'tips.show' | translate }}
          </button>
        } @else {
          <aside class="alert alert-info d-flex gap-2 align-items-start mb-3" [attr.aria-label]="'tips.title' | translate">
            <div class="flex-grow-1">
              <strong class="d-block mb-1">{{ 'tips.title' | translate }}</strong>
              <ul class="mb-0 ps-3">
                @for (tip of tips(); track $index) {
                  <li>{{ tip }}</li>
                }
              </ul>
            </div>
            <button type="button" class="btn-close" [attr.aria-label]="'tips.hide' | translate" (click)="hide(m)"></button>
          </aside>
        }
      }
    }
  `,
})
export class ModuleTips {
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  protected readonly hidden = signal<string[]>(readHidden());

  protected readonly module = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => {
        const segment = this.router.url.split(/[?#]/)[0].split('/')[2] ?? '';
        return (MODULES as readonly string[]).includes(segment) ? segment : null;
      }),
    ),
    { initialValue: null },
  );

  private readonly lang = toSignal(
    this.translate.onLangChange.pipe(startWith(null), map(() => this.translate.currentLang)),
  );

  protected readonly tips = toSignal(
    toObservable(computed(() => [this.module(), this.lang()] as const)).pipe(
      switchMap(([m]) => (m ? this.translate.stream(`tips.${m}`) : of([]))),
      map((v) => (Array.isArray(v) ? (v as string[]) : [])),
    ),
    { initialValue: [] as string[] },
  );

  protected hide(m: string): void {
    this.hidden.update((h) => {
      const next = [...h, m];
      writeHidden(next);
      return next;
    });
  }

  protected show(m: string): void {
    this.hidden.update((h) => {
      const next = h.filter((x) => x !== m);
      writeHidden(next);
      return next;
    });
  }
}
