import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin, map, switchMap } from 'rxjs';
import { apiErrorMessage } from '../../core/http/api-errors';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { CoreApiService } from './core-api.service';
import { DocTypeMeta } from './core.models';
import { FieldEditor } from './field-editor';
import { FieldRow, fieldsToRows, rowsToFields } from './field-rows';

/** "Customize form": add, reorder, hide or require fields on a document type. Built-in fields are shown but cannot be changed. */
@Component({
  selector: 'app-customize-form',
  imports: [RouterLink, TranslatePipe, PageHeader, FieldEditor],
  template: `
    <app-page-header [title]="meta() ? ('core.customize.title' | translate: { label: meta()!.label }) : ('core.customize.titlePlain' | translate)">
      <a class="btn btn-outline-secondary" routerLink="/app/settings/doctypes">{{ 'core.docTypes.back' | translate }}</a>
    </app-page-header>

    @if (loadFailed()) {
      <div class="alert alert-danger" role="alert">{{ 'core.loadFailed' | translate }}</div>
    } @else if (meta(); as m) {
      <section class="card mb-4" aria-labelledby="builtin-title">
        <div class="card-body">
          <h2 class="h5" id="builtin-title">{{ 'core.customize.baseFields' | translate }}</h2>
          <ul class="list-inline mb-0">
            @for (f of baseFields(); track f.fieldname) {
              <li class="list-inline-item badge text-bg-light border" dir="ltr">{{ f.label }} <span class="text-body-secondary">({{ f.fieldname }})</span></li>
            }
          </ul>
        </div>
      </section>

      <section class="card" aria-labelledby="custom-title">
        <div class="card-body">
          <h2 class="h5" id="custom-title">{{ 'core.customize.customFields' | translate }}</h2>
          <app-field-editor [(rows)]="rows" [anchors]="anchors()" />
          @if (error(); as e) { <div class="alert alert-danger mt-3" role="alert">{{ e }}</div> }
          @if (saved()) { <div class="alert alert-success mt-3" role="status">{{ 'core.customize.saved' | translate }}</div> }
          <div class="d-flex justify-content-end mt-3">
            <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">{{ 'common.save' | translate }}</button>
          </div>
        </div>
      </section>
    } @else {
      <p role="status">{{ 'common.loading' | translate }}</p>
    }
  `,
})
export class CustomizeForm {
  private readonly api = inject(CoreApiService);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private name = '';

  protected readonly meta = signal<DocTypeMeta | null>(null);
  protected readonly rows = signal<FieldRow[]>([]);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly custom = signal<string[]>([]);
  /** The type's own fields: everything in the merged list that is not one of the custom fields. */
  protected readonly baseFields = computed(() => (this.meta()?.fields ?? []).filter((f) => !this.custom().includes(f.fieldname)));
  protected readonly anchors = computed(() => this.baseFields().map((f) => f.fieldname));

  constructor() {
    this.route.paramMap
      .pipe(
        map((p) => (this.name = p.get('name') ?? '')),
        switchMap((n) => forkJoin({ meta: this.api.meta(n), custom: this.api.customFields(n) })),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: ({ meta, custom }) => {
          this.custom.set(custom.map((f) => f.fieldname));
          this.meta.set(meta);
          this.rows.set(fieldsToRows(custom));
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected save(): void {
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    this.api.saveCustomFields(this.name, rowsToFields(this.rows(), true)).subscribe({
      next: (fields) => {
        this.saving.set(false);
        this.saved.set(true);
        this.custom.set(fields.map((f) => f.fieldname));
        this.rows.set(fieldsToRows(fields));
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(e) ?? this.translate.instant('core.saveFailed'));
      },
    });
  }
}
