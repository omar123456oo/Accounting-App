import { StatementKind, FsMapping, FsOptions, StatementView, FsLineKey, LINES_BY_CATEGORY } from '../../features/reports-fs/fs.models';
import { Rules, validate } from './mock-clients-rules';
import { mockToday } from './mock-clock';
import { FsData, buildRows, columnsOf, flatten, withComparison } from './mock-fs-calc';
import { FS_LINES, isLineKey, lineOf } from './mock-fs-lines';
import { LedgerCtx } from './mock-ledger-store';
import { MockResult, fail, invalid, need, ok } from './mock-types';

const RANGE: Rules = { from: { kind: 'date' }, to: { kind: 'date' }, compareFrom: { kind: 'date' }, compareTo: { kind: 'date' } };
const KINDS: readonly string[] = ['income', 'balance', 'cashflow', 'equity'];

/**
 * Financial statements derived ONLY from journal lines (posted, or posted + unposted for a clearly marked preview).
 * Reads need reports.view; changing the account-to-line mapping needs mappings.manage.
 */
export function handleStatements(ctx: LedgerCtx, rest: string[]): MockResult {
  const [name] = rest;
  if (name === 'mapping') return handleMapping(ctx);
  const denied = need(ctx.user, 'reports.view');
  if (denied) return denied;
  if (ctx.req.method !== 'GET') return fail(405, 'notFound');
  if (name === 'options') return ok({ data: options(ctx) });
  if (!name || !KINDS.includes(name)) return fail(404, 'notFound');
  const q = ctx.req.query;
  const errors = validate({ from: q.get('from') ?? '', to: q.get('to') ?? '', compareFrom: q.get('compareFrom') ?? '', compareTo: q.get('compareTo') ?? '' }, RANGE, true);
  if (Object.keys(errors).length) return invalid(errors);
  return ok({ data: statement(ctx, name as StatementKind) });
}

const yearStart = (date: string): string => `${date.slice(0, 4)}-01-01`;

function finalized(ctx: LedgerCtx, from: string, to: string): boolean {
  const covered = ctx.store.periods.filter((p) => p.ledgerEntityId === ctx.entity.id && p.startDate <= to && p.endDate >= from);
  return covered.length > 0 && covered.every((p) => p.status === 'locked');
}

export function statement(ctx: LedgerCtx, kind: StatementKind): StatementView {
  const q = ctx.req.query;
  const to = q.get('to') || mockToday();
  const from = q.get('from') || (ctx.store.periodAt(ctx.entity.id, to) ? ctx.store.yearOf(ctx.store.periodAt(ctx.entity.id, to)!).startDate : yearStart(to));
  const scope = { includeUnposted: q.get('includeUnposted') === 'true', branch: q.get('branch') || undefined, costCenter: q.get('costCenter') || undefined };
  const data = new FsData(ctx, flatten(ctx, scope));
  const built = buildRows(kind, data, from, to);
  const view: StatementView = {
    kind,
    ledgerEntityId: ctx.entity.id,
    from,
    to,
    includesUnposted: scope.includeUnposted,
    finalized: finalized(ctx, from, to),
    columns: columnsOf(kind),
    sections: built.sections,
    check: built.check,
    defaultedAccounts: data.defaulted(),
    dimensionFiltered: !!(scope.branch || scope.costCenter),
    templateConfirmed: !!ctx.store.compliance.fsMappingOf(ctx.entity.id).confirmedAt,
  };
  const cFrom = q.get('compareFrom');
  const cTo = q.get('compareTo');
  if (cFrom && cTo) {
    view.compare = { from: cFrom, to: cTo };
    view.compareFinalized = finalized(ctx, cFrom, cTo);
    view.sections = withComparison(built.sections, buildRows(kind, data, cFrom, cTo).sections);
  }
  return view;
}

function options(ctx: LedgerCtx): FsOptions {
  const lines = ctx.store.journals.filter((j) => j.ledgerEntityId === ctx.entity.id).flatMap((j) => j.lines);
  const distinct = (pick: (l: (typeof lines)[number]) => string | undefined): string[] => [...new Set(lines.map(pick).filter((x): x is string => !!x))].sort();
  return { branches: distinct((l) => l.branch), costCenters: distinct((l) => l.costCenter) };
}

function mappingView(ctx: LedgerCtx): FsMapping {
  const stored = ctx.store.compliance.fsMappingOf(ctx.entity.id);
  return {
    lines: structuredClone(FS_LINES) as FsMapping['lines'],
    accounts: ctx.store
      .accountsOf(ctx.entity.id)
      .filter((a) => a.isPostable)
      .sort((x, y) => x.code.localeCompare(y.code))
      .map((a) => {
        const l = lineOf(a, stored.map);
        return { accountId: a.id, code: a.code, nameAr: a.nameAr, nameEn: a.nameEn, category: a.category, lineKey: l.key, fromTemplate: l.fromTemplate };
      }),
    ...(stored.confirmedBy ? { confirmedBy: stored.confirmedBy, confirmedAt: stored.confirmedAt } : {}),
  };
}

function handleMapping(ctx: LedgerCtx): MockResult {
  const { req, user, store, entity } = ctx;
  if (req.method === 'GET') return need(user, 'reports.view') ?? ok({ data: mappingView(ctx) });
  if (req.method !== 'PUT') return fail(405, 'notFound');
  const denied = need(user, 'mappings.manage');
  if (denied) return denied;
  const incoming = req.body['mapping'];
  if (!incoming || typeof incoming !== 'object') return invalid({ mapping: ['required'] });
  const next: Record<string, FsLineKey> = {};
  for (const [accountId, key] of Object.entries(incoming as Record<string, unknown>)) {
    const account = store.account(entity.id, accountId);
    if (!account) return fail(404, 'notFound');
    if (!isLineKey(key) || !LINES_BY_CATEGORY[account.category].includes(key)) return invalid({ mapping: ['mappingLineInvalid'] });
    next[accountId] = key;
  }
  const stored = store.compliance.fsMappingOf(entity.id);
  const before = { ...stored.map };
  stored.map = { ...stored.map, ...next };
  stored.confirmedBy = user.profile.name;
  stored.confirmedAt = new Date().toISOString();
  store.compliance.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'statements.mapping_saved', entityType: 'ledger', entityId: entity.id, before, after: stored.map });
  return ok({ data: mappingView(ctx) });
}
