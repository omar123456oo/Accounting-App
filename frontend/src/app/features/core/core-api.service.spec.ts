import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CoreApiService } from './core-api.service';

describe('CoreApiService', () => {
  let api: CoreApiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(CoreApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reads metadata and unwraps data', () => {
    let name = '';
    api.meta('asset').subscribe((m) => (name = m.name));
    const req = http.expectOne('/api/v1/staff/core/meta/asset');
    expect(req.request.method).toBe('GET');
    req.flush({ data: { name: 'asset', label: 'Asset', module: 'ops', isCustom: true, titleField: 'tag', canManage: true, fields: [] } });
    expect(name).toBe('asset');
  });

  it('encodes names so a crafted record name cannot change the path', () => {
    api.record('asset', 'A/../B?x').subscribe();
    http.expectOne('/api/v1/staff/core/records/asset/A%2F..%2FB%3Fx').flush({ data: { name: 'x', title: 'x', data: {} } });
  });

  it('sends the whole custom field list on save', () => {
    const fields = [{ fieldname: 'notes', label: 'Notes', fieldtype: 'text' as const }];
    let saved: unknown;
    api.saveCustomFields('asset', fields).subscribe((f) => (saved = f));
    const req = http.expectOne('/api/v1/staff/core/customize/asset');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ fields });
    req.flush({ data: { fields } });
    expect(saved).toEqual(fields);
  });

  it('passes search and paging as query parameters and omits empty ones', () => {
    api.records('asset', { q: 'a-1', page: 2 }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/staff/core/records/asset');
    expect(req.request.params.get('q')).toBe('a-1');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.has('pageSize')).toBe(false);
    req.flush({ data: [], meta: { page: 2, pageSize: 20, total: 0 } });
  });

  it('wraps record data as { data } on create and update', () => {
    api.createRecord('asset', { tag: 'A' }).subscribe();
    expect(http.expectOne('/api/v1/staff/core/records/asset').request.body).toEqual({ data: { tag: 'A' } });
    api.updateRecord('asset', 'ASSET-000001', { tag: 'B' }).subscribe();
    const put = http.expectOne('/api/v1/staff/core/records/asset/ASSET-000001');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ data: { tag: 'B' } });
  });
});
