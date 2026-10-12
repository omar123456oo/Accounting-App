import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ClientsApiService } from '../clients/clients-api.service';
import { OnboardingApiService } from '../clients/onboarding/onboarding-api.service';
import { failure, mockHttpProviders, signInDemo } from '../../testing/test-utils';
import { ApprovalsApiService } from './approvals-api.service';

describe('ApprovalsApiService on the mock API', () => {
  let api: ApprovalsApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: mockHttpProviders() });
    api = TestBed.inject(ApprovalsApiService);
  });

  it('needs workflows.approve to read the inbox', async () => {
    await signInDemo('accountant@demo.test');
    expect((await failure(firstValueFrom(api.list()))).status).toBe(403);
  });

  it('lists onboarding approvals waiting for a decision', async () => {
    await signInDemo('chief@demo.test');
    const page = await firstValueFrom(api.list({ status: 'pending' }));
    expect(page.meta.total).toBe(1);
    expect(page.data[0]).toMatchObject({ id: 'ap-onb-2', kind: 'onboarding', clientId: 'c-007', status: 'pending', requestedBy: 'Demo Accountant' });
  });

  it('approving completes the onboarding and activates the client, applying the same four-eyes and permission rules', async () => {
    await signInDemo('chief@demo.test');
    const item = await firstValueFrom(api.approve('ap-onb-2', 'Verified'));
    expect(item).toMatchObject({ status: 'approved', decidedBy: 'Demo Chief Accountant', comment: 'Verified' });
    expect((await firstValueFrom(TestBed.inject(ClientsApiService).get('c-007'))).status).toBe('active');
    expect((await firstValueFrom(api.list({ status: 'pending' }))).meta.total).toBe(0);
    expect((await firstValueFrom(api.list({ status: 'approved' }))).data.map((i) => i.id)).toEqual(['ap-onb-2']);
    expect((await failure(firstValueFrom(api.approve('ap-onb-2')))).status).toBe(409);
  });

  it('refuses the submitter (403, four-eyes) and unknown items (404)', async () => {
    await signInDemo('owner@demo.test');
    const onboarding = TestBed.inject(OnboardingApiService);
    // Owner takes c-007 back and submits it again, so owner is now the submitter.
    await firstValueFrom(onboarding.reject('c-007', 'Redo the checks'));
    await firstValueFrom(onboarding.setFlags('c-007', { identityVerified: true, engagementAccepted: true }));
    await firstValueFrom(onboarding.advance('c-007', 'verification'));
    await firstValueFrom(onboarding.advance('c-007', 'approval'));
    expect((await failure(firstValueFrom(api.approve('ap-onb-2')))).status).toBe(403);
    expect((await failure(firstValueFrom(api.approve('ap-none')))).status).toBe(404);
  });

  it('rejecting needs a comment and returns the case to document collection', async () => {
    await signInDemo('chief@demo.test');
    const e = await failure(firstValueFrom(api.reject('ap-onb-2', ' ')));
    expect(e.status).toBe(422);
    const item = await firstValueFrom(api.reject('ap-onb-2', 'Missing signature'));
    expect(item).toMatchObject({ status: 'rejected', comment: 'Missing signature' });
    expect((await firstValueFrom(TestBed.inject(OnboardingApiService).get('c-007'))).stage).toBe('document_collection');
  });
});
