import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { clientTestProviders, settle, signInAs } from '../../../testing/test-utils';
import { TaskDetail } from './task-detail';

async function render(id: string) {
  TestBed.configureTestingModule({
    imports: [TaskDetail],
    providers: clientTestProviders([{ provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id })) } }]),
  });
  await signInAs('accountant@demo.test', 'Accountant-Demo-123!');
  const fixture = TestBed.createComponent(TaskDetail);
  fixture.detectChanges();
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) => Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => (b.textContent ?? '').includes(text));
  return { fixture, el, button };
}

describe('TaskDetail', () => {
  it('shows the task, its dependencies with their status, the overdue badge and the history', async () => {
    const { el } = await render('t-001');
    expect(el.querySelector('h1')!.textContent).toContain('DEMO Prepare the September VAT return');
    expect(el.textContent).toContain('tasks.overdue');
    expect(el.textContent).toContain('DEMO Collect the bank statements');
    expect(el.textContent).toContain('tasks.event.created');
  });

  it('shows the server\'s reason when finishing is refused because a dependency is open', async () => {
    const { fixture, el, button } = await render('t-001');
    const done = Array.from(el.querySelectorAll<HTMLButtonElement>('.d-inline-flex button.btn-outline-primary'));
    expect(done.length).toBe(4);
    // The buttons follow TASK_STATUSES without the current one: in_progress, blocked, done, cancelled.
    done[2].click();
    await settle(fixture);
    expect(el.querySelector('.alert-danger[role="alert"]')).toBeTruthy();
    expect(el.textContent).toContain('tasks.status.todo');
  });

  it('will not reassign without a reason', async () => {
    const { fixture, el } = await render('t-006');
    const select = el.querySelector<HTMLSelectElement>('#re-assignee')!;
    select.value = 'u-chief';
    select.dispatchEvent(new Event('change'));
    el.querySelector<HTMLFormElement>('form[aria-label="tasks.reassign"]')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(el.querySelector('#re-reason')!.classList.contains('is-invalid')).toBe(true);
    expect(el.textContent).not.toContain('tasks.event.reassigned');
    const reason = el.querySelector<HTMLInputElement>('#re-reason')!;
    reason.value = 'Annual leave';
    reason.dispatchEvent(new Event('input'));
    el.querySelector<HTMLFormElement>('form[aria-label="tasks.reassign"]')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(el.textContent).toContain('tasks.event.reassigned');
    expect(el.textContent).toContain('Annual leave');
  });

  it('shows not-found for a task outside the user\'s scope', async () => {
    const { el } = await render('t-007');
    expect(el.textContent).toContain('tasks.notFound');
  });
});
