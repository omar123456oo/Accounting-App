import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../core/i18n/language.service';
import { OpenDoc } from './allocation';
import { AllocationTable } from './allocation-table';

const docs: OpenDoc[] = [
  { id: 'a', reference: 'INV-1', dueDate: '2026-09-01', balance: '600.0000' },
  { id: 'b', reference: 'INV-2', dueDate: '2026-08-01', balance: '400.5000' },
];

@Component({
  imports: [AllocationTable],
  template: `<app-allocation-table [docs]="docs" [values]="values()" [capacity]="capacity()" (valuesChange)="values.set($event)" />`,
})
class Host {
  readonly docs = docs;
  readonly values = signal<Record<string, string>>({});
  readonly capacity = signal('1000');
}

async function render() {
  TestBed.configureTestingModule({ imports: [Host], providers: [provideTranslateService()] });
  TestBed.inject(LanguageService).use('en');
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
}

function type(fixture: { detectChanges(): void }, el: HTMLElement, id: string, value: string) {
  const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('AllocationTable', () => {
  it('shows live allocated, unallocated and per-document remaining amounts', async () => {
    const { fixture, el } = await render();
    expect(el.querySelector('#alloc-unallocated')!.textContent).toBe('1,000.00');
    type(fixture, el, 'alloc-0', '250.25');
    type(fixture, el, 'alloc-1', '100');
    expect(el.querySelector('#alloc-total')!.textContent).toBe('350.25');
    expect(el.querySelector('#alloc-unallocated')!.textContent).toBe('649.75');
    expect(el.querySelector('#alloc-remaining-0')!.textContent).toBe('349.75');
    expect(el.querySelector('#alloc-remaining-1')!.textContent).toBe('300.50');
    expect(el.querySelector('#alloc-over')).toBeNull();
  });

  it('states over-allocation of a document and of the payment in text, with an alert', async () => {
    const { fixture, el, host } = await render();
    type(fixture, el, 'alloc-0', '600.01');
    expect(el.querySelector('#alloc-err-0')!.textContent).toContain('commercial.allocation.problem.overDocument');
    expect(el.querySelector('#alloc-0')!.getAttribute('aria-invalid')).toBe('true');
    host.capacity.set('500');
    type(fixture, el, 'alloc-0', '600');
    type(fixture, el, 'alloc-1', '400.5');
    expect(el.querySelector('#alloc-over')!.textContent).toContain('commercial.allocation.overCapacity');
    expect(el.querySelector('#alloc-unallocated')!.textContent).toBe('-500.50');
  });

  it('allocates the oldest document first with one click and clears again', async () => {
    const { fixture, el, host } = await render();
    host.capacity.set('450');
    fixture.detectChanges();
    const buttons = el.querySelectorAll<HTMLButtonElement>('button');
    buttons[0].click();
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#alloc-1')!.value).toBe('400.5000');
    expect(el.querySelector<HTMLInputElement>('#alloc-0')!.value).toBe('49.5000');
    expect(el.querySelector('#alloc-unallocated')!.textContent).toBe('0.00');
    buttons[1].click();
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('#alloc-0')!.value).toBe('');
  });
});
