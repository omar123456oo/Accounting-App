import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, catchError, of, switchMap, tap } from 'rxjs';
import { Column, DataTable, SortChange } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { Page } from '../../clients/client.models';
import { ClientFormat } from '../../clients/client-format';
import { PRIORITY_TONE, TASK_STATUS_TONE } from '../workflows-format';
import { TASK_PRIORITIES, TASK_STATUSES, Task, TaskListParams } from '../workflows.models';
import { TasksApiService } from '../tasks-api.service';

/** My tasks (default) or every task the user may see, with filters. Overdue tasks carry a text badge and an icon. */
@Component({
  selector: 'app-task-list',
  imports: [RouterLink, TranslatePipe, DataTable, PageHeader, StatusBadge, HasPermissionDirective],
  templateUrl: './task-list.html',
})
export class TaskList {
  private readonly api = inject(TasksApiService);
  protected readonly format = inject(ClientFormat);

  protected readonly statuses = TASK_STATUSES;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly statusTone = TASK_STATUS_TONE;
  protected readonly priorityTone = PRIORITY_TONE;
  protected readonly columns: readonly Column[] = [
    { key: 'title', labelKey: 'tasks.fields.title', sortable: true },
    { key: 'clientName', labelKey: 'tasks.fields.client' },
    { key: 'assigneeName', labelKey: 'tasks.fields.assignee', sortable: true },
    { key: 'priority', labelKey: 'tasks.fields.priority', sortable: true },
    { key: 'dueDate', labelKey: 'tasks.fields.dueDate', sortable: true },
    { key: 'status', labelKey: 'tasks.fields.status', sortable: true },
  ];

  protected readonly params = signal<TaskListParams>({ page: 1, pageSize: 10, mine: true, status: 'open', sort: 'dueDate', dir: 'asc' });
  protected readonly result = signal<Page<Task> | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  private readonly load$ = new Subject<void>();

  constructor() {
    this.load$
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap(() =>
          this.api.list(this.params()).pipe(
            catchError(() => {
              this.failed.set(true);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((page) => {
        this.result.set(page);
        this.loading.set(false);
      });
    this.load$.next();
  }

  protected reload(): void {
    this.load$.next();
  }

  protected patch(change: Partial<TaskListParams>, resetPage = true): void {
    this.params.update((p) => ({ ...p, ...change, ...(resetPage ? { page: 1 } : {}) }));
    this.reload();
  }

  protected search(event: Event, q: string): void {
    event.preventDefault();
    this.patch({ q: q.trim() });
  }

  protected onSort(change: SortChange): void {
    this.patch({ sort: change.sort, dir: change.dir });
  }
}
