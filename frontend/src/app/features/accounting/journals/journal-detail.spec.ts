import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LanguageService } from '../../../core/i18n/language.service';
import { activateLedger, clientTestProviders, settle, signInAs } from '../../../testing/test-utils';
import { JournalEntry } from '../accounting.models';
import { JournalsApiService } from '../journals-api.service';
import { JournalDetail } from './journal-detail';

async function render(email: string, password: string, pick: (list: JournalEntry[]) => JournalEntry) {
  const route = { id: '' };
  TestBed.configureTestingModule({
    imports: [JournalDetail],
    providers: clientTestProviders([{ provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => route.id } } } }]),
  });
  TestBed.inject(LanguageService).use('en');
  await signInAs(email, password);
  await activateLedger('le-c-001');
  const list = await firstValueFrom(TestBed.inject(JournalsApiService).list('le-c-001', { pageSize: 100 }));
  const entry = pick(list.data);
  route.id = entry.id;
  const fixture = TestBed.createComponent(JournalDetail);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, entry };
}

const buttons = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLButtonElement>('button')).map((b) => b.textContent!.trim());

describe('JournalDetail', () => {
  it('shows the timeline with actor, action and outcome for a posted entry, and offers reversal to a poster', async () => {
    const { el } = await render('chief@demo.test', 'Chief-Demo-123!', (l) => l.find((e) => e.status === 'posted')!);
    expect(el.querySelectorAll('ol li')).toHaveLength(4);
    expect(el.querySelector('ol')!.textContent).toContain('accounting.events.posted');
    expect(el.querySelector('ol')!.textContent).toContain('Demo Chief Accountant');
    expect(buttons(el)).toContain('accounting.journals.reverse.title');
    expect(buttons(el)).not.toContain('accounting.journals.post');
  });

  it('lets an approver approve a pending entry, but the creator only sees a four-eyes note', async () => {
    const chief = await render('chief@demo.test', 'Chief-Demo-123!', (l) => l.find((e) => e.status === 'pending_approval')!);
    const approve = Array.from(chief.el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.includes('accounting.journals.approve'))!;
    expect(approve.disabled).toBe(false);
    TestBed.resetTestingModule();
    const accountant = await render('accountant@demo.test', 'Accountant-Demo-123!', (l) => l.find((e) => e.status === 'pending_approval')!);
    expect(buttons(accountant.el).some((b) => b.includes('accounting.journals.approve'))).toBe(false);
  });

  it('disables the actions while a request is in flight, then shows the new status', async () => {
    const { fixture, el } = await render('chief@demo.test', 'Chief-Demo-123!', (l) => l.find((e) => e.status === 'pending_approval' && e.createdBy === 'u-accountant')!);
    const approve = Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.includes('accounting.journals.approve'))!;
    approve.click();
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('app-comment-dialog .btn-primary')!.click();
    await settle(fixture);
    expect(el.querySelector('app-status-badge')!.textContent).toContain('accounting.status.approved');
    expect(buttons(el)).toContain('accounting.journals.post');
  });
});
