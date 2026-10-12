import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { LanguageService } from '../../core/i18n/language.service';
import { activateLedger, clientTestProviders, settle, signInAs } from '../../testing/test-utils';
import { StatementKind, StatementView } from './fs.models';
import { StatementPage } from './statement-page';
import { statementCsv } from './statement-csv';

async function render(kind: StatementKind, ledger = 'le-firm') {
  TestBed.configureTestingModule({
    imports: [StatementPage],
    providers: [...clientTestProviders(), { provide: ActivatedRoute, useValue: { snapshot: { data: { kind }, queryParamMap: convertToParamMap({}) } } }],
  });
  TestBed.inject(LanguageService).use('en');
  await signInAs('chief@demo.test', 'Chief-Demo-123!');
  await activateLedger(ledger);
  const fixture = TestBed.createComponent(StatementPage);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function runWith(el: HTMLElement, from: string, to: string) {
  const set = (id: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  set('fs-from', from);
  set('fs-to', to);
  el.querySelector('form')!.dispatchEvent(new Event('submit'));
}

describe('Statement page', () => {
  it('shows the income statement as posted only, with the not-certified note and a finalized marker', async () => {
    const { fixture, el } = await render('income', 'le-c-009');
    runWith(el, '2026-01-01', '2026-01-31');
    await settle(fixture);
    expect(el.textContent).toContain('fs.notCertified');
    expect(el.textContent).toContain('accounting.reports.postedOnly');
    expect(el.querySelector('#fs-finalized')!.textContent).toContain('fs.finalized');
    expect(el.querySelector('[data-key="net"]')).not.toBeNull();
  });

  it('expands a line to its accounts, each linking to the general ledger', async () => {
    const { fixture, el } = await render('income', 'le-c-009');
    runWith(el, '2026-05-01', '2026-05-31');
    await settle(fixture);
    expect(el.querySelector('#fs-finalized')!.textContent).toContain('fs.notFinalized');
    const row = el.querySelector('[data-key="is.revenue"]')!;
    expect(row.querySelector('[data-col="0"]')!.textContent).toBe('20,000.00');
    row.querySelector<HTMLButtonElement>('button')!.click();
    await settle(fixture);
    const link = el.querySelector<HTMLAnchorElement>('tbody a')!;
    expect(link.getAttribute('href')).toContain('/app/accounting/reports/general-ledger');
    expect(link.getAttribute('href')).toContain('accountId=a-c-009-4200');
  });

  it('states the balance sheet equation in words', async () => {
    const { el } = await render('balance');
    expect(el.querySelector('#fs-check')!.textContent).toContain('fs.check.balance_equation.ok');
    expect(el.querySelector('#fs-check')!.textContent).not.toContain('.bad');
  });

  it('marks a preview that includes unposted entries', async () => {
    const { fixture, el } = await render('income', 'le-c-001');
    const box = el.querySelector<HTMLInputElement>('#fs-unposted')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(el.textContent).toContain('accounting.reports.draftIncluded');
    expect(el.textContent).not.toContain('accounting.reports.postedOnly');
  });

  it('shows comparative, variance and percent columns when a comparative period is chosen', async () => {
    const { fixture, el } = await render('income', 'le-c-009');
    const cmp = el.querySelector<HTMLInputElement>('#fs-compare')!;
    cmp.checked = true;
    cmp.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    for (const [id, v] of [['fs-cfrom', '2026-04-01'], ['fs-cto', '2026-04-30']]) {
      const i = el.querySelector<HTMLInputElement>(`#${id}`)!;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    }
    runWith(el, '2026-05-01', '2026-05-31');
    await settle(fixture);
    expect(el.textContent).toContain('fs.variance');
    expect(el.textContent).toContain('fs.variancePct');
  });
});

describe('Statement CSV', () => {
  it('writes plain exact amounts and neutralises formula cells', () => {
    const view = {
      kind: 'income',
      ledgerEntityId: 'le-x',
      from: '2026-01-01',
      to: '2026-01-31',
      includesUnposted: false,
      finalized: false,
      columns: [{ key: 'amount', labelAr: 'المبلغ', labelEn: 'Amount' }],
      sections: [{ key: 's', labelAr: 'قسم', labelEn: '=SUM(A1)', rows: [{ key: 'r', kind: 'line', labelAr: 'بند', labelEn: '@evil', values: ['1234.5000'] }] }],
      check: { kind: 'none', reconciled: true, difference: '0' },
      defaultedAccounts: 0,
      dimensionFiltered: false,
      templateConfirmed: false,
    } as StatementView;
    const csv = statementCsv(view, 'Ledger', (k) => k, 'en');
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain("'@evil,1234.5");
    expect(csv).toContain('fs.notCertified');
  });
});
