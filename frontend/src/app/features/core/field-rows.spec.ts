import { FieldDef } from './core.models';
import { blankRow, fieldsToRows, move, rowsToFields } from './field-rows';

describe('field rows', () => {
  it('turns a select field into editable text and back', () => {
    const fields: FieldDef[] = [{ fieldname: 'status', label: 'Status', fieldtype: 'select', options: ['new', 'used'], required: true, insertAfter: 'tag' }];
    const rows = fieldsToRows(fields);
    expect(rows[0].optionsText).toBe('new, used');
    expect(rowsToFields(rows, true)).toEqual(fields);
  });

  it('parses choices: trims, drops empties, keeps order', () => {
    const row = { ...blankRow(), fieldname: 'c', label: 'C', fieldtype: 'select' as const, optionsText: ' a , ,b,  ' };
    expect(rowsToFields([row], false)[0].options).toEqual(['a', 'b']);
  });

  it('keeps the link target as the only option and drops options on other types', () => {
    const link = { ...blankRow(), fieldname: 'p', label: 'P', fieldtype: 'link' as const, optionsText: ' asset ' };
    const text = { ...blankRow(), fieldname: 't', label: 'T', fieldtype: 'text' as const, optionsText: 'leftover' };
    const out = rowsToFields([link, text], false);
    expect(out[0].options).toEqual(['asset']);
    expect(out[1].options).toBeUndefined();
  });

  it('omits flags that are off and insertAfter when anchors are not used', () => {
    const row = { ...blankRow(), fieldname: 'n', label: 'N', required: false, hidden: false, insertAfter: 'x' };
    expect(rowsToFields([row], false)).toEqual([{ fieldname: 'n', label: 'N', fieldtype: 'text' }]);
    expect(rowsToFields([{ ...row, insertAfter: 'x' }], true)[0].insertAfter).toBe('x');
    expect(rowsToFields([{ ...row, insertAfter: '' }], true)[0].insertAfter).toBeUndefined();
  });

  it('moves a row up or down and stops at the ends', () => {
    expect(move(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(move(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(move(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(move(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
});
