import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { apiErrorMessage } from '../../../core/http/api-errors';
import { FieldError } from '../../../shared/components/field-error/field-error';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { AssignableUser } from '../../clients/client.models';
import { ClientFormat } from '../../clients/client-format';
import { ClientsApiService } from '../../clients/clients-api.service';
import { TasksApiService } from '../tasks-api.service';
import { PRIORITY_TONE, TASK_STATUS_TONE } from '../workflows-format';
import { TASK_STATUSES, Task, TaskEvent } from '../workflows.models';

/** One task with its dependencies, comments, history and reassignment (which needs a reason). */
@Component({
  selector: 'app-task-detail',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, FieldError, PageHeader, StatusBadge, HasPermissionDirective],
  templateUrl: './task-detail.html',
})
export class TaskDetail {
  private readonly api = inject(TasksApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly format = inject(ClientFormat);
  private id = '';

  protected readonly statusTone = TASK_STATUS_TONE;
  protected readonly priorityTone = PRIORITY_TONE;
  protected readonly task = signal<Task | null>(null);
  protected readonly titles = signal<Record<string, Task>>({});
  protected readonly users = signal<AssignableUser[]>([]);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly nextStatuses = computed(() => TASK_STATUSES.filter((s) => s !== this.task()?.status));

  protected readonly comment = this.fb.control('', Validators.required);
  protected readonly reassign = this.fb.group({ assigneeId: ['', Validators.required], reason: ['', Validators.required] });

  constructor() {
    // The router reuses this component when only the id changes (following a dependency link), so listen to the param.
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.id = params.get('id') ?? '';
        this.task.set(null);
        this.notFound.set(false);
        this.error.set(null);
        this.api.get(this.id).subscribe({ next: (t) => this.task.set(t), error: () => this.notFound.set(true) });
      });
    this.api.list({ pageSize: 100 }).subscribe({ next: (p) => this.titles.set(Object.fromEntries(p.data.map((t) => [t.id, t]))), error: () => this.titles.set({}) });
    this.clientsApi.assignableUsers().subscribe({ next: (u) => this.users.set(u), error: () => this.users.set([]) });
  }

  protected setStatus(status: Task['status']): void {
    this.run(this.api.update(this.id, { status }));
  }

  protected addComment(): void {
    this.comment.markAsTouched();
    if (this.comment.invalid || !this.comment.value.trim()) return;
    this.run(this.api.comment(this.id, this.comment.value.trim()), () => this.comment.reset(''));
  }

  protected doReassign(): void {
    this.reassign.markAllAsTouched();
    if (this.reassign.invalid) return;
    const v = this.reassign.getRawValue();
    this.run(this.api.reassign(this.id, v.assigneeId, v.reason.trim()), () => this.reassign.reset({ assigneeId: '', reason: '' }));
  }

  protected depTitle(id: string): string {
    return this.titles()[id]?.title ?? id;
  }

  /** Translation params of one history line. */
  protected params(e: TaskEvent): Record<string, string> {
    const status = (v?: string) => (e.action === 'status_changed' && v ? this.translate.instant(`tasks.status.${v}`) : (v ?? ''));
    return { actor: e.actor, from: status(e.from), to: status(e.to) };
  }

  private run(request: Observable<Task>, after?: () => void): void {
    this.error.set(null);
    request.subscribe({
      next: (t) => {
        this.task.set(t);
        after?.();
      },
      error: (e: unknown) => this.error.set(apiErrorMessage(e)),
    });
  }
}
