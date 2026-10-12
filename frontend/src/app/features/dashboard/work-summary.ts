import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, catchError, map, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Page } from '../clients/client.models';
import { DocumentsApiService } from '../documents/documents-api.service';
import { ApprovalsApiService } from '../workflows/approvals-api.service';
import { TasksApiService } from '../workflows/tasks-api.service';

interface Card {
  key: string;
  route: string;
  /** Null while loading, -1 when the count could not be loaded. */
  count: number | null;
  query?: Record<string, string>;
}

const total = (page$: Observable<Page<unknown>>): Observable<number> =>
  page$.pipe(
    map((p) => p.meta.total),
    catchError(() => of(-1)),
  );

/** Real counts from the task, approval and document APIs. A card appears only for what the user may see. */
@Component({
  selector: 'app-work-summary',
  imports: [RouterLink, TranslatePipe],
  template: `
    <section [attr.aria-label]="'dashboard.work.title' | translate">
      <h2 class="h5 mb-3">{{ 'dashboard.work.title' | translate }}</h2>
      @if (cards().length === 0) {
        <div class="alert alert-secondary" role="status">{{ 'dashboard.work.none' | translate }}</div>
      } @else {
        <div class="row g-3 mb-4">
          @for (card of cards(); track card.key) {
            <div class="col-6 col-lg-3">
              <a class="card h-100 text-decoration-none" [routerLink]="card.route" [queryParams]="card.query">
                <div class="card-body">
                  <div class="text-body-secondary small">{{ 'dashboard.work.' + card.key | translate }}</div>
                  @if (card.count === null) {
                    <div class="fs-3" role="status">{{ 'common.loading' | translate }}</div>
                  } @else if (card.count < 0) {
                    <div class="small text-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
                  } @else {
                    <div class="fs-2 fw-bold" [id]="'work-' + card.key">{{ card.count }}</div>
                    @if (card.count === 0) {
                      <div class="small text-body-secondary">{{ 'dashboard.work.nothing' | translate }}</div>
                    }
                  }
                </div>
              </a>
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class WorkSummary {
  private readonly auth = inject(AuthService);
  private readonly counts = signal<Record<string, number>>({});

  protected readonly cards = computed<Card[]>(() => this.defs.map((d) => ({ ...d, count: this.counts()[d.key] ?? null })));
  private readonly defs: Array<Omit<Card, 'count'>> = [];

  constructor() {
    const tasks = inject(TasksApiService);
    const approvals = inject(ApprovalsApiService);
    const documents = inject(DocumentsApiService);
    const load = (key: string, route: string, request: Observable<Page<unknown>>) => {
      this.defs.push({ key, route });
      total(request).subscribe((n) => this.counts.update((c) => ({ ...c, [key]: n })));
    };
    if (this.auth.can('tasks.view')) {
      load('openTasks', '/app/tasks', tasks.list({ mine: true, status: 'open', pageSize: 1 }));
      load('overdueTasks', '/app/tasks', tasks.list({ mine: true, overdue: true, pageSize: 1 }));
    }
    if (this.auth.can('workflows.approve')) load('pendingApprovals', '/app/approvals', approvals.list({ status: 'pending', pageSize: 1 }));
    if (this.auth.can('documents.view')) load('documentsToReview', '/app/documents', documents.list({ reviewStatus: 'pending', pageSize: 1 }));
  }
}
