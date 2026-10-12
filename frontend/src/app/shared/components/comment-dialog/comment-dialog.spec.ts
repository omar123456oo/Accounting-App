import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { CommentDialog } from './comment-dialog';

@Component({
  imports: [CommentDialog],
  template: `<app-comment-dialog title="T" label="Reason" confirmLabel="Go" [required]="required" (confirmed)="got = $event" (cancelled)="cancelled = true" />`,
})
class Host {
  required = true;
  got: string | null = null;
  cancelled = false;
}

function render(required: boolean) {
  TestBed.configureTestingModule({ imports: [Host], providers: [provideTranslateService()] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.required = required;
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const type = (text: string) => {
    const area = el.querySelector('textarea')!;
    area.value = text;
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const confirm = () => {
    el.querySelectorAll<HTMLButtonElement>('.card-body .d-flex.justify-content-end button')[1].click();
    fixture.detectChanges();
  };
  return { fixture, el, type, confirm };
}

describe('CommentDialog', () => {
  it('will not confirm an empty comment when one is required, and says why', () => {
    const { fixture, el, confirm } = render(true);
    confirm();
    expect(fixture.componentInstance.got).toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeTruthy();
    expect(el.querySelector('textarea')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('confirms with the trimmed comment', () => {
    const { fixture, type, confirm } = render(true);
    type('  Because  ');
    confirm();
    expect(fixture.componentInstance.got).toBe('Because');
  });

  it('allows an empty comment when optional, closes on Esc and returns focus is handled by the modal', () => {
    const { fixture, el, confirm } = render(false);
    confirm();
    expect(fixture.componentInstance.got).toBe('');
    el.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(fixture.componentInstance.cancelled).toBe(true);
  });

  it('is a labelled modal dialog', () => {
    const { el } = render(true);
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(el.querySelector(`#${dialog.getAttribute('aria-labelledby')}`)?.textContent).toBe('T');
    expect(el.querySelector('label')?.textContent).toContain('Reason');
  });
});
