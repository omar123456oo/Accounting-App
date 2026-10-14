#!/usr/bin/env node
// Deterministic source scan. Reads the code (TypeScript AST, no regex guessing) and writes the generated reference
// documents under docs/. Anything it cannot resolve is listed as "needs review" instead of being guessed.
//
//   node scripts/docs/scan.mjs            write docs/*.md and docs/.inventory.json
//   node scripts/docs/scan.mjs --check    exit 1 if the generated files differ from what the code says now
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ts = createRequire(join(ROOT, 'frontend/package.json'))('typescript');
const CHECK = process.argv.includes('--check');

const rel = (p) => relative(ROOT, p).split('\\').join('/');
const read = (p) => readFileSync(p, 'utf8');
const parse = (p) => ts.createSourceFile(p, read(p), ts.ScriptTarget.Latest, true);
const walk = (dir, keep, out = []) => {
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, keep, out);
    else if (keep(p)) out.push(p);
  }
  return out;
};
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
const strOf = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined);
const textOf = (n) => n.getText().replace(/\s+/g, ' ');
const visit = (node, fn) => { fn(node); ts.forEachChild(node, (c) => visit(c, fn)); };

// ---------------------------------------------------------------------------------------------------------------------
// Backend: routers, mounts, permissions
// ---------------------------------------------------------------------------------------------------------------------
const BE = join(ROOT, 'backend-mongo/src');
const beFiles = walk(BE, (p) => p.endsWith('.ts') && !p.includes('/scripts/'));
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

/** router variable name -> { file }, and edges from `x.use(...)`. */
const routers = new Map();
const uses = []; // { parent, prefix, children[], file }
const routes = []; // { router, method, path, perms, unresolved, file, line }
const permVars = new Map(); // `${file}:${name}` -> permission

for (const file of beFiles) {
  const sf = parse(file);
  const f = rel(file);
  visit(sf, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const init = n.initializer;
      if (ts.isCallExpression(init) && init.expression.getText() === 'Router') routers.set(n.name.text, f);
      if (ts.isCallExpression(init) && init.expression.getText() === 'can' && strOf(init.arguments[0])) permVars.set(`${f}:${n.name.text}`, strOf(init.arguments[0]));
      if (ts.isIdentifier(init) && !routers.has(n.name.text)) routers.set(`alias:${n.name.text}`, init.text); // const a = b
    }
  });
}
const aliasOf = (name) => routers.get(`alias:${name}`) ?? name;

for (const file of beFiles) {
  const sf = parse(file);
  const f = rel(file);
  visit(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) return;
    const target = n.expression.expression;
    const method = n.expression.name.text;
    if (!ts.isIdentifier(target)) return;
    const owner = aliasOf(target.text);
    const isRouter = routers.has(owner) || target.text === 'app';
    if (!isRouter) return;
    if (METHODS.has(method)) {
      const [first, ...rest] = n.arguments;
      let path = strOf(first);
      let dynamic = false;
      if (path === undefined) { path = first ? textOf(first).replace(/`/g, '') : '?'; dynamic = true; }
      const perms = [];
      const unresolved = [];
      for (const a of rest) {
        if (ts.isCallExpression(a) && a.expression.getText() === 'can' && strOf(a.arguments[0])) perms.push(strOf(a.arguments[0]));
        else if (ts.isIdentifier(a) && permVars.has(`${f}:${a.text}`)) perms.push(permVars.get(`${f}:${a.text}`));
        else if (ts.isIdentifier(a) && !['wrap'].includes(a.text) && !/^(requireAuth|csrf|loadSession)$/.test(a.text)) unresolved.push(a.text);
      }
      routes.push({ router: owner, method: method.toUpperCase(), path, dynamic, perms, unresolved, file: f, line: lineOf(sf, n), body: textOf(n).includes('req.body') });
    } else if (method === 'use') {
      let prefix = '';
      const kids = [];
      n.arguments.forEach((a, i) => {
        if (i === 0 && strOf(a) !== undefined) prefix = strOf(a);
        else if (ts.isIdentifier(a) && routers.has(aliasOf(a.text))) kids.push(aliasOf(a.text));
        else if (ts.isIdentifier(a) && !/^(requireAuth|csrf|loadSession|cookieParser)$/.test(a.text) && !routers.has(a.text)) { /* middleware */ }
      });
      if (kids.length) uses.push({ parent: owner, prefix, kids, file: f });
    }
  });
}

/** Full URL prefixes for each router, following `use` edges from `app`. */
const prefixes = new Map(); // router -> Set(prefix)
const addPrefix = (router, p) => { if (!prefixes.has(router)) prefixes.set(router, new Set()); prefixes.get(router).add(p); };
const roots = uses.filter((u) => u.parent === 'app');
const expand = (router, base, depth = 0) => {
  if (depth > 8) return;
  addPrefix(router, base);
  for (const u of uses.filter((x) => x.parent === router)) for (const k of u.kids) expand(k, base + u.prefix, depth + 1);
};
for (const u of roots) for (const k of u.kids) expand(k, u.prefix);
// app-level routes
for (const r of routes) if (r.router === 'app') addPrefix('app', '');

const endpoints = [];
for (const r of routes) {
  const ps = [...(prefixes.get(r.router) ?? [])];
  if (!ps.length) { endpoints.push({ ...r, url: `(router ${r.router} is not mounted)${r.path}`, mounted: false }); continue; }
  for (const p of ps) endpoints.push({ ...r, url: p + (r.path === '/' ? '' : r.path), mounted: true });
}
endpoints.sort((a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method));

// ---------------------------------------------------------------------------------------------------------------------
// Backend: models
// ---------------------------------------------------------------------------------------------------------------------
const models = [];
for (const file of beFiles) {
  const sf = parse(file);
  const f = rel(file);
  const schemas = new Map(); // var -> { fields, indexes }
  visit(sf, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isNewExpression(n.initializer) && n.initializer.expression.getText() === 'Schema') {
      const lit = n.initializer.arguments?.[0];
      const fields = [];
      if (lit && ts.isObjectLiteralExpression(lit)) {
        for (const p of lit.properties) {
          if (ts.isSpreadAssignment(p)) fields.push({ name: `...${p.expression.getText()}`, spread: true });
          else if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
            const key = p.name.getText();
            const init = ts.isPropertyAssignment(p) ? p.initializer : p.name;
            let type = ''; let required = false; let enumVals = '';
            if (ts.isObjectLiteralExpression(init)) {
              for (const q of init.properties) {
                if (!ts.isPropertyAssignment(q)) continue;
                if (q.name.getText() === 'type') type = textOf(q.initializer);
                if (q.name.getText() === 'required') required = q.initializer.getText() === 'true';
                if (q.name.getText() === 'enum') enumVals = textOf(q.initializer);
              }
            } else type = textOf(init);
            fields.push({ name: key, type: type.slice(0, 90), required, enumVals: enumVals.slice(0, 90) });
          }
        }
      }
      schemas.set(n.name.text, { fields, indexes: [], line: lineOf(sf, n) });
    }
  });
  visit(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'index' && ts.isIdentifier(n.expression.expression)) {
      const s = schemas.get(n.expression.expression.text);
      if (s) s.indexes.push(textOf(n).replace(/^\w+\.index\(/, '').replace(/\)$/, ''));
    }
  });
  visit(sf, (n) => {
    if (ts.isCallExpression(n) && n.expression.getText() === 'model' && strOf(n.arguments[0]) && ts.isIdentifier(n.arguments[1] ?? n)) {
      const s = schemas.get(n.arguments[1].text);
      if (s) models.push({ name: strOf(n.arguments[0]), file: f, line: s.line, fields: s.fields, indexes: s.indexes });
    }
  });
}
models.sort((a, b) => a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------------------------------------------------
// Backend: permissions and roles (executed, not parsed: roleMatrix() is computed)
// ---------------------------------------------------------------------------------------------------------------------
const { p: PERMISSIONS, m: MATRIX } = JSON.parse(execFileSync('npx', ['--no-install', 'tsx', '-e',
  "import { PERMISSIONS, roleMatrix } from './src/db/permissions.ts'; console.log(JSON.stringify({ p: PERMISSIONS, m: roleMatrix() }));"],
{ cwd: join(ROOT, 'backend-mongo'), encoding: 'utf8' }));

// ---------------------------------------------------------------------------------------------------------------------
// Frontend: routes, navigation, features
// ---------------------------------------------------------------------------------------------------------------------
const FE = join(ROOT, 'frontend/src/app');
const feRouteFiles = walk(FE, (p) => p.endsWith('.routes.ts'));
const exportedRoutes = new Map(); // `${file}:${CONST}` -> array literal node info
const routeConsts = new Map(); // file -> Map(name -> {sf, node})
for (const file of feRouteFiles) {
  const sf = parse(file);
  const m = new Map();
  visit(sf, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isArrayLiteralExpression(n.initializer)) m.set(n.name.text, { sf, node: n.initializer });
  });
  routeConsts.set(file, m);
}
const guardFns = (sf) => { // helpers like `const guard = (p) => ({ canActivate: [...], data: { permission: p } })`
  const names = new Set();
  visit(sf, (n) => { if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && /guard/i.test(n.name.text) && n.initializer && ts.isArrowFunction(n.initializer)) names.add(n.name.text); });
  return names;
};
const frontRoutes = [];
const resolveImport = (from, spec) => {
  const base = resolve(dirname(from), spec);
  for (const c of [`${base}.ts`, join(base, 'index.ts')]) if (existsSync(c)) return c;
  return null;
};
function walkRoutes(file, constName, prefix, inheritedPerm, depth = 0) {
  const entry = routeConsts.get(file)?.get(constName);
  if (!entry || depth > 8) return;
  const { sf, node } = entry;
  const guards = guardFns(sf);
  const walkArray = (arr, base, perm) => {
    for (const el of arr.elements) {
      if (!ts.isObjectLiteralExpression(el)) continue;
      let path; let permission = perm; let component = ''; let lazy = null; let children = null; let redirect = '';
      for (const p of el.properties) {
        if (ts.isSpreadAssignment(p) && ts.isCallExpression(p.expression) && guards.has(p.expression.expression.getText())) permission = strOf(p.expression.arguments[0]) ?? permission;
        if (!ts.isPropertyAssignment(p)) continue;
        const k = p.name.getText();
        if (k === 'path') path = strOf(p.initializer);
        if (k === 'redirectTo') redirect = strOf(p.initializer) ?? '';
        if (k === 'data' && ts.isObjectLiteralExpression(p.initializer)) for (const q of p.initializer.properties) if (ts.isPropertyAssignment(q) && q.name.getText() === 'permission') permission = strOf(q.initializer) ?? permission;
        if (k === 'children' && ts.isArrayLiteralExpression(p.initializer)) children = p.initializer;
        if (k === 'component') component = p.initializer.getText();
        if (k === 'loadComponent' || k === 'loadChildren') {
          const txt = p.initializer.getText();
          const imp = /import\(\s*['"]([^'"]+)['"]\s*\)/.exec(txt)?.[1];
          const then = /\.then\(\s*\(?\w*\)?\s*=>\s*\w+\.(\w+)/.exec(txt)?.[1];
          if (k === 'loadComponent') component = then ?? '';
          if (imp) lazy = { kind: k, imp, then, comp: imp };
        }
      }
      if (path === undefined) continue;
      const full = (base + '/' + path).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
      const where = rel(file);
      const sourceFile = where;
      if (lazy?.kind === 'loadChildren') {
        const target = resolveImport(file, lazy.imp);
        if (target) { frontRoutes.push({ path: full, permission: permission ?? '', component: '(lazy children)', file: where, line: lineOf(sf, el), redirect }); walkRoutes(target, lazy.then, full, permission, depth + 1); }
        else frontRoutes.push({ path: full, permission: permission ?? '', component: `(unresolved ${lazy.imp})`, file: where, line: lineOf(sf, el), redirect, review: true });
        continue;
      }
      if (component || redirect) frontRoutes.push({ path: full, permission: permission ?? '', component: component || (redirect ? `redirect → ${redirect}` : ''), file: sourceFile, line: lineOf(sf, el), redirect });
      if (children) walkArray(children, full, permission);
    }
  };
  walkArray(node, prefix, inheritedPerm);
}
const appRoutes = join(FE, 'app.routes.ts');
{
  const sf = parse(appRoutes);
  visit(sf, (n) => {
    if (ts.isVariableDeclaration(n) && n.name.getText() === 'routes' && n.initializer && ts.isArrayLiteralExpression(n.initializer)) routeConsts.set(appRoutes, new Map([['routes', { sf, node: n.initializer }]]));
  });
}
walkRoutes(appRoutes, 'routes', '', undefined);
{ // lazy children from app.routes: mount shell under /app
  const shell = join(FE, 'layout/shell/shell.routes.ts');
  if (!frontRoutes.some((r) => r.file.endsWith('shell.routes.ts'))) walkRoutes(shell, 'SHELL_ROUTES', '/app', 'staff');
}
const seenR = new Set();
const frontUnique = frontRoutes.filter((r) => { const k = r.path + '|' + r.file + '|' + r.component; if (seenR.has(k)) return false; seenR.add(k); return true; });
frontUnique.sort((a, b) => a.path.localeCompare(b.path));

const nav = [];
{
  const sf = parse(join(FE, 'layout/shell/nav.config.ts'));
  visit(sf, (n) => {
    if (ts.isVariableDeclaration(n) && n.name.getText() === 'NAV_ITEMS' && n.initializer) {
      const arr = ts.isAsExpression(n.initializer) ? n.initializer.expression : n.initializer;
      if (ts.isArrayLiteralExpression(arr)) for (const el of arr.elements) if (ts.isObjectLiteralExpression(el)) {
        const o = {};
        for (const p of el.properties) if (ts.isPropertyAssignment(p)) o[p.name.getText()] = strOf(p.initializer);
        nav.push(o);
      }
    }
  });
}
const featureDirs = readdirSync(join(FE, 'features')).filter((d) => statSync(join(FE, 'features', d)).isDirectory()).sort().map((d) => {
  const files = walk(join(FE, 'features', d), (p) => p.endsWith('.ts'));
  return { name: d, files: files.length, specs: files.filter((p) => p.endsWith('.spec.ts')).length, components: files.filter((p) => !p.endsWith('.spec.ts') && /@Component\(/.test(read(p))).length };
});
const mockModules = walk(join(FE, 'core/mock-api'), (p) => /mock-[\w-]+\.ts$/.test(p) && !p.endsWith('.spec.ts')).length;

// ---------------------------------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------------------------------
const DOCS = join(ROOT, 'docs');
const outputs = new Map();
const header = (title, id, extra = '') => `---
title: "${title}"
id: "${id}"
document_type: "generated-reference"
status: "generated"
verification_status: "source-scanned"
source_of_truth: "application-source-code"
generated_by: "scripts/docs/scan.mjs"
---

# ${title}

> Generated from the source code by \`node scripts/docs/scan.mjs\`. Do not edit by hand: change the code and run the scan again.
> **Verification status:** source-scanned (read from the code; not exercised at runtime).${extra}

`;
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const table = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n')}\n`;
const ref = (file, line) => `\`${file}:${line}\``;

// API catalog
{
  const mounted = endpoints.filter((e) => e.mounted);
  const dyn = endpoints.filter((e) => e.dynamic || e.unresolved.length);
  const orphans = endpoints.filter((e) => !e.mounted);
  let md = header('API Catalog', 'SYS-API-001', `\n> Scope: \`backend-mongo\` only. The Angular app uses an in-memory mock API for every module not listed here (see [SYSTEM_OVERVIEW](SYSTEM_OVERVIEW.md)).\n`);
  md += `**${endpoints.length} endpoint definitions found; ${mounted.length} reachable from \`app.ts\`.**\n\n## Endpoints\n\n`;
  md += table(['Method', 'URL', 'Permission (backend)', 'Reads body', 'Source'], mounted.map((e) => [e.method, `\`${e.url}\``, e.perms.length ? e.perms.join(', ') : e.unresolved.length ? `needs review (${e.unresolved.join(', ')})` : '—', e.body ? 'yes' : 'no', ref(e.file, e.line)]));
  md += `\n"—" means the route itself adds no \`can(...)\` check. It may still be limited by the staff-only mount (\`requireAuth\`, \`requireType('staff')\`) or by checks inside the handler, which this scan does not read.\n`;
  if (dyn.length) md += `\n## Needs review\n\nPaths built at runtime or permission checks the scan could not resolve:\n\n` + table(['Method', 'URL', 'Why', 'Source'], dyn.map((e) => [e.method, `\`${e.url}\``, e.dynamic ? 'path is computed' : `permission via ${e.unresolved.join(', ')}`, ref(e.file, e.line)]));
  if (orphans.length) md += `\n## Defined but not mounted\n\n` + table(['Method', 'Path', 'Source'], orphans.map((e) => [e.method, `\`${e.path}\``, ref(e.file, e.line)]));
  outputs.set('API_CATALOG.md', md);
}
// Data dictionary
{
  let md = header('Data Dictionary', 'SYS-DATA-001', '\n> Scope: Mongoose models in `backend-mongo`. Field types are shown as written in the schema.\n');
  md += `**${models.length} models.** Every tenant collection carries \`organizationId\` (see \`backend-mongo/src/db/tenant.ts\`); a row \`...x\` is a spread of shared fields defined in the same file.\n\n`;
  for (const m of models) {
    md += `## ${m.name}\n\nSource: ${ref(m.file, m.line)}\n\n` + table(['Field', 'Type', 'Required', 'Allowed values'], m.fields.map((f) => [f.name, f.spread ? '(spread)' : f.type, f.spread ? '' : f.required ? 'yes' : 'no', f.enumVals || ''])) + (m.indexes.length ? `\nIndexes:\n\n${m.indexes.map((i) => `- \`${i}\``).join('\n')}\n` : '') + '\n';
  }
  outputs.set('DATA_DICTIONARY.md', md);
}
// Permissions
{
  const roles = Object.keys(MATRIX);
  let md = header('Permissions Matrix', 'SYS-PERM-001', '\n> Roles and permissions are read from `backend-mongo/src/db/permissions.ts` by running `roleMatrix()`. The note in that file asks for the owner to review the matrix before production use.\n');
  md += `**${PERMISSIONS.length} permissions, ${roles.length} roles.** ✔ = granted.\n\n`;
  md += table(['Permission', ...roles], PERMISSIONS.map((p) => [`\`${p}\``, ...roles.map((r) => (MATRIX[r].includes(p) ? '✔' : ''))]));
  const used = new Set(endpoints.flatMap((e) => e.perms));
  const frontOnly = [...new Set([...frontUnique.map((r) => r.permission), ...nav.map((n) => n.permission)].filter(Boolean))].filter((p) => p !== 'staff' && !PERMISSIONS.includes(p)).sort();
  md += `\n## Enforced by backend routes\n\n${[...used].sort().map((p) => `- \`${p}\``).join('\n')}\n`;
  md += `\n## Used by the frontend but not defined in the backend permission list\n\nThese guard screens in the Angular app (mock API) and have no backend counterpart yet. **Verification status:** needs reconciliation before the backend takes over those modules.\n\n${frontOnly.map((p) => `- \`${p}\``).join('\n')}\n`;
  outputs.set('PERMISSIONS_MATRIX.md', md);
}
// Route map
{
  let md = header('Application Route Map', 'SYS-ROUTE-001', '\n> Scope: Angular routes under `frontend/src/app`. A guard shown here is a screen restriction only; enforcement belongs to the backend.\n');
  md += `**${frontUnique.length} routes.**\n\n## Routes\n\n` + table(['URL', 'Permission guard', 'Component', 'Source'], frontUnique.map((r) => [`\`${r.path}\``, r.permission || '—', r.component, ref(r.file, r.line)]));
  const unres = frontUnique.filter((r) => r.review);
  if (unres.length) md += `\n## Needs review\n\n${unres.map((r) => `- \`${r.path}\`: ${r.component}`).join('\n')}\n`;
  md += `\n## Sidebar navigation\n\n` + table(['Label key', 'Route', 'Permission', 'Group'], nav.map((n) => [n.labelKey, `\`${n.route}\``, n.permission || '—', n.groupKey || '—']));
  outputs.set('APPLICATION_ROUTE_MAP.md', md);
}
// Module catalog inputs (feature directories)
{
  let md = header('Module Catalog', 'SYS-MOD-001', '\n> Inventory of `frontend/src/app/features/*` plus the backend areas found. Business descriptions live in each module guide, not here.\n');
  md += `\n## Frontend feature folders\n\n` + table(['Folder', 'TypeScript files', 'Components', 'Spec files', 'Module guide'], featureDirs.map((d) => [`\`features/${d.name}\``, d.files, d.components, d.specs, existsSync(join(DOCS, 'modules', d.name, 'README.md')) ? `[modules/${d.name}](modules/${d.name}/README.md)` : 'not yet written']));
  const areas = [...new Set(endpoints.filter((e) => e.mounted).map((e) => e.url.split('/').slice(0, 5).join('/')))];
  md += `\n## Backend areas (URL prefix → endpoints)\n\n` + table(['Prefix', 'Endpoints'], areas.map((a) => [`\`${a}\``, endpoints.filter((e) => e.mounted && e.url.startsWith(a)).length]));
  md += `\nThe frontend also contains ${mockModules} mock-API source files (\`frontend/src/app/core/mock-api\`): modules served only by the mock have **no backend implementation**.\n`;
  outputs.set('MODULE_CATALOG.md', md);
}

const inventory = {
  endpoints: endpoints.filter((e) => e.mounted).length,
  endpointsNeedingReview: endpoints.filter((e) => e.mounted && (e.dynamic || e.unresolved.length)).length,
  models: models.length, modelFields: models.reduce((n, m) => n + m.fields.filter((f) => !f.spread).length, 0),
  permissions: PERMISSIONS.length, roles: Object.keys(MATRIX).length,
  routes: frontUnique.length, navItems: nav.length, featureFolders: featureDirs.length, mockSourceFiles: mockModules,
  featureDirs: featureDirs.map((d) => d.name),
  endpointList: endpoints.filter((e) => e.mounted).map((e) => `${e.method} ${e.url}`),
  modelList: models.map((m) => m.name),
  routeList: frontUnique.map((r) => r.path),
};

let stale = [];
for (const [name, content] of outputs) {
  const p = join(DOCS, name);
  const same = existsSync(p) && read(p) === content;
  if (CHECK) { if (!same) stale.push(name); } else { mkdirSync(DOCS, { recursive: true }); writeFileSync(p, content); }
}
const invPath = join(DOCS, '.inventory.json');
const invText = JSON.stringify(inventory, null, 1) + '\n';
if (CHECK) { if (!existsSync(invPath) || read(invPath) !== invText) stale.push('.inventory.json'); }
else writeFileSync(invPath, invText);

if (CHECK && stale.length) { console.error(`Stale generated docs: ${stale.join(', ')}. Run: node scripts/docs/scan.mjs`); process.exit(1); }
console.log(CHECK ? 'Generated docs are current.' : `Wrote ${outputs.size} documents. ${JSON.stringify({ endpoints: inventory.endpoints, review: inventory.endpointsNeedingReview, models: inventory.models, permissions: inventory.permissions, routes: inventory.routes })}`);
