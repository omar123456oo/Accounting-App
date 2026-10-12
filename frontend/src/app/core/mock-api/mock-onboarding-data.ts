import { OnboardingCase } from '../../features/clients/onboarding/onboarding.models';

/** DEMO ONLY. Two fictional cases for the seeded clients c-003 (collecting documents) and c-007 (waiting for approval). */
export function seedOnboardingCases(): OnboardingCase[] {
  return [
    {
      id: 'onb-1',
      clientId: 'c-003',
      stage: 'document_collection',
      checklist: [
        { id: 'ci-1', label: 'Commercial register', labelKey: 'onboarding.template.commercialRegister', required: true, status: 'approved', documentId: 'd-001' },
        { id: 'ci-2', label: 'Tax card', labelKey: 'onboarding.template.taxCard', required: true, status: 'received', documentId: 'd-002' },
        { id: 'ci-3', label: 'ID of the authorized representative', labelKey: 'onboarding.template.representativeId', required: true, status: 'missing' },
        { id: 'ci-4', label: 'Signed engagement letter', labelKey: 'onboarding.template.engagementLetter', required: true, status: 'missing' },
      ],
      identityVerified: false,
      engagementAccepted: false,
      history: [{ actorId: 'u-accountant', actor: 'Demo Accountant', action: 'started', from: 'none', to: 'document_collection', at: '2026-10-01T08:00:00.000Z' }],
    },
    {
      id: 'onb-2',
      clientId: 'c-007',
      stage: 'approval',
      checklist: [
        { id: 'ci-5', label: 'Commercial register', labelKey: 'onboarding.template.commercialRegister', required: true, status: 'approved' },
        { id: 'ci-6', label: 'Tax card', labelKey: 'onboarding.template.taxCard', required: true, status: 'approved' },
        { id: 'ci-7', label: 'ID of the authorized representative', labelKey: 'onboarding.template.representativeId', required: true, status: 'approved' },
        { id: 'ci-8', label: 'Signed engagement letter', labelKey: 'onboarding.template.engagementLetter', required: true, status: 'approved' },
      ],
      identityVerified: true,
      engagementAccepted: true,
      history: [
        { actorId: 'u-accountant', actor: 'Demo Accountant', action: 'started', from: 'none', to: 'document_collection', at: '2026-09-28T08:00:00.000Z' },
        { actorId: 'u-accountant', actor: 'Demo Accountant', action: 'advanced', from: 'document_collection', to: 'verification', at: '2026-09-30T08:00:00.000Z' },
        { actorId: 'u-accountant', actor: 'Demo Accountant', action: 'advanced', from: 'verification', to: 'approval', at: '2026-10-05T08:00:00.000Z' },
      ],
    },
  ];
}
