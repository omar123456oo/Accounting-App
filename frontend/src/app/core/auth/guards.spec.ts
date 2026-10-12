import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { NotificationService } from '../notify/notification.service';
import { AuthUser } from './auth.models';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { permissionGuard } from './permission.guard';
import { clientGuard, staffGuard } from './user-type.guard';

const staff: AuthUser = { id: '1', name: 's', type: 'staff', permissions: ['journals.view'] };
const client: AuthUser = { id: '2', name: 'c', type: 'client', permissions: [] };

describe('guards', () => {
  const user = signal<AuthUser | null>(null);
  const loadMe = vi.fn(() => of(user()));

  function run(guard: typeof authGuard, route: Partial<ActivatedRouteSnapshot> = {}, loaded = true) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user,
            loaded: () => loaded,
            loadMe,
            isAuthenticated: () => user() !== null,
            can: (p: string) => !!user()?.permissions.includes(p),
          },
        },
      ],
    });
    return TestBed.runInInjectionContext(() => guard(route as ActivatedRouteSnapshot, {} as never));
  }

  const asyncResult = (r: unknown): Promise<boolean | UrlTree> => firstValueFrom(r as Observable<boolean | UrlTree>);
  const url = (r: unknown) => TestBed.inject(Router).serializeUrl(r as UrlTree);

  beforeEach(() => user.set(null));

  it('authGuard sends anonymous users to /login and lets signed-in users in', async () => {
    expect(url(await asyncResult(run(authGuard)))).toBe('/login');
    TestBed.resetTestingModule();
    user.set(staff);
    expect(await asyncResult(run(authGuard))).toBe(true);
  });

  it('authGuard restores the session first when it has not been probed yet', async () => {
    user.set(staff);
    loadMe.mockClear();
    expect(await asyncResult(run(authGuard, {}, false))).toBe(true);
    expect(loadMe).toHaveBeenCalled();
  });

  it('staffGuard and clientGuard keep each user type in its own area', async () => {
    user.set(client);
    expect(url(await asyncResult(run(staffGuard)))).toBe('/portal');
    TestBed.resetTestingModule();
    user.set(client);
    expect(await asyncResult(run(clientGuard))).toBe(true);
    TestBed.resetTestingModule();
    user.set(staff);
    expect(url(await asyncResult(run(clientGuard)))).toBe('/app');
    TestBed.resetTestingModule();
    expect(await asyncResult(run(staffGuard))).toBe(true);
  });

  it('permissionGuard checks route.data.permission and notifies on denial', () => {
    user.set(staff);
    expect(run(permissionGuard, { data: { permission: 'journals.view' } })).toBe(true);
    TestBed.resetTestingModule();
    user.set(staff);
    const denied = run(permissionGuard, { data: { permission: 'settings.manage' } });
    expect(url(denied)).toBe('/app');
    expect(TestBed.inject(NotificationService).notifications()[0].messageKey).toBe('errors.forbidden');
  });
});
