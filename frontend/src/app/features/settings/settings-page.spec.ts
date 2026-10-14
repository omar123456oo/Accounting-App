import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { SettingsPage } from './settings-page';

function render(permissions: string[]) {
  TestBed.configureTestingModule({
    imports: [SettingsPage],
    providers: [
      provideRouter([]),
      provideTranslateService(),
      { provide: AuthService, useValue: { can: (p: string) => permissions.includes(p), user: () => ({ name: 'Test', type: 'staff', permissions }) } },
    ],
  });
  const fixture = TestBed.createComponent(SettingsPage);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('SettingsPage', () => {
  it('links only to configuration pages the user may open', () => {
    const hrefs = Array.from(render(['tax.rates.manage']).querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/app/accounting/settings/tax-rates']);
  });

  it('shows a notice when no configuration page is permitted', () => {
    expect(render([]).querySelector('[role="status"]')).not.toBeNull();
  });

  it('offers both languages', () => {
    expect(render([]).querySelectorAll('.btn-group button').length).toBe(2);
  });
});
