import { CLIENT_STATUSES, ClientStatus } from './client.models';

/** lead -> onboarding -> active, active <-> suspended, any -> closed (closed is terminal). */
const TRANSITIONS: Record<ClientStatus, readonly ClientStatus[]> = {
  lead: ['onboarding', 'closed'],
  onboarding: ['active', 'closed'],
  active: ['suspended', 'closed'],
  suspended: ['active', 'closed'],
  closed: [],
};

export function legalTransitions(from: ClientStatus): readonly ClientStatus[] {
  return TRANSITIONS[from];
}

export function isLegalTransition(from: ClientStatus, to: ClientStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isClientStatus(value: unknown): value is ClientStatus {
  return (CLIENT_STATUSES as readonly unknown[]).includes(value);
}
