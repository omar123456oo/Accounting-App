import { TestBed } from '@angular/core/testing';
import { clientTestProviders, settle, signInAs } from '../../../testing/test-utils';
import { ApprovalsInbox } from './approvals-inbox';

async function render(email: string, password: string) {
  TestBed.configureTestingModule({ imports: [ApprovalsInbox], providers: clientTestProviders() });
  await signInAs(email, password);
  const fixture = TestBed.createComponent(ApprovalsInbox);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('ApprovalsInbox', () => {
  it('lists the pending onboarding approval with text status and decision buttons', async () => {
    const { el } = await render('chief@demo.test', 'Chief-Demo-123!');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(el.querySelector('tbody')!.textContent).toContain('DEMO مصنع الدلتا للأغذية');
    expect(el.querySelector('tbody')!.textContent).toContain('approvals.status.pending');
    expect(el.textContent).toContain('approvals.kinds.onboarding');
  });

  it('approving empties the pending list and shows an honest empty state', async () => {
    const { fixture, el } = await render('chief@demo.test', 'Chief-Demo-123!');
    el.querySelector<HTMLButtonElement>('tbody button.btn-success')!.click();
    await settle(fixture);
    el.querySelectorAll<HTMLButtonElement>('app-comment-dialog .d-flex.justify-content-end button')[1].click();
    await settle(fixture);
    expect(el.querySelector('tbody')).toBeNull();
    expect(el.textContent).toContain('approvals.empty');
  });

  it('rejecting requires a comment', async () => {
    const { fixture, el } = await render('chief@demo.test', 'Chief-Demo-123!');
    el.querySelector<HTMLButtonElement>('tbody button.btn-outline-danger')!.click();
    await settle(fixture);
    el.querySelectorAll<HTMLButtonElement>('app-comment-dialog .d-flex.justify-content-end button')[1].click();
    await settle(fixture);
    expect(el.querySelector('app-comment-dialog [role="alert"]')).toBeTruthy();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('shows a load error to a user without workflows.approve instead of data', async () => {
    const { el } = await render('accountant@demo.test', 'Accountant-Demo-123!');
    expect(el.querySelector('tbody')).toBeNull();
    expect(el.querySelector('.alert-danger')).toBeTruthy();
  });
});
