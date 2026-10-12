import { TestBed } from '@angular/core/testing';
import { clientTestProviders, settle, signInAs } from '../../../testing/test-utils';
import { TaskList } from './task-list';

async function render(email: string, password: string) {
  TestBed.configureTestingModule({ imports: [TaskList], providers: clientTestProviders() });
  await signInAs(email, password);
  const fixture = TestBed.createComponent(TaskList);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('TaskList', () => {
  it('shows my open tasks with an overdue badge made of an icon and text', async () => {
    const { el } = await render('accountant@demo.test', 'Accountant-Demo-123!');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(3);
    const overdue = el.querySelectorAll('tbody .badge.text-bg-danger');
    expect(overdue).toHaveLength(1);
    expect(overdue[0].textContent).toContain('tasks.overdue');
    expect(overdue[0].querySelector('[aria-hidden="true"]')?.textContent).toContain('⚠');
    expect(el.querySelector('a[href="/app/tasks/new"]')).toBeTruthy();
  });

  it('switches to all visible tasks and filters to overdue only', async () => {
    const { fixture, el } = await render('owner@demo.test', 'Owner-Demo-123!');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    const scope = el.querySelector<HTMLSelectElement>('#task-scope')!;
    scope.value = 'all';
    scope.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(el.querySelectorAll('tbody tr').length).toBeGreaterThan(2);
    const overdue = el.querySelector<HTMLInputElement>('#task-overdue')!;
    overdue.checked = true;
    overdue.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(el.textContent).toContain('tasks.overdue');
  });

  it('shows the empty state when nothing matches', async () => {
    const { fixture, el } = await render('accountant@demo.test', 'Accountant-Demo-123!');
    const q = el.querySelector<HTMLInputElement>('#task-q')!;
    q.value = 'no-such-task';
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(el.textContent).toContain('tasks.empty');
  });
});
