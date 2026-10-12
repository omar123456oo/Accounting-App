import { CLIENT_STATUSES } from './client.models';
import { isLegalTransition, legalTransitions } from './client-status';

describe('client status transitions', () => {
  it('follows lead -> onboarding -> active, active <-> suspended, any -> closed', () => {
    expect(legalTransitions('lead')).toEqual(['onboarding', 'closed']);
    expect(legalTransitions('onboarding')).toEqual(['active', 'closed']);
    expect(legalTransitions('active')).toEqual(['suspended', 'closed']);
    expect(legalTransitions('suspended')).toEqual(['active', 'closed']);
  });

  it('treats closed as terminal', () => {
    expect(legalTransitions('closed')).toEqual([]);
  });

  it('never allows skipping a stage or a no-op', () => {
    expect(isLegalTransition('lead', 'active')).toBe(false);
    expect(isLegalTransition('onboarding', 'suspended')).toBe(false);
    for (const s of CLIENT_STATUSES) expect(isLegalTransition(s, s)).toBe(false);
  });
});
