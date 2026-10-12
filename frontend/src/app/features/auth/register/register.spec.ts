import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { mockApiInterceptor } from '../../../core/mock-api/mock-api.interceptor';
import { DEMO_USERS } from '../../../core/mock-api/mock-users';
import { Register } from './register';

describe('Register', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [Register],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        provideHttpClient(withInterceptors([mockApiInterceptor]), withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' })),
      ],
    });
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const type = (id: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
    };
    const submit = async () => {
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await new Promise((r) => setTimeout(r, 20));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const fill = (email: string, password = 'Correct-Horse-123', confirmation = password) => {
      type('officeName', 'DEMO Office');
      type('name', 'DEMO Owner');
      type('email', email);
      type('password', password);
      type('passwordConfirmation', confirmation);
    };
    return { el, type, submit, fill, fixture };
  }

  it('labels every input and shows required errors without calling the API', async () => {
    const { el, submit } = setup();
    for (const id of ['officeName', 'name', 'email', 'password', 'passwordConfirmation']) {
      expect(el.querySelector(`label[for="${id}"]`), id).toBeTruthy();
    }
    await submit();
    expect(el.querySelector('#officeName')!.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('#register-success')).toBeNull();
  });

  it('rejects a password shorter than 12 characters', async () => {
    const { el, fill, submit } = setup();
    fill('short@demo.test', 'Short-1');
    await submit();
    expect(el.querySelector('#password')!.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('#register-success')).toBeNull();
  });

  it('flags mismatched passwords as text', async () => {
    const { el, fill, submit, fixture } = setup();
    fill('mismatch@demo.test', 'Correct-Horse-123', 'Different-Horse-123');
    fixture.detectChanges();
    expect(el.querySelector('#passwordConfirmation-mismatch')).toBeTruthy();
    await submit();
    expect(el.querySelector('#register-success')).toBeNull();
  });

  it('maps a duplicate email 422 onto the email field', async () => {
    const { el, fill, submit } = setup();
    fill(DEMO_USERS[0].email);
    await submit();
    expect(el.querySelector('#email')!.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('#register-success')).toBeNull();
  });

  it('creates the office, shows the done state and does not sign in', async () => {
    const { el, fill, submit } = setup();
    fill('new-owner@demo.test');
    await submit();
    expect(el.querySelector('#register-success')).toBeTruthy();
    expect(el.querySelector('form')).toBeNull();
    expect(el.querySelector('a[href="/login"]')).toBeTruthy();
    expect(DEMO_USERS.some((u) => u.email === 'new-owner@demo.test' && u.profile.type === 'staff')).toBe(true);
  });

  it('toggles password visibility for both password fields', () => {
    const { el, fixture } = setup();
    el.querySelector<HTMLButtonElement>('.toggle-password')!.click();
    fixture.detectChanges();
    expect(el.querySelector('#password')!.getAttribute('type')).toBe('text');
    expect(el.querySelector('#passwordConfirmation')!.getAttribute('type')).toBe('text');
  });
});
