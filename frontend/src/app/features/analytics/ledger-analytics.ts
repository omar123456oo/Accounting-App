import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Observable, catchError, filter, of, switchMap, tap } from 'rxjs';
import { LedgerContext } from '../accounting/ledger-context';

/**
 * Shared by the panels that analyse one ledger. Calls `load(ledgerId)` again whenever the ledger changes in the header selector;
 * a slow answer for the previous ledger is dropped, so figures from two ledgers never mix.
 */
export function watchLedger<T>(load: (ledgerId: string) => Observable<T>, onData: (data: T | null) => void, onReset: () => void): void {
  const ctx = inject(LedgerContext);
  toObservable(ctx.activeId)
    .pipe(
      filter((id): id is string => !!id),
      tap(() => onReset()),
      switchMap((id) => load(id).pipe(catchError(() => of(null)))),
      takeUntilDestroyed(inject(DestroyRef)),
    )
    .subscribe((data) => onData(data));
}
