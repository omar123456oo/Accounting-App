import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { failure, mockHttpProviders, signInDemo } from '../../../testing/test-utils';
import { ClientsApiService } from '../clients-api.service';
import { OnboardingApiService } from './onboarding-api.service';
import { OnboardingCase } from './onboarding.models';

describe('OnboardingApiService on the mock API', () => {
  let api: OnboardingApiService;
  let clients: ClientsApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: mockHttpProviders() });
    api = TestBed.inject(OnboardingApiService);
    clients = TestBed.inject(ClientsApiService);
  });

  const get = (id: string) => firstValueFrom(api.get(id));

  /** Moves the seeded c-003 case to the approval stage as the given user. */
  async function submitC003(): Promise<OnboardingCase> {
    const c = await get('c-003');
    for (const item of c.checklist) {
      if (item.status === 'missing') await firstValueFrom(api.updateItem('c-003', item.id, { status: 'received' }));
    }
    for (const item of (await get('c-003')).checklist) {
      if (item.status === 'received') await firstValueFrom(api.updateItem('c-003', item.id, { status: 'approved' }));
    }
    await firstValueFrom(api.setFlags('c-003', { identityVerified: true, engagementAccepted: true }));
    await firstValueFrom(api.advance('c-003', 'verification'));
    return firstValueFrom(api.advance('c-003', 'approval'));
  }

  it('needs a permission (403) and hides clients the user is not assigned to (404)', async () => {
    await signInDemo('client@demo.test');
    expect((await failure(get('c-003'))).status).toBe(403);
    await signInDemo('accountant@demo.test');
    expect((await get('c-003')).stage).toBe('document_collection');
    expect((await failure(get('c-007'))).status).toBe(404);
    expect((await failure(get('c-004'))).status).toBe(404);
  });

  it('starts a case for a lead from the default template and moves the client to onboarding', async () => {
    await signInDemo('owner@demo.test');
    expect((await failure(get('c-004'))).status).toBe(404);
    const started = await firstValueFrom(api.start('c-004'));
    expect(started.stage).toBe('document_collection');
    expect(started.checklist.map((i) => i.labelKey)).toEqual([
      'onboarding.template.commercialRegister',
      'onboarding.template.taxCard',
      'onboarding.template.representativeId',
      'onboarding.template.engagementLetter',
    ]);
    expect(started.checklist.every((i) => i.status === 'missing' && i.required)).toBe(true);
    expect((await firstValueFrom(clients.get('c-004'))).status).toBe('onboarding');
    expect((await failure(firstValueFrom(api.start('c-004')))).status).toBe(409);
    expect((await failure(firstValueFrom(api.start('c-001')))).status).toBe(409);
  });

  it('refuses to skip stages with 422', async () => {
    await signInDemo('owner@demo.test');
    for (const to of ['approval', 'completed', 'rejected', 'nonsense']) {
      const e = await failure(firstValueFrom(api.advance('c-003', to as 'approval')));
      expect(e.status).toBe(422);
      expect(e.error.errors.to).toBeTruthy();
    }
    expect((await get('c-003')).stage).toBe('document_collection');
  });

  it('needs every required item received before verification, and approved plus identity before approval', async () => {
    await signInDemo('owner@demo.test');
    const early = await failure(firstValueFrom(api.advance('c-003', 'verification')));
    expect(early.status).toBe(422);
    const c = await get('c-003');
    for (const item of c.checklist.filter((i) => i.status === 'missing')) {
      await firstValueFrom(api.updateItem('c-003', item.id, { status: 'received' }));
    }
    await firstValueFrom(api.advance('c-003', 'verification'));
    const notApproved = await failure(firstValueFrom(api.advance('c-003', 'approval')));
    expect(notApproved.status).toBe(422);
    for (const item of (await get('c-003')).checklist.filter((i) => i.status === 'received')) {
      await firstValueFrom(api.updateItem('c-003', item.id, { status: 'approved' }));
    }
    const noIdentity = await failure(firstValueFrom(api.advance('c-003', 'approval')));
    expect(noIdentity.status).toBe(422);
    expect(noIdentity.error.errors.identityVerified).toBeTruthy();
  });

  it('rejects illegal checklist status changes with 422', async () => {
    await signInDemo('owner@demo.test');
    const missing = (await get('c-003')).checklist.find((i) => i.status === 'missing')!;
    const e = await failure(firstValueFrom(api.updateItem('c-003', missing.id, { status: 'approved' })));
    expect(e.status).toBe(422);
  });

  it('enforces four-eyes: the submitter cannot approve, a different approver can, and the client becomes active', async () => {
    await signInDemo('owner@demo.test');
    const submitted = await submitC003();
    expect(submitted.stage).toBe('approval');
    const self = await failure(firstValueFrom(api.advance('c-003', 'completed')));
    expect(self.status).toBe(403);
    expect((await firstValueFrom(clients.get('c-003'))).status).toBe('onboarding');

    await signInDemo('chief@demo.test');
    const done = await firstValueFrom(api.advance('c-003', 'completed', 'Looks complete'));
    expect(done.stage).toBe('completed');
    expect(done.history.at(-1)).toMatchObject({ actorId: 'u-chief', from: 'approval', to: 'completed', comment: 'Looks complete' });
    expect((await firstValueFrom(clients.get('c-003'))).status).toBe('active');
  });

  it('requires clients.approve_onboarding to complete', async () => {
    await signInDemo('accountant@demo.test');
    const c = await get('c-003');
    expect(c.stage).toBe('document_collection');
    await signInDemo('owner@demo.test');
    await submitC003();
    await signInDemo('accountant@demo.test');
    expect((await failure(firstValueFrom(api.advance('c-003', 'completed')))).status).toBe(403);
  });

  it('answers 409 when the client status no longer allows activation', async () => {
    await signInDemo('owner@demo.test');
    await firstValueFrom(clients.changeStatus('c-007', 'closed'));
    await signInDemo('chief@demo.test');
    const e = await failure(firstValueFrom(api.advance('c-007', 'completed')));
    expect(e.status).toBe(409);
  });

  it('reject needs a comment, returns to document collection and clears the verification flags', async () => {
    await signInDemo('chief@demo.test');
    const noComment = await failure(firstValueFrom(api.reject('c-007', '  ')));
    expect(noComment.status).toBe(422);
    expect(noComment.error.errors.comment).toBeTruthy();
    const back = await firstValueFrom(api.reject('c-007', 'Representative ID is expired'));
    expect(back.stage).toBe('document_collection');
    expect(back.identityVerified).toBe(false);
    expect(back.history.at(-1)).toMatchObject({ action: 'rejected', from: 'approval', to: 'document_collection', comment: 'Representative ID is expired' });
    expect((await failure(firstValueFrom(api.reject('c-007', 'again')))).status).toBe(422);
  });

  it('lets the office edit the checklist only while collecting documents', async () => {
    await signInDemo('owner@demo.test');
    const added = await firstValueFrom(api.addItem('c-003', { label: 'Lease contract', required: false }));
    const item = added.checklist.find((i) => i.label === 'Lease contract')!;
    expect(item).toMatchObject({ required: false, status: 'missing' });
    expect((await firstValueFrom(api.removeItem('c-003', item.id))).checklist.some((i) => i.id === item.id)).toBe(false);
    expect((await failure(firstValueFrom(api.addItem('c-003', { label: '', required: true })))).status).toBe(422);
    expect((await failure(firstValueFrom(api.addItem('c-007', { label: 'Late item', required: true })))).status).toBe(422);
  });
});
