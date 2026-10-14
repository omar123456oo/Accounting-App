import { Router } from 'express';
import { notFound, orgOf, wrap } from '../hr/common.js';
import { BUILTIN_DOCTYPES } from './builtin-doctypes.js';
import { mergedFields, resolveDocType } from './doctypes.js';
import { DocType } from './models.js';

export const metaRouter = Router();

metaRouter.get('/meta/:doctype', wrap(async (req, res) => {
  const dt = await resolveDocType(orgOf(req), String(req.params.doctype));
  // Unknown and not-permitted look the same: the caller learns nothing about types they may not see.
  if (!dt || !req.auth!.permissions.includes(dt.viewPermission)) throw notFound();
  res.json({ data: { name: dt.name, label: dt.label, module: dt.module, fields: await mergedFields(orgOf(req), dt) } });
}));

metaRouter.get('/doctypes', wrap(async (req, res) => {
  const mine = await DocType.find({ organizationId: orgOf(req) }).sort({ name: 1 }).lean();
  const all = [
    ...Object.values(BUILTIN_DOCTYPES).map((b) => ({ name: b.name, label: b.label, module: b.module, isCustom: false, viewPermission: b.viewPermission })),
    ...mine.map((d) => ({ name: d.name, label: d.label, module: d.module, isCustom: true, viewPermission: d.viewPermission })),
  ];
  res.json({ data: all.filter((d) => req.auth!.permissions.includes(d.viewPermission)).map(({ viewPermission: _p, ...d }) => d) });
}));

