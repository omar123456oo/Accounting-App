import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage, fieldErrors } from '../../../core/http/api-errors';
import { FieldError } from '../../../shared/components/field-error/field-error';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { AssignableUser } from '../../clients/client.models';
import { ClientsApiService } from '../../clients/clients-api.service';
import { TasksApiService } from '../tasks-api.service';
import { TASK_PRIORITIES, TASK_STATUSES, Task, TaskInput } from '../workflows.models';

/** Create or edit a task. Assignee changes after creation go through reassignment, which needs a reason. */
@Component({
  selector: 'app-task-form',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, FieldError, PageHeader],
  templateUrl: './task-form.html',
})
export class TaskForm {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(TasksApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  protected readonly editing = this.id !== null;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly statuses = TASK_STATUSES;
  protected readonly users = signal<AssignableUser[]>([]);
  protected readonly clients = signal<AssignableUser[]>([]);
  protected readonly others = signal<Task[]>([]);
  protected readonly loading = signal(this.editing);
  protected readonly notFound = signal(false);
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly depends = signal<string[]>([]);

  protected readonly form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    clientId: [''],
    assigneeId: ['', Validators.required],
    priority: ['normal' as (typeof TASK_PRIORITIES)[number], Validators.required],
    dueDate: ['', Validators.required],
    status: ['todo' as (typeof TASK_STATUSES)[number]],
  });

  constructor() {
    this.clientsApi.assignableUsers().subscribe({ next: (u) => this.users.set(u), error: () => this.users.set([]) });
    if (this.auth.can('clients.view')) {
      this.clientsApi.list({ pageSize: 100, sort: 'legalName' }).subscribe({ next: (p) => this.clients.set(p.data.map((c) => ({ id: c.id, name: c.legalName }))), error: () => this.clients.set([]) });
    }
    this.api.list({ pageSize: 100, sort: 'title' }).subscribe({ next: (p) => this.others.set(p.data.filter((t) => t.id !== this.id)), error: () => this.others.set([]) });
    if (this.id) {
      this.api.get(this.id).subscribe({
        next: (t) => {
          this.form.patchValue({ title: t.title, description: t.description ?? '', clientId: t.clientId ?? '', assigneeId: t.assigneeId, priority: t.priority, dueDate: t.dueDate, status: t.status });
          this.form.controls.assigneeId.disable();
          this.depends.set(t.dependsOnTaskIds);
          this.loading.set(false);
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
    } else {
      this.form.controls.status.disable();
      this.form.patchValue({ assigneeId: this.auth.user()?.id ?? '' });
    }
  }

  protected toggle(taskId: string, checked: boolean): void {
    this.depends.update((list) => (checked ? [...list, taskId] : list.filter((x) => x !== taskId)));
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const body: TaskInput = {
      title: v.title.trim(),
      description: v.description.trim() || undefined,
      clientId: v.clientId || undefined,
      assigneeId: v.assigneeId,
      priority: v.priority,
      dueDate: v.dueDate,
      dependsOnTaskIds: this.depends(),
      ...(this.editing ? { status: v.status } : {}),
    };
    this.submitting.set(true);
    this.serverError.set(null);
    const { assigneeId: _fixed, ...changes } = body;
    const request = this.id ? this.api.update(this.id, { ...changes, description: body.description ?? '', clientId: body.clientId ?? '' }) : this.api.create(body);
    request.subscribe({
      next: (t) => void this.router.navigate(['/app/tasks', t.id]),
      error: (e: unknown) => {
        this.submitting.set(false);
        for (const [field, message] of Object.entries(fieldErrors(e))) this.form.get(field)?.setErrors({ server: message });
        this.serverError.set(apiErrorMessage(e));
      },
    });
  }
}
