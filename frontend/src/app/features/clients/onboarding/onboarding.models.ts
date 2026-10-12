export const ONBOARDING_STAGES = ['document_collection', 'verification', 'approval', 'completed', 'rejected'] as const;
export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

/** The stages a case moves through, in the only order the server accepts. */
export const STAGE_ORDER = ['document_collection', 'verification', 'approval', 'completed'] as const;
export type AdvanceTarget = Exclude<(typeof STAGE_ORDER)[number], 'document_collection'>;

export const CHECKLIST_STATUSES = ['missing', 'received', 'approved', 'rejected'] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];

export interface ChecklistItem {
  id: string;
  /** Plain text label. For template items `labelKey` gives the translated form. */
  label: string;
  labelKey?: string;
  required: boolean;
  documentId?: string;
  status: ChecklistStatus;
}

export interface WorkflowEvent {
  actorId: string;
  actor: string;
  action: 'started' | 'advanced' | 'rejected';
  from: string;
  to: string;
  at: string;
  comment?: string;
}

export interface OnboardingCase {
  id: string;
  clientId: string;
  stage: OnboardingStage;
  checklist: ChecklistItem[];
  identityVerified: boolean;
  engagementAccepted: boolean;
  history: WorkflowEvent[];
}

/**
 * Starting checklist for a new case. It is an editable template for the office to adapt, not legal advice:
 * which documents Egyptian law or the office's policy actually requires needs confirmation by a specialist.
 */
export const DEFAULT_CHECKLIST_TEMPLATE: ReadonlyArray<Pick<ChecklistItem, 'label' | 'labelKey' | 'required'>> = [
  { label: 'Commercial register', labelKey: 'onboarding.template.commercialRegister', required: true },
  { label: 'Tax card', labelKey: 'onboarding.template.taxCard', required: true },
  { label: 'ID of the authorized representative', labelKey: 'onboarding.template.representativeId', required: true },
  { label: 'Signed engagement letter', labelKey: 'onboarding.template.engagementLetter', required: true },
];

/** Status changes the server allows for one checklist item. */
export const CHECKLIST_TRANSITIONS: Record<ChecklistStatus, readonly ChecklistStatus[]> = {
  missing: ['received'],
  received: ['approved', 'rejected', 'missing'],
  approved: ['rejected'],
  rejected: ['received', 'missing'],
};
