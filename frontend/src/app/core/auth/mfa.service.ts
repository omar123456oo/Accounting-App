import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface MfaSetup {
  secret: string;
  otpauth_url: string;
}

@Injectable({ providedIn: 'root' })
export class MfaService {
  private readonly http = inject(HttpClient);

  setup(): Observable<MfaSetup> {
    return this.http.post<MfaSetup>('/api/v1/auth/mfa/setup', {});
  }

  confirm(otp: string): Observable<unknown> {
    return this.http.post('/api/v1/auth/mfa/confirm', { otp });
  }
}
