import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/api-errors';
import { CommentDialog } from '../../../shared/components/comment-dialog/comment-dialog';
import { BadgeTone, StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { DocumentsApiService } from '../../documents/documents-api.service';
import { DocumentRecord } from '../../documents/documents.models';
import { ClientStatus } from '../client.models';
import { ClientFormat } from '../client-format';
import { OnboardingApiService } from './onboarding-api.service';
import { AdvanceTarget, CHECKLIST_TRANSITIONS, ChecklistItem, ChecklistStatus, OnboardingCase, STAGE_ORDER } from './onboarding.models';

const ITEM_TONE: Record<ChecklistStatus, BadgeTone> = { missing: 'secondary', received: 'info', approved: 'success', rejected: 'danger' };
const NEXT: Record<string, { to: AdvanceTarget; label: string } | undefined> = {
  document_collection: { to: 'verification', label: 'onboarding.actions.toVerification' },
  verification: { to: 'approval', label: 'onboarding.actions.toApproval' },
};

/** Onboarding workflow of one client. It only reflects the rules; the API refuses anything illegal. */
@Component({
  selector: 'app-onboarding-tab',
  imports: [TranslatePipe, StatusBadge, HasPermissionDirective, CommentDialog],
  templateUrl: './onboarding-tab.html',
})
export class OnboardingTab {
  private readonly api = inject(OnboardingApiService);
  private readonly documentsApi = inject(DocumentsApiService);
  private readonly auth = inject(AuthService);
  protected readonly format = inject(ClientFormat);

  readonly clientId = input.required<string>();
  readonly clientStatus = input.required<ClientStatus>();
  /** Emitted when the case changed something about the client itself (completion activates it). */
  readonly clientChanged = output<void>();

  protected readonly stages = STAGE_ORDER;
  protected readonly itemTone = ITEM_TONE;
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly kase = signal<OnboardingCase | null>(null);
  protected readonly documents = signal<DocumentRecord[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly dialog = signal<'reject' | 'approve' | null>(null);
  protected readonly newLabel = signal('');
  protected readonly newRequired = signal(true);

  protected readonly canStart = computed(() => this.kase() === null && (this.clientStatus() === 'lead' || this.clientStatus() === 'onboarding'));
  protected readonly editable = computed(() => this.kase()?.stage === 'document_collection' || this.kase()?.stage === 'verification');
  protected readonly next = computed(() => NEXT[this.kase()?.stage ?? '']);
  /** The person who submitted the verification. Four-eyes means this person cannot also approve. */
  protected readonly submitter = computed(() => [...(this.kase()?.history ?? [])].reverse().find((e) => e.to === 'approval'));
  protected readonly isSubmitter = computed(() => this.submitter()?.actorId === this.auth.user()?.id);

  constructor() {
    effect(() => {
      const id = this.clientId();
      untracked(() => this.load(id));
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.api.get(id).subscribe({
      next: (c) => {
        this.kase.set(c);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.kase.set(null);
        this.failed.set(e.status !== 404);
        this.loading.set(false);
      },
    });
    if (this.auth.can('documents.view')) {
      this.documentsApi.listForClient(id, { category: 'onboarding', pageSize: 100 }).subscribe({ next: (p) => this.documents.set(p.data), error: () => this.documents.set([]) });
    }
  }

  protected labelOf(item: ChecklistItem): { text: string; translate: boolean } {
    return item.labelKey ? { text: item.labelKey, translate: true } : { text: item.label, translate: false };
  }

  protected stageState(stage: (typeof STAGE_ORDER)[number]): 'done' | 'current' | 'upcoming' {
    const current = this.kase()?.stage;
    const at = STAGE_ORDER.indexOf(current as (typeof STAGE_ORDER)[number]);
    const i = STAGE_ORDER.indexOf(stage);
    if (current === 'completed') return 'done';
    return i < at ? 'done' : i === at ? 'current' : 'upcoming';
  }

  protected itemActions(item: ChecklistItem): readonly ChecklistStatus[] {
    return CHECKLIST_TRANSITIONS[item.status];
  }

  protected docName(id: string | undefined): string {
    return this.documents().find((d) => d.id === id)?.name ?? id ?? '';
  }

  protected start(): void {
    this.run(this.api.start(this.clientId()), true);
  }

  protected setItem(item: ChecklistItem, status: ChecklistStatus): void {
    this.run(this.api.updateItem(this.clientId(), item.id, { status }));
  }

  protected link(item: ChecklistItem, documentId: string): void {
    this.run(this.api.updateItem(this.clientId(), item.id, { documentId: documentId || null }));
  }

  protected setFlag(flag: 'identityVerified' | 'engagementAccepted', value: boolean): void {
    this.run(this.api.setFlags(this.clientId(), { [flag]: value }));
  }

  protected addItem(): void {
    const label = this.newLabel().trim();
    if (!label) return;
    this.run(this.api.addItem(this.clientId(), { label, required: this.newRequired() }), false, () => this.newLabel.set(''));
  }

  protected removeItem(item: ChecklistItem): void {
    this.run(this.api.removeItem(this.clientId(), item.id));
  }

  protected advance(to: AdvanceTarget, comment?: string): void {
    this.dialog.set(null);
    this.run(this.api.advance(this.clientId(), to, comment), to === 'completed');
  }

  protected reject(comment: string): void {
    this.dialog.set(null);
    this.run(this.api.reject(this.clientId(), comment));
  }

  private run(request: Observable<OnboardingCase>, clientChanged = false, after?: () => void): void {
    this.error.set(null);
    this.busy.set(true);
    request.subscribe({
      next: (c) => {
        this.kase.set(c);
        this.busy.set(false);
        after?.();
        if (clientChanged || c.stage === 'completed') this.clientChanged.emit();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }
}
