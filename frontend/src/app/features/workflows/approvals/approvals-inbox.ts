import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/api-errors';
import { CommentDialog } from '../../../shared/components/comment-dialog/comment-dialog';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { ClientFormat } from '../../clients/client-format';
import { ApprovalsApiService } from '../approvals-api.service';
import { ChartCard, ChartItem, PieChart } from '../../analytics/analytics-charts';
import { ApprovalItem, ApprovalStatus } from '../workflows.models';

const TONE = { pending: 'warning', approved: 'success', rejected: 'danger' } as const;

/** Items waiting for a decision. Onboarding approvals appear here; the API enforces permission and four-eyes. */
@Component({
  selector: 'app-approvals-inbox',
  imports: [RouterLink, TranslatePipe, PageHeader, StatusBadge, CommentDialog, ChartCard, PieChart],
  templateUrl: './approvals-inbox.html',
})
export class ApprovalsInbox {
  private readonly api = inject(ApprovalsApiService);
  private readonly auth = inject(AuthService);
  protected readonly format = inject(ClientFormat);
  protected readonly tone = TONE;

  private readonly all = signal<ApprovalItem[]>([]);
  protected readonly byStatus = computed(() => (['pending', 'approved', 'rejected'] as const).map((s): ChartItem => ({ label: '', labelKey: 'approvals.status.' + s, value: this.all().filter((a) => a.status === s).length, tone: ({ pending: 'warning', approved: 'success', rejected: 'danger' } as const)[s] })));
  protected readonly byKind = computed(() => [...new Set(this.all().map((a) => a.kind))].map((k): ChartItem => ({ label: '', labelKey: 'approvals.kinds.' + k, value: this.all().filter((a) => a.kind === k).length })));
  protected readonly status = signal<ApprovalStatus | ''>('pending');
  protected readonly items = signal<ApprovalItem[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialog = signal<{ item: ApprovalItem; action: 'approve' | 'reject' } | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.failed.set(false);
    this.api.list({ status: '', pageSize: 100 }).subscribe({ next: (p) => this.all.set(p.data), error: () => undefined });
    this.api.list({ status: this.status(), pageSize: 100 }).subscribe({
      next: (p) => this.items.set(p.data),
      error: () => this.failed.set(true),
    });
  }

  protected setStatus(value: string): void {
    this.status.set(value as ApprovalStatus | '');
    this.load();
  }

  protected isOwn(item: ApprovalItem): boolean {
    return item.requestedById === this.auth.user()?.id;
  }

  protected decide(comment: string): void {
    const d = this.dialog();
    this.dialog.set(null);
    if (!d) return;
    this.error.set(null);
    const request = d.action === 'approve' ? this.api.approve(d.item.id, comment) : this.api.reject(d.item.id, comment);
    request.subscribe({
      next: () => this.load(),
      error: (e: unknown) => {
        this.error.set(apiErrorMessage(e));
        this.load();
      },
    });
  }
}
