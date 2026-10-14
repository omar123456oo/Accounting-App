import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { FIELD_TYPES, FieldType } from './core.models';
import { FieldRow, blankRow, move } from './field-rows';

let nextId = 0;

/** Edits a list of field definitions: add, remove, reorder, and the properties of each field. */
@Component({
  selector: 'app-field-editor',
  imports: [FormsModule, TranslatePipe],
  template: `
    @if (rows().length === 0) {
      <p class="text-body-secondary">{{ 'core.fields.none' | translate }}</p>
    }
    @for (r of rows(); track $index) {
      <fieldset class="border rounded p-3 mb-3">
        <legend class="float-none w-auto fs-6 px-2 mb-0">{{ r.label || r.fieldname || ('core.fields.new' | translate) }}</legend>
        <div class="row g-2">
          <div class="col-md-4">
            <label class="form-label" [for]="id + '-name-' + $index">{{ 'core.fields.fieldname' | translate }} *</label>
            <input class="form-control" dir="ltr" [id]="id + '-name-' + $index" [ngModel]="r.fieldname" (ngModelChange)="patch($index, { fieldname: $event })" />
          </div>
          <div class="col-md-4">
            <label class="form-label" [for]="id + '-label-' + $index">{{ 'core.fields.label' | translate }} *</label>
            <input class="form-control" [id]="id + '-label-' + $index" [ngModel]="r.label" (ngModelChange)="patch($index, { label: $event })" />
          </div>
          <div class="col-md-4">
            <label class="form-label" [for]="id + '-type-' + $index">{{ 'core.fields.type' | translate }}</label>
            <select class="form-select" [id]="id + '-type-' + $index" [ngModel]="r.fieldtype" (ngModelChange)="patch($index, { fieldtype: $event })">
              @for (t of types; track t) { <option [value]="t">{{ 'core.fields.types.' + t | translate }}</option> }
            </select>
          </div>
          @if (r.fieldtype === 'select' || r.fieldtype === 'link') {
            <div class="col-12">
              <label class="form-label" [for]="id + '-opt-' + $index">{{ (r.fieldtype === 'select' ? 'core.fields.choices' : 'core.fields.linkTarget') | translate }}</label>
              <input class="form-control" dir="ltr" [id]="id + '-opt-' + $index" [ngModel]="r.optionsText" (ngModelChange)="patch($index, { optionsText: $event })" />
              <div class="form-text">{{ (r.fieldtype === 'select' ? 'core.fields.choicesHint' : 'core.fields.linkTargetHint') | translate }}</div>
            </div>
          }
          @if (anchors().length) {
            <div class="col-md-6">
              <label class="form-label" [for]="id + '-after-' + $index">{{ 'core.fields.insertAfter' | translate }}</label>
              <select class="form-select" [id]="id + '-after-' + $index" [ngModel]="r.insertAfter" (ngModelChange)="patch($index, { insertAfter: $event })">
                <option value="">{{ 'core.fields.atEnd' | translate }}</option>
                @for (a of anchorsFor($index); track a) { <option [value]="a">{{ a }}</option> }
              </select>
            </div>
          }
          <div class="col-auto form-check ms-2 mt-4">
            <input type="checkbox" class="form-check-input" [id]="id + '-req-' + $index" [ngModel]="r.required" (ngModelChange)="patch($index, { required: $event })" />
            <label class="form-check-label" [for]="id + '-req-' + $index">{{ 'core.fields.required' | translate }}</label>
          </div>
          <div class="col-auto form-check mt-4">
            <input type="checkbox" class="form-check-input" [id]="id + '-hid-' + $index" [ngModel]="r.hidden" (ngModelChange)="patch($index, { hidden: $event })" />
            <label class="form-check-label" [for]="id + '-hid-' + $index">{{ 'core.fields.hidden' | translate }}</label>
          </div>
          <div class="col d-flex justify-content-end gap-1 align-items-end">
            <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="$first" (click)="shift($index, -1)" [attr.aria-label]="'core.fields.moveUp' | translate"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
            <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="$last" (click)="shift($index, 1)" [attr.aria-label]="'core.fields.moveDown' | translate"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>
            <button type="button" class="btn btn-outline-danger btn-sm" (click)="remove($index)" [attr.aria-label]="'core.fields.remove' | translate"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
          </div>
        </div>
      </fieldset>
    }
    <button type="button" class="btn btn-outline-primary btn-sm" (click)="add()"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'core.fields.add' | translate }}</button>
  `,
})
export class FieldEditor {
  readonly rows = model.required<FieldRow[]>();
  /** Fields a new field may follow (the type's built-in fields). Leave empty when position is not editable. */
  readonly anchors = input<string[]>([]);

  protected readonly id = `fe-${nextId++}`;
  protected readonly types: readonly FieldType[] = FIELD_TYPES;

  /** A field may follow the built-in fields and the custom fields listed before it, never itself or a later one. */
  protected anchorsFor(index: number): string[] {
    return [...this.anchors(), ...this.rows().slice(0, index).map((r) => r.fieldname.trim()).filter(Boolean)];
  }

  protected patch(index: number, change: Partial<FieldRow>): void {
    this.rows.update((list) => list.map((r, i) => (i === index ? { ...r, ...change } : r)));
  }

  protected add(): void {
    this.rows.update((list) => [...list, blankRow()]);
  }

  protected remove(index: number): void {
    this.rows.update((list) => list.filter((_, i) => i !== index));
  }

  protected shift(index: number, delta: -1 | 1): void {
    this.rows.update((list) => move(list, index, delta));
  }
}
