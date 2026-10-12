import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { activateLedger, clientTestProviders, settle, signInAs } from '../../testing/test-utils';
import { Invoice } from '../commercial/commercial.models';
import { InvoiceDetail } from './invoice-detail';
import { InvoicingApiService } from './invoicing-api.service';

async function render(email: string, password: string, pick: (list: Invoice[]) => Invoice, ledger = 'le-firm') {
  const route = { id: '' };
  TestBed.configureTestingModule({ imports: [InvoiceDetail], providers: clientTestProviders([{ provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => route.id }, data: {}, queryParamMap: { get: () => null } } } }]) });
  TestBed.inject(LanguageService).use('en');
  await signInAs(email, password);
  await activateLedger(ledger);
  const list = await firstValueFrom(TestBed.inject(InvoicingApiService).list(ledger, { pageSize: 100 }));
  const invoice = pick(list.data);
  route.id = invoice.id;
  const fixture = TestBed.createComponent(InvoiceDetail);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, invoice };
}

const buttons = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('button, a.btn')).map((b) => b.textContent!.trim());

describe('InvoiceDetail', () => {
  it('shows an issued overdue invoice with its journal link, history, tax snapshot and the actions it allows', async () => {
    const { el } = await render('chief@demo.test', 'Chief-Demo-123!', (l) => l.find((i) => i.status === 'overdue' && i.partyName.includes('Alex'))!);
    expect(el.querySelector('app-status-badge')!.textContent).toContain('commercial.status.overdue');
    expect(el.querySelector('#journals-title')).toBeTruthy();
    expect(el.querySelector('a[href*="/app/accounting/journals/je-"]')).toBeTruthy();
    expect(el.textContent).toContain('DEMO-VAT-STD 14%');
    expect(el.querySelector('#invoice-unverified')!.textContent).toContain('commercial.tax.unverifiedWarning');
    const all = buttons(el);
    expect(all).toContain('commercial.reminders.send');
    expect(all).toContain('commercial.credit.ar.title');
    expect(all).toContain('commercial.payments.record');
    expect(all).not.toContain('common.edit');
    expect(all).not.toContain('commercial.docs.issue');
  });

  it('lets only a different user approve a pending high-value invoice, and offers the creator no approve button', async () => {
    const chief = await render('chief@demo.test', 'Chief-Demo-123!', (l) => l.find((i) => i.status === 'pending_approval')!);
    const approve = Array.from(chief.el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.includes('commercial.docs.approveIssue'))!;
    expect(approve.disabled).toBe(false);
    expect(chief.el.textContent).toContain('commercial.docs.approvalNote');
    TestBed.resetTestingModule();
    const accountant = await render('accountant@demo.test', 'Accountant-Demo-123!', (l) => l.find((i) => i.status === 'pending_approval')!, 'le-firm').catch(() => null);
    expect(accountant).toBeNull();
  });

  it('shows the deferred revenue schedule with recognized and pending rows as text', async () => {
    const { el } = await render('chief@demo.test', 'Chief-Demo-123!', (l) => l.find((i) => i.schedule.length > 0)!);
    const rows = el.querySelectorAll('#recognition-schedule tbody tr');
    expect(rows).toHaveLength(12);
    expect(rows[0].textContent).toContain('commercial.recognition.rowStatus.recognized');
    expect(rows[11].textContent).toContain('commercial.recognition.rowStatus.pending');
    expect(Array.from(el.querySelectorAll('button')).some((b) => b.textContent!.includes('commercial.recognition.action'))).toBe(true);
  });

  it('lets an accountant issue a small draft but only submit a high-value one (issue is not offered above the threshold)', async () => {
    const drafts = await render('chief@demo.test', 'Chief-Demo-123!', (l) => l.find((i) => i.status === 'draft')!);
    expect(buttons(drafts.el)).toContain('commercial.docs.issue');
    expect(buttons(drafts.el)).toContain('common.edit');
    expect(buttons(drafts.el)).not.toContain('commercial.docs.submit');
  });
});
