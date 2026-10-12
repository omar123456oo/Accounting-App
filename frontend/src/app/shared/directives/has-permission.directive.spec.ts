import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { HasPermissionDirective } from './has-permission.directive';

@Component({
  imports: [HasPermissionDirective],
  template: `<p *appHasPermission="'journals.post'" id="secret">visible</p>`,
})
class Host {}

describe('HasPermissionDirective', () => {
  const user = signal<{ permissions: string[] } | null>(null);

  function setup() {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: AuthService, useValue: { can: (p: string) => !!user()?.permissions.includes(p) } }],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture;
  }

  it('hides the content without the permission', () => {
    user.set({ permissions: ['journals.view'] });
    expect(setup().nativeElement.querySelector('#secret')).toBeNull();
  });

  it('renders the content with the permission and reacts to changes', async () => {
    user.set({ permissions: [] });
    const fixture = setup();
    expect(fixture.nativeElement.querySelector('#secret')).toBeNull();
    user.set({ permissions: ['journals.post'] });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#secret')).toBeTruthy();
  });
});
