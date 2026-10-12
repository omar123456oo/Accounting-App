import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { Sidebar } from './sidebar';

function render(permissions: string[]) {
  TestBed.configureTestingModule({
    imports: [Sidebar],
    providers: [provideRouter([]), provideTranslateService(), { provide: AuthService, useValue: { can: (p: string) => permissions.includes(p) } }],
  });
  const fixture = TestBed.createComponent(Sidebar);
  fixture.detectChanges();
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map((a) => a.getAttribute('href'));
}

describe('Sidebar', () => {
  it('lists only the entries the user may see', () => {
    expect(render(['journals.view', 'reports.view'])).toEqual(['/app', '/app/accounting/journals', '/app/accounting/reports']);
  });

  it('shows the clients entry only with clients.view', () => {
    expect(render(['clients.view'])).toEqual(['/app', '/app/clients']);
  });

  it.each([
    [['documents.view'], ['/app', '/app/documents']],
    [['tasks.view'], ['/app', '/app/tasks']],
    [['workflows.approve'], ['/app', '/app/approvals']],
    [['tasks.manage', 'documents.upload'], ['/app']],
  ])('shows documents, tasks and approvals only with their own permissions: %j', (permissions, expected) => {
    expect(render(permissions)).toEqual(expected);
  });

  it.each([
    [['ledger.view', 'journals.view', 'reports.view'], ['/app', '/app/accounting/accounts', '/app/accounting/periods', '/app/accounting/journals', '/app/accounting/reports']],
    [['ledger.view'], ['/app', '/app/accounting/accounts', '/app/accounting/periods']],
    [['ledger.manage_accounts', 'journals.create'], ['/app']],
  ])('lists the accounting group in order, filtered by permission: %j', (permissions, expected) => {
    expect(render(permissions)).toEqual(expected);
  });

  it('always shows the dashboard', () => {
    expect(render([])).toEqual(['/app']);
  });
});
