import { Component, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, startWith, switchMap } from 'rxjs';
import { apiErrorMessage, fieldErrors } from '../../../core/http/api-errors';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { isPositive, isValidAmount, toPlain } from '../../../core/money/money';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { FieldError } from '../../../shared/components/field-error/field-error';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Account, JournalEntry, JournalInput, JournalType } from '../accounting.models';
import { AccountingFormat } from '../accounting-format';
import { JournalsApiService } from '../journals-api.service';
import { LedgerApiService } from '../ledger-api.service';
import { LedgerContext } from '../ledger-context';
import { analyzeLines } from './journal-lines';

/** Create or edit a draft journal entry with live debit/credit totals. Submitting stays disabled until the entry balances. */
@Component({
  selector: 'app-journal-form',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, FieldError, PageHeader, ConfirmDialog],
  templateUrl: './journal-form.html',
})
export class JournalForm implements HasUnsavedChanges {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(JournalsApiService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  protected readonly format = inject(AccountingFormat);
  private readonly ledgerId = inject(LedgerContext).activeId() as string;
  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  protected readonly editing = this.id !== null;
  protected readonly accounts = signal<Account[]>([]);
  protected readonly loading = signal(true);
  protected readonly notEditable = signal(false);
  protected readonly notFound = signal(false);
  protected readonly working = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly leaving = signal(false);
  private resolveLeave: ((ok: boolean) => void) | null = null;
  private done = false;

  protected readonly form = this.fb.group({
    entryType: ['standard' as JournalType],
    postingDate: ['', Validators.required],
    description: ['', Validators.required],
    lines: this.fb.array([this.newLine(), this.newLine()]),
  });
  protected readonly lines = this.form.controls.lines as FormArray;
  private readonly changes = toSignal(this.form.valueChanges.pipe(startWith(null)));
  protected readonly analysis = computed(() => {
    this.changes();
    return analyzeLines(this.lines.getRawValue());
  });
  protected readonly postable = computed(() => this.accounts().filter((a) => a.isPostable && a.isActive));
  // Read the signals first: a short-circuit on the (non-signal) form state would leave the computed without dependencies.
  protected readonly canSave = computed(() => {
    const a = this.analysis();
    return !this.working() && a.incomplete.length === 0 && a.completeCount >= 1 && this.form.valid;
  });
  protected readonly canSubmit = computed(() => {
    const a = this.analysis();
    return !this.working() && a.ready && this.form.valid;
  });

  constructor() {
    inject(LedgerApiService).accounts(this.ledgerId).subscribe({ next: (a) => this.accounts.set(a), error: () => this.serverError.set('accounting.journals.accountsFailed') });
    if (this.id) {
      this.api.get(this.ledgerId, this.id).subscribe({
        next: (j) => this.fill(j),
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
    } else {
      this.loading.set(false);
    }
  }

  private newLine() {
    return this.fb.group({ accountId: [''], debit: [''], credit: [''], description: [''] });
  }

  private fill(j: JournalEntry): void {
    if (j.status !== 'draft') this.notEditable.set(true);
    this.form.patchValue({ entryType: j.entryType, postingDate: j.postingDate, description: j.description });
    this.lines.clear();
    for (const l of j.lines) {
      const group = this.newLine();
      group.patchValue({ accountId: l.accountId, debit: isPositive(l.debit) ? toPlain(l.debit) : '', credit: isPositive(l.credit) ? toPlain(l.credit) : '', description: l.description ?? '' });
      this.lines.push(group);
    }
    this.loading.set(false);
  }

  protected addLine(focusAfter = false): void {
    this.lines.push(this.newLine());
    this.lines.markAsDirty();
    if (focusAfter) afterNextRender(() => document.getElementById(`line-account-${this.lines.length - 1}`)?.focus(), { injector: this.injector });
  }

  protected removeLine(index: number): void {
    if (this.lines.length <= 2) return;
    this.lines.removeAt(index);
    this.lines.markAsDirty();
  }

  /** Entering an amount on one side clears the other: a line has exactly one of debit or credit. */
  protected amountEntered(index: number, side: 'debit' | 'credit'): void {
    const group = this.lines.at(index);
    const value = String(group.get(side)?.value ?? '').trim();
    if (value && isValidAmount(value) && isPositive(value)) group.get(side === 'debit' ? 'credit' : 'debit')?.setValue('');
  }

  /** Enter never submits by accident; on the last line it adds a line, so a whole entry can be typed from the keyboard. */
  protected enterPressed(event: Event, index: number): void {
    event.preventDefault();
    if (index === this.lines.length - 1) this.addLine(true);
  }

  protected save(thenSubmit: boolean): void {
    this.form.markAllAsTouched();
    if (thenSubmit ? !this.canSubmit() : !this.canSave()) return;
    const v = this.form.getRawValue();
    const body: JournalInput = {
      entryType: v.entryType,
      postingDate: v.postingDate,
      description: v.description.trim(),
      lines: v.lines
        .filter((l: { accountId: string; debit: string; credit: string }) => l.accountId || l.debit.trim() || l.credit.trim())
        .map((l: { accountId: string; debit: string; credit: string; description: string }) => ({
          accountId: l.accountId,
          debit: l.debit.trim() || '0',
          credit: l.credit.trim() || '0',
          ...(l.description.trim() ? { description: l.description.trim() } : {}),
        })),
    };
    this.working.set(true);
    this.serverError.set(null);
    const saved$: Observable<JournalEntry> = this.id ? this.api.update(this.ledgerId, this.id, body) : this.api.create(this.ledgerId, body);
    (thenSubmit ? saved$.pipe(switchMap((j) => this.api.submit(this.ledgerId, j.id))) : saved$).subscribe({
      next: (j) => {
        this.done = true;
        void this.router.navigate(['/app/accounting/journals', j.id]);
      },
      error: (e: unknown) => {
        this.working.set(false);
        for (const [field, message] of Object.entries(fieldErrors(e))) this.form.get(field)?.setErrors({ server: message });
        this.serverError.set(apiErrorMessage(e));
      },
    });
  }

  canLeave(): boolean | Promise<boolean> {
    if (this.done || !this.form.dirty) return true;
    this.leaving.set(true);
    return new Promise<boolean>((resolve) => (this.resolveLeave = resolve));
  }

  protected answerLeave(ok: boolean): void {
    this.leaving.set(false);
    this.resolveLeave?.(ok);
    this.resolveLeave = null;
  }
}
