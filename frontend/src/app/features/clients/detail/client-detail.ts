import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { Client, ClientStatus } from '../client.models';
import { ClientFormat, STATUS_TONE } from '../client-format';
import { legalTransitions } from '../client-status';
import { ClientsApiService } from '../clients-api.service';
import { DocumentList } from '../../documents/document-list/document-list';
import { OnboardingTab } from '../onboarding/onboarding-tab';
import { ClientHistory } from './client-history';
import { AGREEMENTS, BANK_ACCOUNTS, BRANCHES, CONTACTS, NOTES, ResourceConfig } from './resource-config';
import { ResourceTab } from './resource-tab';

type TabId = 'overview' | 'contacts' | 'branches' | 'bankAccounts' | 'agreements' | 'notes' | 'onboarding' | 'documents' | 'history';
const TABS: readonly TabId[] = ['overview', 'contacts', 'branches', 'bankAccounts', 'agreements', 'notes', 'onboarding', 'documents', 'history'];
/** Tabs that need a permission beyond viewing the client. */
const TAB_PERMISSION: Partial<Record<TabId, string>> = { documents: 'documents.view' };
const CONFIGS: Partial<Record<TabId, ResourceConfig>> = { contacts: CONTACTS, branches: BRANCHES, bankAccounts: BANK_ACCOUNTS, agreements: AGREEMENTS, notes: NOTES };

@Component({
  selector: 'app-client-detail',
  imports: [RouterLink, TranslatePipe, PageHeader, StatusBadge, ConfirmDialog, HasPermissionDirective, ResourceTab, ClientHistory, OnboardingTab, DocumentList],
  templateUrl: './client-detail.html',
})
export class ClientDetail {
  private readonly api = inject(ClientsApiService);
  private readonly auth = inject(AuthService);
  protected readonly format = inject(ClientFormat);
  private readonly route = inject(ActivatedRoute).snapshot;
  protected readonly id = this.route.paramMap.get('id') ?? '';

  protected readonly tabs = TABS.filter((t) => !TAB_PERMISSION[t] || this.auth.can(TAB_PERMISSION[t]!));
  protected readonly configs = CONFIGS;
  protected readonly tone = STATUS_TONE;
  protected readonly client = signal<Client | null>(null);
  protected readonly notFound = signal(false);
  protected readonly tab = signal<TabId>(this.initialTab());
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

  /** Links such as "?tab=onboarding" from the client list open that tab directly. */
  private initialTab(): TabId {
    const wanted = this.route.queryParamMap?.get('tab') as TabId | null;
    return wanted && this.tabs.includes(wanted) ? wanted : 'overview';
  }

  /** Reloads the client after something outside this component changed it (onboarding completion). */
  protected reload(): void {
    this.api.get(this.id).subscribe((c) => this.client.set(c));
  }

  protected onTabKey(event: KeyboardEvent): void {
    const rtl = document.documentElement.dir === 'rtl';
    const step = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = this.tabs[(this.tabs.indexOf(this.tab()) + step + this.tabs.length) % this.tabs.length];
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
