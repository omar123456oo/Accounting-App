import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ConfirmDialog } from './confirm-dialog';

@Component({
  imports: [ConfirmDialog],
  template: `
    <button id="opener" type="button" (click)="open.set(true)">open</button>
    @if (open()) {
      <app-confirm-dialog title="T" message="M" confirmLabel="Do it" (confirmed)="log.push('yes')" (cancelled)="log.push('no'); open.set(false)" />
    }
  `,
})
class Host {
  readonly open = signal(false);
  readonly log: string[] = [];
}

describe('ConfirmDialog', () => {
  async function setup() {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const opener = el.querySelector<HTMLButtonElement>('#opener')!;
    opener.focus();
    opener.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el, opener };
  }

  it('is a labelled modal that focuses Cancel first', async () => {
    const { el } = await setup();
    const dialog = el.querySelector('[role="alertdialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(el.querySelector(`#${dialog.getAttribute('aria-labelledby')}`)?.textContent).toBe('T');
    expect(document.activeElement?.textContent).toContain('common.cancel');
  });

  it('closes on Escape and returns focus to the opener', async () => {
    const { fixture, el, opener } = await setup();
    el.querySelector('[role="alertdialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.log).toEqual(['no']);
    expect(el.querySelector('app-confirm-dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('keeps Tab inside the dialog', async () => {
    const { el } = await setup();
    const buttons = el.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button');
    buttons[1].focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    buttons[1].dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
  });
});
