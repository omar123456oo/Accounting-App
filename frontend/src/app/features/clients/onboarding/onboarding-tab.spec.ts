import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { clientTestProviders, settle, signInAs } from '../../../testing/test-utils';
import { ClientStatus } from '../client.models';
import { OnboardingApiService } from './onboarding-api.service';
import { OnboardingTab } from './onboarding-tab';

@Component({ imports: [OnboardingTab], template: `<app-onboarding-tab [clientId]="id" [clientStatus]="status" (clientChanged)="changes.set(changes() + 1)" />` })
class Host {
  id = 'c-003';
  status: ClientStatus = 'onboarding';
  changes = signal(0);
}

const OWNER = ['owner@demo.test', 'Owner-Demo-123!'] as const;
const CHIEF = ['chief@demo.test', 'Chief-Demo-123!'] as const;

async function render(id: string, status: ClientStatus, user: readonly [string, string] = OWNER) {
  TestBed.configureTestingModule({ imports: [Host], providers: clientTestProviders() });
  await signInAs(...user);
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.id = id;
  fixture.componentInstance.status = status;
  fixture.detectChanges();
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const buttons = () => Array.from(el.querySelectorAll<HTMLButtonElement>('button'));
  const button = (text: string) => buttons().find((b) => (b.textContent ?? '').includes(text));
  return { fixture, el, button };
}

describe('OnboardingTab', () => {
  it('shows the stages, the editable-template note and one row per checklist item with text statuses', async () => {
    const { el } = await render('c-003', 'onboarding');
    expect(el.querySelectorAll('ol li')).toHaveLength(4);
    expect(el.querySelector('ol li.fw-bold')?.textContent).toContain('onboarding.stage.document_collection');
    expect(el.textContent).toContain('onboarding.templateNote');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(el.querySelector('tbody')!.textContent).toContain('onboarding.itemStatus.approved');
    expect(el.querySelector('tbody')!.textContent).toContain('onboarding.itemStatus.missing');
  });

  it('offers to start a case for a lead, then shows the default checklist', async () => {
    const { fixture, el, button } = await render('c-004', 'lead');
    expect(el.textContent).toContain('onboarding.none');
    button('onboarding.start')!.click();
    await settle(fixture);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(fixture.componentInstance.changes()).toBe(1);
  });

  it('does not offer to start for an active client', async () => {
    const { el, button } = await render('c-001', 'active');
    expect(el.textContent).toContain('onboarding.none');
    expect(button('onboarding.start')).toBeUndefined();
  });

  it('shows the server reason when the API refuses to skip ahead', async () => {
    const { fixture, el, button } = await render('c-003', 'onboarding');
    button('onboarding.actions.toVerification')!.click();
    await settle(fixture);
    expect(el.querySelector('.alert-danger[role="alert"]')).toBeTruthy();
    expect(el.querySelector('ol li.fw-bold')?.textContent).toContain('onboarding.stage.document_collection');
  });

  it('lets an approver other than the submitter approve, which activates the client', async () => {
    const { fixture, el, button } = await render('c-007', 'onboarding', CHIEF);
    const approve = button('onboarding.actions.approve')!;
    expect(approve.disabled).toBe(false);
    approve.click();
    await settle(fixture);
    el.querySelectorAll<HTMLButtonElement>('app-comment-dialog .d-flex.justify-content-end button')[1].click();
    await settle(fixture);
    expect(el.textContent).toContain('onboarding.completedNote');
    expect(fixture.componentInstance.changes()).toBe(1);
  });

  it('disables approval for the person who submitted the verification (four-eyes) and says why', async () => {
    TestBed.configureTestingModule({ imports: [Host], providers: clientTestProviders() });
    await signInAs(...OWNER);
    const api = TestBed.inject(OnboardingApiService);
    await firstValueFrom(api.reject('c-007', 'Redo'));
    await firstValueFrom(api.setFlags('c-007', { identityVerified: true, engagementAccepted: true }));
    await firstValueFrom(api.advance('c-007', 'verification'));
    await firstValueFrom(api.advance('c-007', 'approval'));
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.id = 'c-007';
    fixture.detectChanges();
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const approve = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('onboarding.actions.approve'))!;
    expect(approve.disabled).toBe(true);
    expect(el.textContent).toContain('onboarding.fourEyesNote');
  });

  it('requires a comment to send the case back', async () => {
    const { fixture, el, button } = await render('c-007', 'onboarding', CHIEF);
    button('onboarding.actions.reject')!.click();
    await settle(fixture);
    el.querySelectorAll<HTMLButtonElement>('app-comment-dialog .d-flex.justify-content-end button')[1].click();
    await settle(fixture);
    expect(el.querySelector('app-comment-dialog [role="alert"]')).toBeTruthy();
    expect(el.querySelector('ol li.fw-bold')?.textContent).toContain('onboarding.stage.approval');
  });
});
