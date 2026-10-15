import { FieldDef } from './core.models';
import { FormScripts } from './form-scripts';
import { buildGroup } from './record-form-model';

const FIELDS: FieldDef[] = [
  { fieldname: 'title', label: 'Title', fieldtype: 'text' }, { fieldname: 'amount', label: 'Amount', fieldtype: 'currency' },
  { fieldname: 'status', label: 'Status', fieldtype: 'select', options: ['new', 'used'] }, { fieldname: 'active', label: 'Active', fieldtype: 'checkbox' },
  { fieldname: 'bought', label: 'Bought', fieldtype: 'date' },
];

async function setup(codes: string[], opts: { canEdit?: boolean; developer?: boolean; data?: Record<string, unknown> } = {}) {
  const group = buildGroup(FIELDS, opts.data ?? { title: 'Laptops', amount: 250 });
  const scripts = new FormScripts({
    group: () => group, fields: () => FIELDS, canEdit: () => opts.canEdit ?? true,
    doc: () => ({ name: 'X-1', isNew: false, state: 'draft' }), user: () => ({ id: 'u1', name: 'Karim', roles: [], permissions: ['clients.view'] }),
  });
  await scripts.load(codes.map((code, i) => ({ name: `s${i + 1}`, code })), opts.developer ?? false);
  return { group, scripts };
}

describe('FormScripts', () => {
  it('applies what a script asks for: values, visibility, required and read-only', async () => {
    const { group, scripts } = await setup(['frm.on("refresh", () => { frm.set("status", "used"); frm.toggle("bought", false); frm.set_required("title"); frm.set_readonly("amount"); });']);
    scripts.run('refresh');
    expect(group.controls['status'].value).toBe('used');
    expect(scripts.hidden().has('bought')).toBe(true);
    expect(scripts.required().has('title')).toBe(true);
    expect(group.controls['amount'].disabled).toBe(true);
    group.controls['title'].setValue('');
    expect(group.controls['title'].invalid).toBe(true);
    scripts.dispose();
  });

  it('can undo what it did on a later event', async () => {
    const { group, scripts } = await setup(['frm.on("refresh", () => { const small = frm.get("amount") < 100; frm.toggle("bought", !small); frm.set_readonly("amount", small); frm.set_required("title", small); });'], { data: { title: 'T', amount: 50 } });
    scripts.run('refresh');
    expect(scripts.hidden().has('bought')).toBe(true);
    expect(group.controls['amount'].disabled).toBe(true);
    expect(scripts.required().has('title')).toBe(true);
    group.controls['amount'].setValue(500);
    scripts.run('refresh');
    expect(scripts.hidden().has('bought')).toBe(false);
    expect(group.controls['amount'].enabled).toBe(true);
    expect(scripts.required().has('title')).toBe(false);
    scripts.dispose();
  });

  it('never unlocks a form the person may not edit', async () => {
    const { group, scripts } = await setup(['frm.on("refresh", () => { frm.set_readonly("amount", false); frm.set("title", "changed"); });'], { canEdit: false });
    group.disable();
    scripts.run('refresh');
    expect(group.controls['amount'].disabled).toBe(true);
  });

  it('only sets a value of the type the field holds', async () => {
    const { group, scripts } = await setup(['frm.on("refresh", () => { frm.set("amount", "abc"); frm.set("active", "yes"); frm.set("title", 5); frm.set("status", "ghost"); frm.set("bought", "2026-01-02"); frm.set("amount", 12.5); });']);
    const r = scripts.run('refresh');
    expect(group.controls['amount'].value).toBe(12.5);
    expect(group.controls['active'].value).toBe(false);
    expect(group.controls['title'].value).toBe('Laptops');
    expect(group.controls['status'].value).toBe('');
    expect(group.controls['bought'].value).toBe('2026-01-02');
    expect(r.messages.filter((m) => /Cannot set/.test(m)).length).toBe(4);
    scripts.dispose();
  });

  it('returns validation errors and applies before_save changes', async () => {
    const { group, scripts } = await setup(['frm.on("validate", () => { if (frm.get("amount") > 100) frm.throw("Too large"); });', 'frm.on("before_save", () => frm.set("title", frm.get("title").toUpperCase()));']);
    expect(scripts.run('validate').errors).toEqual(['Too large']);
    group.controls['amount'].setValue(5);
    expect(scripts.run('validate').errors).toEqual([]);
    scripts.run('before_save');
    expect(group.controls['title'].value).toBe('LAPTOPS');
    scripts.dispose();
  });

  it('runs a change handler only for the field that changed, with the new value', async () => {
    const { group, scripts } = await setup(['frm.on("change:amount", () => frm.set("title", "amount=" + frm.get("amount")));']);
    group.controls['amount'].setValue(9);
    scripts.run('change:amount');
    expect(group.controls['title'].value).toBe('amount=9');
    group.controls['title'].setValue('x');
    scripts.run('change:title');
    expect(group.controls['title'].value).toBe('x');
    scripts.dispose();
  });

  it('exposes the buttons a script added and runs them', async () => {
    const { group, scripts } = await setup(['frm.add_button("Halve", () => frm.set("amount", frm.get("amount") / 2));']);
    expect(scripts.buttons()).toEqual([{ id: 1, label: 'Halve' }]);
    scripts.click(1);
    expect(group.controls['amount'].value).toBe(125);
    scripts.dispose();
  });

  it('tells developers about scripts that failed to load, and nobody else', async () => {
    const bad = ['frm.on("refresh", () => {'];
    expect((await setup(bad, { developer: true })).scripts.warnings()).toHaveLength(1);
    expect((await setup(bad, { developer: false })).scripts.warnings()).toEqual([]);
  });

  it('gives scripts the current user, including permissions', async () => {
    const { scripts } = await setup(['frm.on("refresh", () => frm.msg(frm.user.name + ":" + frm.user.permissions.join()));']);
    expect(scripts.run('refresh').messages).toEqual(['Karim:clients.view']);
    scripts.dispose();
  });

  it('does nothing without scripts, and nothing after it is disposed', async () => {
    const { scripts } = await setup([]);
    expect(scripts.run('refresh')).toEqual({ commands: [], errors: [], messages: [] });
    const again = await setup(['frm.on("refresh", () => frm.msg("x"));']);
    again.scripts.dispose();
    expect(again.scripts.run('refresh').messages).toEqual([]);
    expect(again.scripts.buttons()).toEqual([]);
  });
});
