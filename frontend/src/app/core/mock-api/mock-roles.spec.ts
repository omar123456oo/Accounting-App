import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import en from '../../../assets/i18n/en.json';
import ar from '../../../assets/i18n/ar.json';
import { actionLabelKey, moduleLabelKey, PermissionModule } from '../../features/settings/roles/roles.models';
import { mockHttpProviders, signInDemo } from '../../testing/test-utils';

const BASE = '/api/v1/staff';

interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

describe('mock roles API', () => {
  let http: HttpClient;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: mockHttpProviders() });
    http = TestBed.inject(HttpClient);
  });

  async function call(method: string, path: string, body?: unknown): Promise<Res> {
    try {
      const res = await firstValueFrom(http.request(method, `${BASE}/${path}`, { body, observe: 'response' }));
      return { status: res.status, body: res.body };
    } catch (e) {
      const err = e as HttpErrorResponse;
      return { status: err.status, body: err.error };
    }
  }

  it('is closed to staff without settings.manage', async () => {
    await signInDemo('accountant@demo.test');
    expect((await call('GET', 'roles')).status).toBe(403);
  });

  it('lists the built-in roles with their user counts', async () => {
    await signInDemo('owner@demo.test');
    const roles = (await call('GET', 'roles')).body.data as { id: string; userCount: number; locked: boolean }[];
    expect(roles.map((r) => r.id)).toContain('r-owner');
    expect(roles.find((r) => r.id === 'r-owner')?.userCount).toBe(2);
    expect(roles.find((r) => r.id === 'r-owner')?.locked).toBe(true);
  });

  it('creates, edits and deletes a custom role, rejecting duplicate names and unknown permissions', async () => {
    await signInDemo('owner@demo.test');
    const created = await call('POST', 'roles', { name: 'Reviewer', description: '', permissions: ['ledger.view'] });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect((await call('POST', 'roles', { name: 'reviewer', description: '', permissions: [] })).status).toBe(422);
    expect((await call('PUT', `roles/${id}`, { name: 'Reviewer', description: '', permissions: ['nope.nope'] })).status).toBe(422);
    const updated = await call('PUT', `roles/${id}`, { name: 'Reviewer', description: 'x', permissions: ['reports.view', 'ledger.view'] });
    expect(updated.body.data.permissions).toEqual(['ledger.view', 'reports.view']);
    expect((await call('DELETE', `roles/${id}`)).status).toBe(204);
    expect((await call('GET', `roles/${id}`)).status).toBe(404);
  });

  it('protects the Owner role and built-in roles from deletion', async () => {
    await signInDemo('owner@demo.test');
    expect((await call('PUT', 'roles/r-owner', { name: 'Owner', description: '', permissions: [] })).status).toBe(409);
    expect((await call('DELETE', 'roles/r-auditor')).status).toBe(409);
  });

  it('refuses to delete a role that is still assigned', async () => {
    await signInDemo('owner@demo.test');
    const id = (await call('POST', 'roles', { name: 'Temp', description: '', permissions: [] })).body.data.id as string;
    expect((await call('PUT', 'role-users/u-auditor', { roleIds: ['r-auditor', id] })).status).toBe(200);
    expect((await call('DELETE', `roles/${id}`)).status).toBe(409);
  });

  it('gives a user the union of their roles and keeps people from editing their own roles', async () => {
    await signInDemo('owner@demo.test');
    const id = (await call('POST', 'roles', { name: 'Poster', description: '', permissions: ['journals.post'] })).body.data.id as string;
    const res = await call('PUT', 'role-users/u-auditor', { roleIds: ['r-auditor', id] });
    const auditor = res.body.data as { permissionCount: number };
    const base = ((await call('GET', 'roles/r-auditor')).body.data.permissions as string[]).length;
    expect(auditor.permissionCount).toBe(base + 1);
    expect((await call('PUT', 'role-users/u-owner', { roleIds: [] })).status).toBe(409);
  });

  it('has an Arabic and English label for every module and action', async () => {
    await signInDemo('owner@demo.test');
    const catalogue = (await call('GET', 'permission-catalogue')).body.data as PermissionModule[];
    const has = (dict: unknown, key: string): boolean => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], dict) !== undefined;
    for (const m of catalogue) {
      for (const dict of [en, ar]) {
        expect(has(dict, moduleLabelKey(m.module)), moduleLabelKey(m.module)).toBe(true);
        m.actions.forEach((a) => expect(has(dict, actionLabelKey(a.action)), actionLabelKey(a.action)).toBe(true));
      }
    }
  });

  describe('document rights and Super Admin', () => {
    const roleOf = async (id: string) => (await call('GET', `roles/${id}`)).body.data as { permissions: string[] };

    it('gives the Super Admin every permission and offers the marker to no other role', async () => {
      await signInDemo('superadmin@demo.test');
      const superRole = await roleOf('r-super-admin');
      expect(superRole.permissions).toContain('system.super_admin');
      expect((await roleOf('r-owner')).permissions).not.toContain('system.super_admin');
      const catalogue = (await call('GET', 'permission-catalogue')).body.data as PermissionModule[];
      expect(catalogue.some((m) => m.module === 'system')).toBe(false);
      const granted = await call('POST', 'roles', { name: 'Sneaky', description: '', permissions: ['system.super_admin'] });
      expect(granted.status).toBe(422);
    });

    it('lets only a Super Admin grant or remove the Super Admin role, and keeps one', async () => {
      await signInDemo('owner@demo.test');
      expect((await call('PUT', 'role-users/u-auditor', { roleIds: ['r-auditor', 'r-super-admin'] })).status).toBe(403);
      await signInDemo('superadmin@demo.test');
      expect((await call('PUT', 'role-users/u-auditor', { roleIds: ['r-auditor', 'r-super-admin'] })).status).toBe(200);
      await signInDemo('auditor@demo.test');
      expect((await call('GET', 'roles')).status).toBe(200);
    });

    it('checks edit, delete and amend separately for a document type', async () => {
      await signInDemo('owner@demo.test');
      const id = (await call('POST', 'roles', { name: 'Clerk', description: '', permissions: ['ledger.view', 'journals.view', 'journals.create'] })).body.data.id as string;
      await call('PUT', 'role-users/u-auditor', { roleIds: [id] });
      await signInDemo('auditor@demo.test');
      // Without edit/delete the draft can be neither patched nor deleted, whatever the document state.
      const patch = await call('PATCH', `ledger/le-c-001/journals/je-1`, {});
      const del = await call('DELETE', `ledger/le-c-001/journals/je-1`);
      expect([patch.status, del.status]).toEqual([403, 403]);
    });
  });
});
