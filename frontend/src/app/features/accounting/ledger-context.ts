import { Injectable, computed, inject, signal } from '@angular/core';
import { LedgerEntity } from './accounting.models';
import { LedgerApiService } from './ledger-api.service';

/**
 * Which ledger entity the user is working in. Firm books and each client's books are separate ledgers, so
 * every accounting page reads the active id from here and the API scopes everything to it.
 */
@Injectable({ providedIn: 'root' })
export class LedgerContext {
  private readonly api = inject(LedgerApiService);
  private readonly list = signal<LedgerEntity[]>([]);
  private readonly activeIdState = signal<string | null>(null);
  private readonly loadedState = signal(false);
  private readonly failedState = signal(false);

  readonly entities = this.list.asReadonly();
  readonly activeId = this.activeIdState.asReadonly();
  readonly loaded = this.loadedState.asReadonly();
  readonly failed = this.failedState.asReadonly();
  readonly active = computed(() => this.list().find((e) => e.id === this.activeIdState()) ?? null);

  /** Loads the ledgers this user may see and keeps the current choice (or `preferred`) when it is still visible. */
  load(preferred?: string | null): void {
    this.failedState.set(false);
    this.api.entities().subscribe({
      next: (entities) => {
        this.list.set(entities);
        const keep = [preferred, this.activeIdState()].find((id) => id && entities.some((e) => e.id === id));
        this.activeIdState.set(keep ?? entities[0]?.id ?? null);
        this.loadedState.set(true);
      },
      error: () => {
        this.failedState.set(true);
        this.loadedState.set(true);
      },
    });
  }

  select(id: string): void {
    if (this.list().some((e) => e.id === id)) this.activeIdState.set(id);
  }
}
