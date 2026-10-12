import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, switchMap, tap } from 'rxjs';
import { AuthUser, LoginResponse, RegisterRequest, RegisterResponse } from './auth.models';

const API = '/api/v1/auth';

/**
 * Session state for the SPA. Authentication is a Sanctum cookie session: the browser holds the session
 * cookie, this service only keeps the user profile in memory. No token is ever written to web storage.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly state = signal<AuthUser | null>(null);
  private readonly loadedFlag = signal(false);

  readonly user = this.state.asReadonly();
  readonly isAuthenticated = computed(() => this.state() !== null);
  /** True once the initial /auth/me probe has finished (successfully or not). */
  readonly loaded = this.loadedFlag.asReadonly();

  login(email: string, password: string, otp?: string): Observable<AuthUser> {
    const body = otp ? { email, password, otp } : { email, password };
    return this.http.get('/sanctum/csrf-cookie').pipe(
      switchMap(() => this.http.post<LoginResponse>(`${API}/login`, body)),
      map((res) => res.user),
      tap((user) => this.state.set(user)),
    );
  }

  /** Registers a new accounting office and its owner account. It never signs the user in. */
  register(request: RegisterRequest): Observable<RegisterResponse> {
    return this.http
      .get('/sanctum/csrf-cookie')
      .pipe(switchMap(() => this.http.post<RegisterResponse>(`${API}/register`, request)));
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${API}/logout`, {}).pipe(finalize(() => this.clear()));
  }

  /** Restores the session from the cookie; resolves to null when there is none. */
  loadMe(): Observable<AuthUser | null> {
    return this.http.get<LoginResponse>(`${API}/me`).pipe(
      map((res) => res.user),
      catchError(() => of(null)),
      tap((user) => {
        this.state.set(user);
        this.loadedFlag.set(true);
      }),
    );
  }

  can(permission: string): boolean {
    return this.state()?.permissions.includes(permission) ?? false;
  }

  /** Drops the in-memory session (used on logout and on 401). */
  clear(): void {
    this.state.set(null);
  }
}
