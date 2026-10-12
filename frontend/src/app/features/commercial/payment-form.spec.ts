import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { activateLedger, clientTestProviders, settle, signInAs } from '../../testing/test-utils';
import { InvoicingApiService } from '../invoicing/invoicing-api.service';
import { PaymentForm } from './payment-form';
import { SettlementApiService } from './settlement-api.service';

const LEDGER = 'le-c-001';
const CUSTOMER = 'cu-c-001-retailA';

async function render(query: Record<string, string> = {}, resolve?: () => Promise<Record<string, string>>) {
  TestBed.configureTestingModule({
    imports: [PaymentForm],
    providers: clientTestProviders([{ provide: ActivatedRoute, useValue: { snapshot: { data: { side: 'ar' }, paramMap: { get: () => null }, queryParamMap: { get: (k: string) => query[k] ?? null } } } }]),
  });
  TestBed.inject(LanguageService).use('en');
  await signInAs('accountant@demo.test', 'Accountant-Demo-123!');
  await activateLedger(LEDGER);
  if (resolve) Object.assign(query, await resolve());
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(PaymentForm);
  fixture.detectChanges();
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const type = async (id: string, value: string) => {
    const field = el.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
    field.value = value;
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input'));
    await settle(fixture);
  };
  const submitButton = () => el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  return { fixture, el, type, submitButton, navigate };
}

describe('PaymentForm', () => {
  it('lists the customer open invoices, keeps live totals and blocks over-allocation until it is fixed', async () => {
    const { el, type, submitButton } = await render({ customerId: CUSTOMER });
    expect(el.querySelectorAll('#allocation-table tbody tr')).toHaveLength(1);
    await type('pay-account', 'a-c-001-1120');
    await type('pay-amount', '10000');
    await type('alloc-0', '54000.01');
    expect(el.querySelector('#alloc-err-0')!.textContent).toContain('overDocument');
    expect(submitButton().disabled).toBe(true);
    await type('alloc-0', '4000');
    expect(el.querySelector('#alloc-over')).toBeNull();
    expect(el.querySelector('#alloc-unallocated')!.textContent).toBe('6,000.00');
    expect(el.querySelector('#unapplied-note')!.textContent).toContain('commercial.allocation.becomes.ar');
    expect(submitButton().disabled).toBe(false);
    await type('alloc-0', '10000.01');
    expect(el.querySelector('#alloc-over')).toBeTruthy();
    expect(submitButton().disabled).toBe(true);
  });

  it('records the receipt with the allocation and keeps the rest as an unapplied credit', async () => {
    const { fixture, el, type, submitButton, navigate } = await render({ customerId: CUSTOMER });
    const record = vi.spyOn(TestBed.inject(SettlementApiService), 'recordPayment');
    await type('pay-account', 'a-c-001-1120');
    await type('pay-amount', '5000');
    await type('alloc-0', '3000');
    submitButton().click();
    await settle(fixture);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][2]).toMatchObject({ partyId: CUSTOMER, amount: '5000', allocations: [{ amount: '3000' }] });
    expect(navigate).toHaveBeenCalled();
    const invoices = await firstValueFrom(TestBed.inject(InvoicingApiService).list(LEDGER, { partyId: CUSTOMER }));
    expect(invoices.data.find((i) => i.status === 'partially_paid' || i.status === 'overdue')?.paid).toBe('63000.0000');
    expect(el).toBeTruthy();
  });

  it('keeps record disabled without an amount and shows that the account is required when the form is submitted anyway', async () => {
    const { fixture, el, submitButton } = await render({ customerId: CUSTOMER });
    expect(submitButton().disabled).toBe(true);
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(el.querySelector('#pay-account')!.getAttribute('class')).toContain('is-invalid');
    expect(el.querySelector('#pay-amount')!.getAttribute('class')).toContain('is-invalid');
  });

  it('preselects the invoice and its open balance when the page is opened from that invoice', async () => {
    const { el } = await render({ customerId: CUSTOMER }, async () => {
      const page = await firstValueFrom(TestBed.inject(InvoicingApiService).list(LEDGER, { partyId: CUSTOMER }));
      return { invoiceId: page.data[0].id };
    });
    expect((el.querySelector('#pay-amount') as HTMLInputElement).value).toBe('54000');
    expect((el.querySelector('#alloc-0') as HTMLInputElement).value).toBe('54000');
    expect(el.querySelector('#alloc-unallocated')!.textContent).toBe('0.00');
    expect(el.querySelector('#unapplied-note')).toBeNull();
  });
});
