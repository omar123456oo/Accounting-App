import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ValidationErrorBody } from '../../../core/auth/auth.models';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { FieldError } from '../../../shared/components/field-error/field-error';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { ClientFormat } from '../client-format';
import { ClientsApiService } from '../clients-api.service';
import { FieldDef, ResourceConfig } from './resource-config';

type Row = { id: string } & Record<string, unknown>;

/** One list-with-add/edit/delete tab, driven entirely by a ResourceConfig. */
@Component({
  selector: 'app-resource-tab',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError, ConfirmDialog, HasPermissionDirective],
  templateUrl: './resource-tab.html',
})
export class ResourceTab {
  private readonly api = inject(ClientsApiService);
  protected readonly format = inject(ClientFormat);

  readonly clientId = input.required<string>();
  readonly config = input.required<ResourceConfig>();

  protected readonly rows = signal<Row[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  protected readonly editing = signal<Row | 'new' | null>(null);
  protected readonly deleting = signal<Row | null>(null);
  protected form = new FormGroup<Record<string, FormControl>>({});

  constructor() {
    effect(() => {
      const id = this.clientId();
      const resource = this.config().resource;
      untracked(() => this.load(id, resource));
    });
  }

  private load(id: string, resource: ResourceConfig['resource']): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.listSub<Row>(id, resource).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected open(row: Row | 'new'): void {
    const controls: Record<string, FormControl> = {};
    for (const field of this.config().fields) {
      const value = row === 'new' ? (field.initial ?? (field.type === 'checkbox' ? false : '')) : (row[field.key] ?? (field.type === 'checkbox' ? false : ''));
      controls[field.key] = new FormControl(value, { validators: this.validators(field), nonNullable: true });
    }
    this.form = new FormGroup(controls);
    this.editing.set(row);
  }

  private validators(field: FieldDef): ValidatorFn[] {
    const list: ValidatorFn[] = [];
    if (field.required) list.push(Validators.required);
    if (field.type === 'email') list.push(Validators.email);
    if (field.pattern) list.push(Validators.pattern(field.pattern));
    return list;
  }

  protected cancel(): void {
    this.editing.set(null);
  }

  protected save(): void {
    this.form.markAllAsTouched();
    const target = this.editing();
    if (this.form.invalid || target === null) {
      return;
    }
    const body = Object.fromEntries(Object.entries(this.form.getRawValue()).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    const { resource } = this.config();
    this.saving.set(true);
    const request = target === 'new' ? this.api.createSub<Row>(this.clientId(), resource, body) : this.api.updateSub<Row>(this.clientId(), resource, target.id, body);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(null);
        this.load(this.clientId(), resource);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (error instanceof HttpErrorResponse && error.status === 422) {
          for (const [field, messages] of Object.entries((error.error as ValidationErrorBody).errors ?? {})) {
            this.form.get(field)?.setErrors({ server: messages[0] });
            this.form.get(field)?.markAsTouched();
          }
        }
      },
    });
  }

  protected confirmDelete(): void {
    const row = this.deleting();
    this.deleting.set(null);
    if (!row) return;
    const { resource } = this.config();
    this.api.deleteSub(this.clientId(), resource, row.id).subscribe({
      next: () => this.load(this.clientId(), resource),
      error: () => this.failed.set(true),
    });
  }

  protected isInvalid(key: string): boolean {
    const c = this.form.controls[key];
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}
