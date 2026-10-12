import { Component, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Modal } from '../../shared/components/modal/modal';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { ClientFormat } from '../clients/client-format';
import { REVIEW_TONE, formatBytes } from './document-format';
import { DocumentRecord } from './documents.models';

/** Versions (each downloadable) and review comments of one document. */
@Component({
  selector: 'app-document-detail',
  imports: [TranslatePipe, Modal, StatusBadge],
  template: `
    <app-modal [title]="doc().name" width="44rem" (closed)="closed.emit()">
      <p class="mb-2">
        <app-status-badge [label]="'documents.review.' + doc().reviewStatus | translate" [tone]="tone[doc().reviewStatus]" />
      </p>
      <h3 class="h6">{{ 'documents.versions' | translate }}</h3>
      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <caption class="visually-hidden">{{ 'documents.versions' | translate }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ 'documents.version' | translate }}</th>
              <th scope="col">{{ 'documents.fileName' | translate }}</th>
              <th scope="col">{{ 'documents.size' | translate }}</th>
              <th scope="col">{{ 'documents.uploadedBy' | translate }}</th>
              <th scope="col">{{ 'documents.sha256' | translate }}</th>
              <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
            </tr>
          </thead>
          <tbody>
            @for (v of reversed(); track v.version) {
              <tr>
                <td>{{ v.version }}@if (v.version === doc().currentVersion) { <span class="badge text-bg-light border">{{ 'documents.current' | translate }}</span> }</td>
                <td>{{ v.fileName }}</td>
                <td>{{ bytes(v.sizeBytes) }}</td>
                <td>{{ v.uploadedBy }}<br /><span class="text-body-secondary small">{{ format.dateTime(v.uploadedAt) }}</span></td>
                <td><code class="small" [title]="v.sha256 ?? ''">{{ v.sha256 ? v.sha256.slice(0, 12) : '—' }}</code></td>
                <td class="text-end">
                  <button type="button" class="btn btn-outline-secondary btn-sm" (click)="download.emit(v.version)">
                    {{ 'documents.download' | translate }}<span class="visually-hidden"> {{ 'documents.version' | translate }} {{ v.version }}</span>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <h3 class="h6">{{ 'documents.reviewComments' | translate }}</h3>
      @if (doc().reviewComments.length === 0) {
        <p class="text-body-secondary" role="status">{{ 'documents.noReviewComments' | translate }}</p>
      } @else {
        <ul class="list-unstyled">
          @for (c of doc().reviewComments; track c.id) {
            <li class="mb-2">
              <strong>{{ 'documents.review.' + c.decision | translate }}</strong>, {{ c.author }}, {{ format.dateTime(c.at) }}
              @if (c.comment) {
                <q class="d-block">{{ c.comment }}</q>
              }
            </li>
          }
        </ul>
      }
    </app-modal>
  `,
})
export class DocumentDetail {
  protected readonly format = inject(ClientFormat);
  protected readonly tone = REVIEW_TONE;
  protected readonly bytes = formatBytes;

  readonly doc = input.required<DocumentRecord>();
  readonly closed = output<void>();
  readonly download = output<number>();

  protected reversed() {
    return [...this.doc().versions].reverse();
  }
}
