import { Router } from 'express';
import { escapeRegex, orgOf, wrap } from '../hr/common.js';
import { DocRecord, DocType } from './models.js';

export const searchRouter = Router();

const PER_TYPE = 5;
const MIN_CHARS = 2;

/**
 * Search over the admin-made DocTypes this person may view. Built-in types keep their own search sources in the app.
 * The term is matched literally (regex characters are escaped) and only inside the DocType's declared searchFields.
 */
searchRouter.get('/search', wrap(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < MIN_CHARS) { res.json({ data: [] }); return; }
  const org = orgOf(req);
  const only = typeof req.query.type === 'string' ? req.query.type : undefined;
  const types = (await DocType.find({ organizationId: org, ...(only ? { name: only } : {}) }).lean())
    .filter((t) => req.auth!.permissions.includes(t.viewPermission) && t.searchFields.length > 0);
  const re = new RegExp(escapeRegex(q), 'i');
  const groups = await Promise.all(types.map(async (t) => {
    const rows = await DocRecord.find({
      organizationId: org, doctype: t.name,
      $or: [{ name: re }, ...t.searchFields.map((f) => ({ [`data.${f}`]: re }))],
    }).sort({ name: 1 }).limit(PER_TYPE).lean();
    return rows.map((r) => ({
      doctype: t.name, doctypeLabel: t.label, name: r.name,
      title: String((r.data as Record<string, unknown>)?.[t.titleField] ?? r.name),
      route: `/app/records/${t.name}/${encodeURIComponent(r.name)}`,
    }));
  }));
  res.json({ data: groups.flat() });
}));
