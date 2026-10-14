import { Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { BadgeTone, StatusBadge } from '../../shared/components/status-badge/status-badge';
import { ClientFormat } from '../clients/client-format';
import { EngageApiService } from '../engage/engage-api.service';
import { PortalDocument, PortalRequest } from '../engage/engage.models';

const TONE: Record<string, BadgeTone> = { pending: 'warning', approved: 'success', rejected: 'danger' };

/** What the office has asked this client for, and the documents already on file with their review state. */
@Component({
  selector: 'app-portal-documents',
  imports: [TranslatePipe, StatusBadge],
  template: `
    <h1 class="h3 mb-3">{{ 'portal.tabs.documents' | translate }}</h1>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (data(); as d) {
      <h2 class="h5">{{ 'portal.documents.requests' | translate }}</h2>
      <ul class="list-group mb-4">
        @for (r of d.requests; track r.id) {
          <li class="list-group-item d-flex justify-content-between align-items-center">
            <span>{{ r.label }}<span class="d-block small text-body-secondary">{{ 'portal.documents.due' | translate }}: {{ dates.date(r.dueDate) }}</span></span>
            <app-status-badge [label]="'portal.documents.request.' + (r.overdue ? 'overdue' : r.status) | translate" [tone]="r.overdue ? 'danger' : r.status === 'open' ? 'warning' : 'success'" />
          </li>
        } @empty {
          <li class="list-group-item text-body-secondary">{{ 'portal.documents.noRequests' | translate }}</li>
        }
      </ul>
      <h2 class="h5">{{ 'portal.documents.onFile' | translate }}</h2>
      <div class="table-responsive">
        <table class="table align-middle">
          <caption class="visually-hidden">{{ 'portal.documents.onFile' | translate }}</caption>
          <thead><tr><th scope="col">{{ 'portal.documents.name' | translate }}</th><th scope="col">{{ 'portal.documents.category' | translate }}</th><th scope="col">{{ 'portal.documents.year' | translate }}</th><th scope="col">{{ 'tickets.status' | translate }}</th></tr></thead>
          <tbody>
            @for (x of d.documents; track x.id) {
              <tr>
                <td>{{ x.name }}</td>
                <td>{{ 'documents.category.' + x.category | translate }}</td>
                <td>{{ x.year }}</td>
                <td><app-status-badge [label]="'documents.review.' + x.reviewStatus | translate" [tone]="tone[x.reviewStatus] ?? 'secondary'" /></td>
              </tr>
            } @empty {
              <tr><td colspan="4" class="text-center text-body-secondary py-4">{{ 'portal.documents.none' | translate }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class PortalDocuments {
  protected readonly dates = inject(ClientFormat);
  protected readonly tone = TONE;
  protected readonly data = signal<{ documents: PortalDocument[]; requests: PortalRequest[] } | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    const api = inject(EngageApiService);
    forkJoin({ documents: api.portalDocuments(), requests: api.portalRequests() }).subscribe({ next: (d) => this.data.set(d), error: () => this.failed.set(true) });
  }
}
