import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { clientTestProviders, settle, signInAs } from '../../../testing/test-utils';
import { DocumentList } from './document-list';

@Component({ imports: [DocumentList], template: `<app-document-list [clientId]="clientId" />` })
class Host {
  clientId: string | undefined = undefined;
}

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a];
const EXE = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00];

async function render(email: string, password: string, clientId?: string) {
  TestBed.configureTestingModule({ imports: [Host], providers: clientTestProviders() });
  await signInAs(email, password);
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.clientId = clientId;
  fixture.detectChanges();
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) => Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => (b.textContent ?? '').includes(text));
  return { fixture, el, button };
}
const OWNER: [string, string] = ['owner@demo.test', 'Owner-Demo-123!'];
const ACCOUNTANT: [string, string] = ['accountant@demo.test', 'Accountant-Demo-123!'];

/** Chooses a file the way the browser would; reading its bytes is asynchronous, so wait for that too. */
async function pick(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 30));
}

describe('DocumentList', () => {
  it('lists documents with text review status, client column and an expiry warning that is not colour-only', async () => {
    const { el } = await render(...OWNER);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(el.querySelector('thead')!.textContent).toContain('documents.client');
    expect(el.textContent).toContain('documents.review.pending');
    expect(el.textContent).toContain('documents.expiry.expiring_soon');
    expect(el.textContent).toContain('documents.expiry.expired');
    expect(el.querySelector('.badge[class*="text-bg-warning"] [aria-hidden="true"]')?.textContent).toContain('⚠');
  });

  it('is narrowed to one client when embedded, and also shows that client\'s missing-document requests', async () => {
    const { el } = await render(...OWNER, 'c-001');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(el.querySelector('thead')!.textContent).not.toContain('documents.client');
    expect(el.textContent).toContain('DEMO Bank statement October 2026');
    expect(el.textContent).toContain('documents.requests.overdue');
  });

  it('shows only the assigned clients\' documents to an accountant, with no review buttons', async () => {
    const { el, button } = await render(...ACCOUNTANT);
    expect(el.textContent).not.toContain('DEMO Annual accounts 2025');
    expect(button('documents.approve')).toBeUndefined();
    expect(button('documents.upload')).toBeDefined();
  });

  it('filters on the server by review status', async () => {
    const { fixture, el } = await render(...OWNER);
    const select = el.querySelector<HTMLSelectElement>('#doc-review')!;
    select.value = 'rejected';
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(el.querySelector('tbody')!.textContent).toContain('DEMO Payroll register August');
  });

  it('rejects an executable renamed .pdf in the upload dialog before anything is sent', async () => {
    const { fixture, el, button } = await render(...OWNER, 'c-001');
    button('documents.upload')!.click();
    await settle(fixture);
    const input = el.querySelector<HTMLInputElement>('#up-file')!;
    await pick(input, new File([new Uint8Array(EXE)], 'invoice.pdf', { type: 'application/pdf' }));
    // The signature check reads the file asynchronously; wait for it instead of guessing a delay (slow under load).
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('#up-file-error')!.textContent).toContain('documents.fileError.signature');
    });
    el.querySelector<HTMLFormElement>('app-upload-dialog form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(el.querySelector('app-upload-dialog')).toBeTruthy();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('uploads a genuine PDF, closes the dialog and shows the new document as awaiting review', async () => {
    const { fixture, el, button } = await render(...OWNER, 'c-001');
    button('documents.upload')!.click();
    await settle(fixture);
    await pick(el.querySelector<HTMLInputElement>('#up-file')!, new File([new Uint8Array(PDF)], 'march-statement.pdf', { type: 'application/pdf' }));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector<HTMLInputElement>('#up-name')!.value).toBe('march-statement');
    });
    el.querySelector<HTMLFormElement>('app-upload-dialog form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(el.querySelector('app-upload-dialog')).toBeNull();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(el.querySelector('tbody')!.textContent).toContain('march-statement');
  });

  it('rejecting needs a comment; approving does not', async () => {
    const { fixture, el, button } = await render('chief@demo.test', 'Chief-Demo-123!');
    button('documents.reject')!.click();
    await settle(fixture);
    el.querySelectorAll<HTMLButtonElement>('app-comment-dialog .d-flex.justify-content-end button')[1].click();
    await settle(fixture);
    expect(el.querySelector('app-comment-dialog [role="alert"]')).toBeTruthy();
    el.querySelector<HTMLTextAreaElement>('app-comment-dialog textarea')!.value = 'Unreadable scan';
    el.querySelector('app-comment-dialog textarea')!.dispatchEvent(new Event('input'));
    el.querySelectorAll<HTMLButtonElement>('app-comment-dialog .d-flex.justify-content-end button')[1].click();
    await settle(fixture);
    expect(el.querySelector('app-comment-dialog')).toBeNull();
    expect(el.textContent).toContain('documents.review.rejected');
  });
});
