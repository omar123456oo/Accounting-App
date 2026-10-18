import { Component, computed, inject, input, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { FieldError } from '../../shared/components/field-error/field-error';
import { LanguageService } from '../../core/i18n/language.service';
import { FieldState, activeFields, confidenceOf, needsVerification } from './form-model';
import { DocField, ExtractedField, Lookups } from './smart-docs.models';

const CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR', 'AED', 'GBP'];

/**
 * The form of a document type, built from its field definitions. When an extraction is supplied each field shows what was proposed:
 * a confidence badge, a "check this" highlight, accept and reject, and a link to the source page. Without one it is a plain form.
 */
@Component({
  selector: 'app-smart-doc-fields',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError],
  template: `
    <div [formGroup]="form()">
      @for (f of fields(); track f.key) {
        @let e = extractedOf(f.key);
        @let st = states()[f.key];
        <div class="mb-3 p-2 rounded" [class.border]="highlight(f, e)" [class.border-warning]="highlight(f, e)" [attr.data-field]="f.key">
          <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
            <label class="form-label mb-0" [for]="'f-' + f.key">{{ labelOf(f) }}@if (f.required) { <span aria-hidden="true"> *</span> }</label>
            @if (f.sensitive) { <span class="badge text-bg-secondary">{{ 'smartDocs.fields.sensitive' | translate }}</span> }
            @if (showExtraction() && e) {
              @if (e.masked) { <span class="badge text-bg-secondary">{{ 'smartDocs.fields.masked' | translate }}</span> }
              @else if (e.state === 'not_found') { <span class="badge text-bg-light border">{{ 'smartDocs.fields.notFound' | translate }}</span> }
              @else {
                <span class="badge" [class]="'text-bg-' + tone(e)">{{ 'smartDocs.confidence.' + confidence(e) | translate }}@if (e.confidence !== undefined) { ({{ pct(e) }}) }</span>
                @if (st === 'accepted') { <span class="badge text-bg-success">{{ 'smartDocs.fields.accepted' | translate }}</span> }
                @if (st === 'edited') { <span class="badge text-bg-info">{{ 'smartDocs.fields.edited' | translate }}</span> }
                @if (st === 'rejected') { <span class="badge text-bg-secondary">{{ 'smartDocs.fields.rejected' | translate }}</span> }
              }
            }
          </div>

          @switch (f.type) {
            @case ('textarea') { <textarea class="form-control" rows="3" [id]="'f-' + f.key" [formControlName]="f.key" (input)="touched.emit(f.key)"></textarea> }
            @case ('number') { <input class="form-control" type="number" dir="ltr" [id]="'f-' + f.key" [formControlName]="f.key" (input)="touched.emit(f.key)" /> }
            @case ('date') { <input class="form-control" type="date" dir="ltr" [id]="'f-' + f.key" [formControlName]="f.key" (input)="touched.emit(f.key)" /> }
            @case ('checkbox') { <div class="form-check"><input class="form-check-input" type="checkbox" [id]="'f-' + f.key" [formControlName]="f.key" (change)="touched.emit(f.key)" /></div> }
            @case ('select') {
              <select class="form-select" [id]="'f-' + f.key" [formControlName]="f.key" (change)="touched.emit(f.key)">
                <option [ngValue]="null"></option>
                @for (o of f.options; track o) { <option [value]="o">{{ o }}</option> }
              </select>
            }
            @case ('currency') {
              <div class="input-group" [formGroupName]="f.key">
                <input class="form-control" type="number" step="0.01" dir="ltr" [id]="'f-' + f.key" formControlName="amount" [attr.aria-label]="labelOf(f)" (input)="touched.emit(f.key)" />
                <select class="form-select flex-grow-0 w-auto" formControlName="currency" [attr.aria-label]="'smartDocs.fields.currency' | translate" (change)="touched.emit(f.key)">
                  <option [ngValue]="null"></option>
                  @for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }
                </select>
              </div>
            }
            @case ('reference') {
              <select class="form-select" [id]="'f-' + f.key" [formControlName]="f.key" (change)="touched.emit(f.key)">
                <option [ngValue]="null"></option>
                @for (o of refs(f); track o.id) { <option [value]="o.id">{{ o.name }}</option> }
              </select>
            }
            @default { <input class="form-control" type="text" [id]="'f-' + f.key" [formControlName]="f.key" [attr.dir]="f.format ? 'ltr' : null" (input)="touched.emit(f.key)" /> }
          }
          @if (form().get(f.key); as c) { <app-field-error [control]="c" /> }
          @if (serverErrors()[f.key]; as m) { <div class="invalid-feedback d-block" role="alert">{{ m }}</div> }
          @if (f.format === 'national_id' && form().get(f.key)?.errors?.['nationalId']) { <div class="invalid-feedback d-block" role="alert">{{ 'smartDocs.fields.nationalId' | translate }}</div> }

          @if (showExtraction() && e && e.state !== 'not_found' && !e.masked) {
            @for (i of e.issues; track i) { <div class="small text-warning-emphasis mt-1" role="note"><i class="fa-solid fa-triangle-exclamation me-1" aria-hidden="true"></i>{{ i }}</div> }
            <div class="d-flex flex-wrap gap-2 mt-2 align-items-center">
              <button type="button" class="btn btn-outline-success btn-sm" [disabled]="st === 'accepted'" (click)="accepted.emit(f.key)">{{ 'smartDocs.fields.accept' | translate }}</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="st === 'rejected'" (click)="rejected.emit(f.key)">{{ 'smartDocs.fields.reject' | translate }}</button>
              @if (e.page) { <button type="button" class="btn btn-link btn-sm" (click)="source.emit(f.key)">{{ 'smartDocs.fields.source' | translate: { page: e.page } }}</button> }
            </div>
            @if (e.sourceText) { <blockquote class="small text-body-secondary border-start ps-2 mt-2 mb-0" dir="auto">{{ e.sourceText }}</blockquote> }
          }
        </div>
      }
    </div>
  `,
})
export class SmartDocFields {
  readonly fieldDefs = input.required<DocField[]>();
  readonly form = input.required<FormGroup>();
  readonly extraction = input<ExtractedField[] | null>(null);
  readonly states = input<Record<string, FieldState>>({});
  readonly lookups = input<Lookups | null>(null);
  readonly serverErrors = input<Record<string, string>>({});

  readonly accepted = output<string>();
  readonly rejected = output<string>();
  readonly source = output<string>();
  readonly touched = output<string>();

  protected readonly currencies = CURRENCIES;
  protected readonly fields = computed(() => activeFields(this.fieldDefs()));
  protected readonly showExtraction = computed(() => this.extraction() !== null);
  private readonly lang = inject(LanguageService);

  protected extractedOf(key: string): ExtractedField | undefined { return this.extraction()?.find((x) => x.key === key); }
  protected labelOf(f: DocField): string { return this.lang.current() === 'ar' && f.labelAr ? f.labelAr : f.label; }
  protected highlight(f: DocField, e: ExtractedField | undefined): boolean { return this.showExtraction() && needsVerification(e) && this.states()[f.key] !== 'accepted' && this.states()[f.key] !== 'edited'; }
  protected confidence(e: ExtractedField) { return confidenceOf(e.confidence); }
  protected pct(e: ExtractedField): string { return `${Math.round((e.confidence ?? 0) * 100)}%`; }
  protected tone(e: ExtractedField): string { const c = confidenceOf(e.confidence); return c === 'high' ? 'success' : c === 'medium' ? 'warning' : c === 'low' ? 'danger' : 'secondary'; }
  protected refs(f: DocField): Array<{ id: string; name: string }> {
    const l = this.lookups();
    return !l ? [] : f.referenceKind === 'employee' ? l.employees : f.referenceKind === 'department' ? l.departments : l.users;
  }
}
