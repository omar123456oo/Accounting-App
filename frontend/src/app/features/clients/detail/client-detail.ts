import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { Client, ClientStatus } from '../client.models';
import { ClientFormat, STATUS_TONE } from '../client-format';
import { legalTransitions } from '../client-status';
import { ClientsApiService } from '../clients-api.service';
import { ClientHistory } from './client-history';
import { AGREEMENTS, BANK_ACCOUNTS, BRANCHES, CONTACTS, NOTES, ResourceConfig } from './resource-config';
import { ResourceTab } from './resource-tab';

type TabId = 'overview' | 'contacts' | 'branches' | 'bankAccounts' | 'agreements' | 'notes' | 'history';
const TABS: readonly TabId[] = ['overview', 'contacts', 'branches', 'bankAccounts', 'agreements', 'notes', 'history'];
const CONFIGS: Partial<Record<TabId, ResourceConfig>> = { contacts: CONTACTS, branches: BRANCHES, bankAccounts: BANK_ACCOUNTS, agreements: AGREEMENTS, notes: NOTES };

@Component({
  selector: 'app-client-detail',
  imports: [RouterLink, TranslatePipe, PageHeader, StatusBadge, ConfirmDialog, HasPermissionDirective, ResourceTab, ClientHistory],
  templateUrl: './client-detail.html',
})
export class ClientDetail {
  private readonly api = inject(ClientsApiService);
  protected readonly format = inject(ClientFormat);
  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly tabs = TABS;
  protected readonly configs = CONFIGS;
  protected readonly tone = STATUS_TONE;
  protected readonly client = signal<Client | null>(null);
  protected readonly notFound = signal(false);
  protected readonly tab = signal<TabId>('overview');
  protected readonly pendingStatus = signal<ClientStatus | null>(null);
  protected readonly confirmingArchive = signal(false);
  protected readonly actionError = signal(false);
  protected readonly nextStatuses = computed(() => {
    const c = this.client();
    return c ? legalTransitions(c.status) : [];
  });

  constructor() {
    this.api.get(this.id).subscribe({ next: (c) => this.client.set(c), error: () => this.notFound.set(true) });
  }

  protected onTabKey(event: KeyboardEvent): void {
    const rtl = document.documentElement.dir === 'rtl';
    const step = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(this.tab()) + step + TABS.length) % TABS.length];
    this.tab.set(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  protected applyStatus(): void {
    const status = this.pendingStatus();
    this.pendingStatus.set(null);
    if (status) this.run(this.api.changeStatus(this.id, status));
  }

  protected applyArchive(): void {
    this.confirmingArchive.set(false);
    this.run(this.api.archive(this.id, !this.client()?.archived));
  }

  private run(request: ReturnType<ClientsApiService['changeStatus']>): void {
    this.actionError.set(false);
    request.subscribe({
      next: (c) => this.client.set(c),
      error: (e: unknown) => this.actionError.set(!(e instanceof HttpErrorResponse) || e.status !== 403),
    });
  }
}
