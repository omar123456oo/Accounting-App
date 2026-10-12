import { TestBed } from '@angular/core/testing';
import { clientTestProviders, settle, signInAs } from '../../testing/test-utils';
import { WorkSummary } from './work-summary';

async function render(email: string, password: string) {
  TestBed.configureTestingModule({ imports: [WorkSummary], providers: clientTestProviders() });
  await signInAs(email, password);
  const fixture = TestBed.createComponent(WorkSummary);
  fixture.detectChanges();
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const count = (key: string) => el.querySelector(`#work-${key}`)?.textContent?.trim();
  return { el, count };
}

describe('WorkSummary', () => {
  it('shows real counts from the task, approval and document APIs', async () => {
    const { count } = await render('owner@demo.test', 'Owner-Demo-123!');
    expect(count('openTasks')).toBe('2');
    expect(count('overdueTasks')).toBe('0');
    expect(count('pendingApprovals')).toBe('1');
    expect(count('documentsToReview')).toBe('4');
  });

  it('shows only the cards a user may see, and counts only what that user is scoped to', async () => {
    const { el, count } = await render('accountant@demo.test', 'Accountant-Demo-123!');
    expect(count('openTasks')).toBe('3');
    expect(count('overdueTasks')).toBe('1');
    expect(el.querySelector('#work-pendingApprovals')).toBeNull();
    expect(count('documentsToReview')).toBe('3');
  });

  it('says plainly when there is nothing to show for the role', async () => {
    const { el } = await render('client@demo.test', 'Client-Demo-123!');
    expect(el.textContent).toContain('dashboard.work.none');
  });

  it('shows an explicit zero rather than hiding an empty count', async () => {
    const { el, count } = await render('owner@demo.test', 'Owner-Demo-123!');
    expect(count('overdueTasks')).toBe('0');
    expect(el.textContent).toContain('dashboard.work.nothing');
  });
});
