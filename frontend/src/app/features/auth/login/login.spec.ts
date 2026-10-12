import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { DEMO_OTP, DEMO_USERS } from '../../../core/mock-api/mock-users';
import { mockApiInterceptor } from '../../../core/mock-api/mock-api.interceptor';
import { Login } from './login';

describe('Login', () => {
  const mfa = DEMO_USERS.find((u) => u.mfaEnabled)!;
  const owner = DEMO_USERS[0];

  function setup() {
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        provideHttpClient(withInterceptors([mockApiInterceptor]), withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' })),
      ],
    });
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const type = (id: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const submit = async () => {
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await new Promise((r) => setTimeout(r, 20));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { el, type, submit, fixture };
  }

  it('labels its inputs and shows required errors without calling the API', async () => {
    const { el, submit } = setup();
    expect(el.querySelector('label[for="email"]')).toBeTruthy();
    expect(el.querySelector('label[for="password"]')).toBeTruthy();
    expect(el.querySelector('#otp')).toBeNull();
    await submit();
    expect(el.querySelectorAll('[role="alert"]').length).toBe(2);
    expect(el.querySelector('#email')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('maps a 422 credentials error onto the email field', async () => {
    const { el, type, submit } = setup();
    type('email', owner.email);
    type('password', 'definitely-wrong');
    await submit();
    expect(el.querySelector('#email-error [role="alert"]')?.textContent?.trim()).toBeTruthy();
  });

  it('reveals the otp field when the API asks for it, then signs in', async () => {
    const { el, type, submit } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    type('email', mfa.email);
    type('password', mfa.password);
    await submit();
    expect(el.querySelector('#otp')).toBeTruthy();
    type('otp', DEMO_OTP);
    await submit();
    expect(navigate).toHaveBeenCalledWith(['/app']);
  });

  it('shows the lockout message after five failures', async () => {
    const { el, type, submit } = setup();
    type('email', 'locked-test@demo.test');
    type('password', 'wrong');
    for (let i = 0; i < 6; i++) {
      await submit();
    }
    expect(el.querySelector('#lockout-message')).toBeTruthy();
  });
});
