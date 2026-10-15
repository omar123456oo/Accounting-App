import { DatePipe } from '@angular/common';
import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { apiErrorMessage } from '../../core/http/api-errors';
import { DocRecordView } from './core.models';
import { WorkflowApiService } from './workflow-api.service';
import { WorkflowAction, WorkflowBlock } from './workflow.models';

/** A record's workflow: where it stands, what the signed-in person can do next (with a comment), and what happened so far. */
@Component({
  selector: 'app-workflow-panel',
  imports: [FormsModule, TranslatePipe, DatePipe],
  template: `
    <section class="card mb-3" aria-labelledby="wf-title">
      <div class="card-body">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
          <h2 class="h5 mb-0" id="wf-title">{{ 'core.workflow.status' | translate }}</h2>
          <span class="badge text-bg-primary" data-testid="wf-state">{{ block().stateLabel }}</span>
          @if (!block().editable) { <span class="text-body-secondary small"><i class="fa-solid fa-lock me-1" aria-hidden="true"></i>{{ 'core.workflow.locked' | translate }}</span> }
        </div>

        @if (block().actions.length) {
          <div class="mb-3">
            <label class="form-label" for="wf-comment">{{ 'core.workflow.comment' | translate }}@if (needsComment()) { <span aria-hidden="true"> *</span> }</label>
            <textarea id="wf-comment" class="form-control mb-2" rows="2" [ngModel]="comment()" (ngModelChange)="comment.set($event)"></textarea>
            <div class="d-flex flex-wrap gap-2">
              @for (a of block().actions; track a.action) {
                <button type="button" class="btn" [class]="a.action === 'reject' || a.action === 'cancel' ? 'btn-outline-danger' : 'btn-primary'" [disabled]="busy()" (click)="run(a)">{{ a.label }}</button>
              }
            </div>
          </div>
        }
        @if (notice(); as n) { <div class="alert alert-info" role="status">{{ n }}</div> }
        @if (error(); as e) { <div class="alert alert-danger" role="alert">{{ e }}</div> }

        <h3 class="h6 mt-3">{{ 'core.workflow.history' | translate }}</h3>
        <ol class="list-unstyled mb-0 small">
          @for (h of block().history; track $index) {
            <li class="border-start ps-2 mb-2">
              <strong>{{ h.actorName ?? '—' }}</strong>
              @if (h.onBehalfOf) { <span class="text-body-secondary"> ({{ 'core.workflow.onBehalfOf' | translate: { name: h.onBehalfOf } }})</span> }
              · {{ h.action }}@if (h.from && h.to && h.from !== h.to) { <span> : {{ h.from }} → {{ h.to }}</span> }
              <span class="text-body-secondary"> · <bdi>{{ h.at | date: 'medium' }}</bdi></span>
              @if (h.comment) { <div class="fst-italic">“{{ h.comment }}”</div> }
            </li>
          }
        </ol>
      </div>
    </section>
  `,
})
export class WorkflowPanel {
  private readonly api = inject(WorkflowApiService);
  private readonly translate = inject(TranslateService);

  readonly block = input.required<WorkflowBlock>();
  readonly doctype = input.required<string>();
  readonly name = input.required<string>();
  /** The record after an action went through. */
  readonly changed = output<DocRecordView>();

  protected readonly comment = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  /** The box is marked required when every offered action asks for a comment. */
  protected needsComment(): boolean {
    const a = this.block().actions;
    return a.length > 0 && a.every((x) => x.requireComment);
  }

  protected run(a: WorkflowAction): void {
    if (a.requireComment && !this.comment().trim()) {
      this.error.set(this.translate.instant('core.workflow.commentRequired') as string);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.api.act(this.doctype(), this.name(), a.action, this.comment().trim()).subscribe({
      next: ({ record, pending }) => {
        this.busy.set(false);
        this.comment.set('');
        if (pending) this.notice.set(this.translate.instant('core.workflow.pending', { count: pending }) as string);
        this.changed.emit(record);
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e) ?? (this.translate.instant('core.saveFailed') as string));
      },
    });
  }
}
