import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { apiErrorMessage } from '../../../core/http/api-errors';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { Account } from '../accounting.models';
import { AccountingFormat } from '../accounting-format';
import { LedgerApiService } from '../ledger-api.service';
import { LedgerContext } from '../ledger-context';
import { AccountForm } from './account-form';

interface Row {
  account: Account;
  depth: number;
}

/** Chart of accounts of the active ledger, as a tree or a flat list. */
@Component({
  selector: 'app-accounts-page',
  imports: [TranslatePipe, PageHeader, StatusBadge, HasPermissionDirective, AccountForm, ConfirmDialog],
  templateUrl: './accounts-page.html',
  styleUrl: './accounts-page.scss',
})
export class AccountsPage {
  private readonly api = inject(LedgerApiService);
  private readonly ledger = inject(LedgerContext);
  protected readonly format = inject(AccountingFormat);

  protected readonly accounts = signal<Account[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly view = signal<'tree' | 'list'>('tree');
  protected readonly showInactive = signal(false);
  protected readonly search = signal('');
  protected readonly editing = signal<Account | 'new' | null>(null);
  protected readonly confirmImport = signal(false);
  protected readonly toDeactivate = signal<Account | null>(null);
  protected readonly message = signal<{ kind: 'success' | 'danger'; key?: string; text?: string; count?: number } | null>(null);
  protected readonly busy = signal(false);
  protected readonly ledgerId = this.ledger.activeId() as string;

  protected readonly rows = computed<Row[]>(() => {
    const all = (this.accounts() ?? []).filter((a) => this.showInactive() || a.isActive);
    if (this.view() === 'list') {
      const term = this.search().trim().toLowerCase();
      return all
        .filter((a) => !term || [a.code, a.nameAr, a.nameEn].some((v) => v.toLowerCase().includes(term)))
        .map((account) => ({ account, depth: 0 }));
    }
    const ids = new Set(all.map((a) => a.id));
    const children = new Map<string, Account[]>();
    for (const a of all) {
      const key = a.parentId && ids.has(a.parentId) ? a.parentId : '';
      children.set(key, [...(children.get(key) ?? []), a]);
    }
    const out: Row[] = [];
    const walk = (parent: string, depth: number) => {
      for (const account of children.get(parent) ?? []) {
        out.push({ account, depth });
        walk(account.id, depth + 1);
      }
    };
    walk('', 0);
    return out;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.failed.set(false);
    this.api.accounts(this.ledgerId).subscribe({ next: (a) => this.accounts.set(a), error: () => this.failed.set(true) });
  }

  protected saved(): void {
    this.editing.set(null);
    this.message.set({ kind: 'success', key: 'accounting.accounts.saved' });
    this.load();
  }

  protected importTemplate(): void {
    this.confirmImport.set(false);
    this.busy.set(true);
    this.api.importTemplate(this.ledgerId).subscribe({
      next: (count) => {
        this.busy.set(false);
        this.message.set({ kind: 'success', key: count > 0 ? 'accounting.accounts.imported' : 'accounting.accounts.importedNone', count });
        this.load();
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  protected setActive(account: Account, active: boolean): void {
    this.toDeactivate.set(null);
    this.busy.set(true);
    this.api.updateAccount(this.ledgerId, account.id, { isActive: active }).subscribe({
      next: () => {
        this.busy.set(false);
        this.message.set({ kind: 'success', key: 'accounting.accounts.saved' });
        this.load();
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  private fail(e: unknown): void {
    this.busy.set(false);
    const text = apiErrorMessage(e);
    this.message.set(text ? { kind: 'danger', text } : { kind: 'danger', key: 'errors.generic' });
  }
}
