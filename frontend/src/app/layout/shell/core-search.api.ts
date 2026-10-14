import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

export interface CoreSearchHit {
  doctype: string;
  doctypeLabel: string;
  name: string;
  title: string;
  route: string;
}

/** Records of admin-made document types. The server decides which types the signed-in person may see. */
@Injectable({ providedIn: 'root' })
export class CoreSearchApi {
  private readonly http = inject(HttpClient);

  search(q: string, type?: string): Observable<CoreSearchHit[]> {
    let params = new HttpParams().set('q', q);
    if (type) params = params.set('type', type);
    return this.http.get<{ data: CoreSearchHit[] }>('/api/v1/staff/core/search', { params }).pipe(map((r) => r.data));
  }
}
