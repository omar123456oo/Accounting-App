import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { ClientsApiService } from '../clients-api.service';
import { clientTestProviders, settle, signInAs } from '../clients-test-utils';
import { ClientForm } from './client-form';

async function render() {
  TestBed.configureTestingModule({ imports: [ClientForm], providers: clientTestProviders() });
  await signInAs('owner@demo.test', 'Owner-Demo-123!');
  const fixture = TestBed.createComponent(ClientForm);
  fixture.detectChanges();
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const type = (id: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const submit = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
  };
  return { fixture, el, type, submit, api: TestBed.inject(ClientsApiService), component: fixture.componentInstance };
}

describe('ClientForm', () => {
  it('labels its fields and blocks submit while required fields are empty', async () => {
    const { el, submit, api } = await render();
    const create = vi.spyOn(api, 'create');
    expect(el.querySelector('label[for="legalName"]')).toBeTruthy();
    await submit();
    expect(create).not.toHaveBeenCalled();
    expect(el.querySelector('#legalName')!.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('#legalName-error')!.textContent).toContain('validation.required');
    expect(el.querySelector('#address-error')!.textContent).toContain('validation.required');
  });

  it('rejects non-digit registration numbers on the client side', async () => {
    const { el, type, submit, api } = await render();
    const create = vi.spyOn(api, 'create');
    type('legalName', 'DEMO X');
    type('address', 'Somewhere');
    type('taxRegistrationNo', '12ab');
    await submit();
    expect(create).not.toHaveBeenCalled();
    expect(el.querySelector('#taxRegistrationNo-error')!.textContent).toContain('validation.digits');
  });

  it('maps a 422 response onto the matching field', async () => {
    const { el, type, submit, api } = await render();
    type('legalName', 'DEMO X');
    type('address', 'Somewhere');
    vi.spyOn(api, 'create').mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { legalName: ['Name already used.'] } } })),
    );
    await submit();
    expect(el.querySelector('#legalName-error')!.textContent).toContain('Name already used.');
    expect(el.querySelector('#legalName')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('creates the client and navigates to it', async () => {
    const { type, submit } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    type('legalName', 'DEMO Saved Client');
    type('address', 'Somewhere');
    await submit();
    expect(navigate).toHaveBeenCalledWith(['/app/clients', expect.stringMatching(/^c-/)]);
  });

  it('asks before leaving with unsaved changes and lets clean forms go', async () => {
    const { fixture, el, type, component } = await render();
    expect(component.canLeave()).toBe(true);
    type('legalName', 'DEMO changed');
    const answer = component.canLeave();
    await settle(fixture);
    expect(el.querySelector('app-confirm-dialog')).toBeTruthy();
    el.querySelector<HTMLButtonElement>('app-confirm-dialog .btn-danger')!.click();
    expect(await answer).toBe(true);
  });
});
