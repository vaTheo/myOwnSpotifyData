/// <reference types="node" />
/**
 * The redesign's static invariants (spec 003, T113, FR-049): what the branch
 * must not change against `main`. Each check prints PASS or FAIL with what
 * differs; the run exits 1 on any FAIL. `yarn invariants`.
 *
 * - `DB_VERSION` is the same.
 * - Every `confirm()` text is the same (literals, the constants they name,
 *   and the two question builders), whatever file asks it.
 * - The external hosts are the same: those written in the app's code (a URL
 *   or a bare host name in any string), in `index.html` (its CSP) and in
 *   `vite.config.ts`.
 * - The dependencies are the same, apart from the approved dev additions,
 *   and every `yarn.lock` entry of `main` resolves to the same version.
 * - Every unit test of `main` still runs: each name, as many times as on
 *   `main`, neither skipped nor todo nor expected to fail (a moved one is
 *   listed with its new file).
 * - The ranking, Crate, Match, Under the radar and release-year functions of
 *   `src/model/` give byte-equal JSON on the demo dataset in both trees.
 *
 * Sources are read with TypeScript's own parser (JSX, regex literals and
 * comments as the compiler sees them). `main` is the merge base of HEAD with
 * `origin/main` (override with `INVARIANTS_BASE=<commit>`); its tree is a
 * temporary `git worktree` in the system temp directory, removed at the end
 * (`git worktree prune` after a killed run). HEAD is the working tree, so
 * uncommitted edits are judged too: run it on a clean tree before a merge.
 * The demo dataset is built from HEAD's `src/dev/demo.ts` (main has no demo)
 * and handed to both trees unchanged.
 *
 * Node runs this file directly (type stripping): it imports only `node:`,
 * TypeScript and Vite, whose module runner loads each tree's TypeScript.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer, createServerModuleRunner } from 'vite';

// Crate buckets months in the local time zone: pin it for both trees.
process.env.TZ = 'Europe/Paris';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(
  /\/$/,
  ''
);

/** The dev dependencies this branch added, approved in spec 003 (D19). */
const APPROVED_DEV_ADDITIONS = ['@axe-core/playwright', '@playwright/test'];

/**
 * Unit tests renamed on purpose, old name → new name: T097 made the
 * Overview the default route (contracts/routes.md), so the router test that
 * pinned `top` now pins `overview`. The new name must exist.
 */
const RENAMED_TESTS: Record<string, string> = {
  'defaults to top for empty or unknown hashes':
    'defaults to overview for empty or unknown hashes',
  // Spec 026: the Settings sections became items under groups and the
  // Updates card the Sync status block; these tests were renamed.
  'lists the seven sections of US5 in page order':
    'lists the seven items of US5 in page order',
  'puts the Updates section (round 006) first':
    'gives one line per source in a fixed order with its label',
  'gives each section its own element id': 'gives each item its own element id',
  'reads a section back from its element id, and nothing else':
    'reads the item a link names, and nothing else',
};

/**
 * Tests of main whose behaviour a change removed on purpose, with the
 * reason: not renamed, retired. Each is reported, never counted missing.
 */
const RETIRED_TESTS: Record<string, string> = {
  'marks the first visible section in page order':
    'spec 026 FR-006 removed the Settings section index (scroll-spy)',
  'keeps the current mark while no section is in the band':
    'spec 026 FR-006 removed the Settings section index (scroll-spy)',
  'marks the last section once the page is scrolled to its end':
    'spec 026 FR-006 removed the Settings section index (scroll-spy)',
};

/** Functions that build a `confirm()` question passed in by a caller. */
const QUESTION_BUILDERS = ['likeQuestion', 'replaceQuestion'];

/** A host written without a scheme: a dotted name ending in a known TLD. */
const BARE_HOST =
  /\b((?:[a-z0-9-]+\.)+(?:com|org|net|io|co|fm|app|dev|me|be|fr|de|uk|info))\b/gi;

interface Result {
  name: string;
  ok: boolean;
  lines: string[];
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function baseCommit(): string {
  const wanted = process.env.INVARIANTS_BASE;
  if (wanted) return git('rev-parse', '--verify', `${wanted}^{commit}`);
  return git('merge-base', 'HEAD', 'origin/main');
}

/** Every file under `dir` (relative to `tree`), depth first, sorted. */
function walk(tree: string, dir: string): string[] {
  const out: string[] = [];
  const abs = join(tree, dir);
  if (!existsSync(abs)) return out;
  for (const e of readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const rel = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(tree, rel));
    else out.push(rel);
  }
  return out;
}

const isTest = (f: string) => /\.test\.tsx?$/.test(f);
const isCode = (f: string) => /\.tsx?$/.test(f);

function parse(tree: string, file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(join(tree, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function visit(node: ts.Node, f: (n: ts.Node) => void): void {
  f(node);
  node.forEachChild((c) => visit(c, f));
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** A string built of literals joined by `+`, or null. */
function literalValue(expr: ts.Expression): string | null {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.text;
  }
  if (ts.isParenthesizedExpression(expr)) return literalValue(expr.expression);
  if (
    ts.isBinaryExpression(expr) &&
    expr.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const l = literalValue(expr.left);
    const r = literalValue(expr.right);
    return l === null || r === null ? null : l + r;
  }
  return null;
}

/** Every piece of text a file holds as data: strings, templates, JSX text. */
function texts(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  visit(sf, (n) => {
    if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n) ||
      ts.isJsxText(n) ||
      ts.isRegularExpressionLiteral(n)
    ) {
      out.push(n.text);
    }
  });
  return out;
}

// ---------------------------------------------------------------- checks

function dbVersion(tree: string): string {
  const src = readFileSync(join(tree, 'src/db/schema.ts'), 'utf8');
  return /export const DB_VERSION\s*=\s*(\d+)/.exec(src)?.[1] ?? 'absent';
}

/** `confirm(…)`, `window.confirm(…)` or `globalThis.confirm(…)`. */
function isConfirmCall(n: ts.Node): n is ts.CallExpression {
  if (!ts.isCallExpression(n)) return false;
  const e = n.expression;
  if (ts.isIdentifier(e)) return e.text === 'confirm';
  return (
    ts.isPropertyAccessExpression(e) &&
    e.name.text === 'confirm' &&
    ts.isIdentifier(e.expression) &&
    ['window', 'globalThis', 'self'].includes(e.expression.text)
  );
}

/** Every confirm() text in the tree, sorted (a multiset). */
function confirmTexts(tree: string): string[] {
  const files = walk(tree, 'src')
    .filter((f) => isCode(f) && !isTest(f))
    .map((f) => parse(tree, f));
  const constants = new Map<string, string | null>();
  const bodies = new Map<string, string>();
  for (const sf of files) {
    visit(sf, (n) => {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.initializer
      ) {
        constants.set(n.name.text, literalValue(n.initializer));
      }
      if (ts.isFunctionDeclaration(n) && n.name && n.body) {
        bodies.set(n.name.text, squash(n.body.getText()));
      }
    });
  }
  const out: string[] = [];
  for (const sf of files) {
    visit(sf, (n) => {
      if (!isConfirmCall(n) || n.arguments.length === 0) return;
      const arg = n.arguments[0];
      const lit = literalValue(arg);
      if (lit !== null) out.push(`"${lit}"`);
      else if (ts.isIdentifier(arg) && /^[A-Z][A-Z0-9_]*$/.test(arg.text)) {
        out.push(`${arg.text} = "${constants.get(arg.text) ?? '?'}"`);
      } else if (ts.isCallExpression(arg) && ts.isIdentifier(arg.expression)) {
        const fn = arg.expression.text;
        out.push(`${fn}(…) ${bodies.get(fn) ?? '?'}`);
      } else {
        out.push(`(${squash(n.arguments.map((a) => a.getText()).join(', '))})`);
      }
    });
  }
  for (const fn of QUESTION_BUILDERS) {
    out.push(`builder ${fn} ${bodies.get(fn) ?? 'absent'}`);
  }
  return out.sort();
}

function hostsIn(text: string, into: Set<string>): void {
  for (const m of text.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) {
    into.add(m[1].toLowerCase());
  }
  for (const m of text.matchAll(BARE_HOST)) into.add(m[1].toLowerCase());
}

/**
 * The hosts the app names: every URL or bare host name in the strings of
 * its code (tests, comments and the dev-only demo `src/dev/`, never fetched,
 * left out), in `index.html` (the CSP) and in `vite.config.ts`.
 */
function hosts(tree: string): string[] {
  const set = new Set<string>();
  const files = walk(tree, 'src').filter(
    (f) => isCode(f) && !isTest(f) && !f.startsWith('src/dev/')
  );
  for (const f of [...files, 'vite.config.ts']) {
    if (!existsSync(join(tree, f))) continue;
    for (const t of texts(parse(tree, f))) hostsIn(t, set);
  }
  const html = join(tree, 'index.html');
  if (existsSync(html)) {
    hostsIn(readFileSync(html, 'utf8').replace(/<!--[\s\S]*?-->/g, ''), set);
  }
  return [...set].sort();
}

interface TestCase {
  name: string;
  /** False when skipped, todo or expected to fail, itself or a describe. */
  runs: boolean;
}

const SKIPPING = new Set(['skip', 'todo', 'fails', 'skipIf', 'runIf']);
const SKIPPED_ROOT = new Set(['xit', 'xtest', 'xdescribe']);

/**
 * The callee chain of a test call: `it`, `it.skip`, `describe.only`,
 * `it.each(table)`; null when the call is no test API.
 */
function testCallee(
  e: ts.Expression
): { kind: 'test' | 'describe'; runs: boolean } | null {
  let runs = true;
  let cur: ts.Expression = e;
  for (;;) {
    if (ts.isCallExpression(cur)) {
      // it.each(table)(…), it.skipIf(cond)(…)
      cur = cur.expression;
    } else if (ts.isPropertyAccessExpression(cur)) {
      if (SKIPPING.has(cur.name.text)) runs = false;
      cur = cur.expression;
    } else break;
  }
  if (!ts.isIdentifier(cur)) return null;
  const root = cur.text;
  if (SKIPPED_ROOT.has(root)) runs = false;
  if (['it', 'test', 'xit', 'xtest'].includes(root))
    return { kind: 'test', runs };
  if (['describe', 'xdescribe', 'suite'].includes(root)) {
    return { kind: 'describe', runs };
  }
  return null;
}

/** Every `it`/`test` per test file, with multiplicity and whether it runs. */
function testCases(tree: string): Map<string, TestCase[]> {
  const out = new Map<string, TestCase[]>();
  for (const f of walk(tree, 'src').filter(isTest)) {
    const cases: TestCase[] = [];
    const walkNode = (n: ts.Node, running: boolean): void => {
      if (ts.isCallExpression(n) && n.arguments.length > 0) {
        const callee = testCallee(n.expression);
        const first = n.arguments[0];
        const name =
          ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)
            ? first.text
            : ts.isTemplateExpression(first)
              ? first.getText().slice(1, -1)
              : null;
        if (callee && name !== null) {
          const runs = running && callee.runs;
          if (callee.kind === 'test') cases.push({ name, runs });
          n.arguments.forEach((a) => walkNode(a, runs));
          return;
        }
      }
      n.forEachChild((c) => walkNode(c, running));
    };
    walkNode(parse(tree, f), true);
    out.set(f, cases);
  }
  return out;
}

function testCheck(tree0: string, tree1: string): Result {
  const t0 = testCases(tree0);
  const t1 = testCases(tree1);
  /** Running copies of each name, per file and over every file. */
  const tally = (m: Map<string, TestCase[]>) => {
    const perFile = new Map<string, Map<string, number>>();
    const total = new Map<string, number>();
    const idle = new Map<string, string>();
    for (const [file, cases] of m) {
      const counts = new Map<string, number>();
      for (const c of cases) {
        if (!c.runs) {
          idle.set(c.name, file);
          continue;
        }
        counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
        total.set(c.name, (total.get(c.name) ?? 0) + 1);
      }
      perFile.set(file, counts);
    }
    return { perFile, total, idle };
  };
  const a = tally(t0);
  const b = tally(t1);
  const lines: string[] = [];
  let missing = 0;
  let moved = 0;
  let cases = 0;
  for (const [name, want] of a.total) {
    cases += want;
    const retired = RETIRED_TESTS[name];
    if (retired && (b.total.get(name) ?? 0) === 0) {
      lines.push(`retired on purpose: "${name}" (${retired})`);
      continue;
    }
    const renamed = RENAMED_TESTS[name];
    const have =
      (b.total.get(name) ?? 0) + (renamed ? (b.total.get(renamed) ?? 0) : 0);
    if (renamed && (b.total.get(renamed) ?? 0) > 0) {
      lines.push(`renamed on purpose: "${name}" → "${renamed}"`);
    }
    if (have < want) {
      missing += want - have;
      const idle = b.idle.get(name);
      lines.push(
        idle
          ? `not run: "${name}" is skipped, todo or failing on purpose in ${idle}`
          : `missing: "${name}" (${want - have} of ${want})`
      );
      continue;
    }
    // Enough copies overall: report a file that lost some as a move.
    for (const [file, counts] of a.perFile) {
      const lost =
        (counts.get(name) ?? 0) - (b.perFile.get(file)?.get(name) ?? 0);
      if (lost <= 0 || renamed) continue;
      moved += lost;
      const to = [...b.perFile]
        .filter(
          ([f, c]) => (c.get(name) ?? 0) > (a.perFile.get(f)?.get(name) ?? 0)
        )
        .map(([f]) => f);
      lines.push(`moved: "${name}" ${file} → ${to.join(', ')}`);
    }
  }
  lines.unshift(
    `${cases} test cases on main (${a.total.size} names), ${moved} moved, ${missing} missing or not run`
  );
  return { name: 'unit tests of main still run', ok: missing === 0, lines };
}

function deps(tree: string): Record<string, string> {
  const pkg = JSON.parse(readFileSync(join(tree, 'package.json'), 'utf8'));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(pkg.dependencies ?? {})) {
    out[`dependencies ${k}`] = v as string;
  }
  for (const [k, v] of Object.entries(pkg.devDependencies ?? {})) {
    out[`devDependencies ${k}`] = v as string;
  }
  return out;
}

/** `yarn.lock` entries: each requested range → its resolved version. */
function lockEntries(tree: string): Map<string, string> {
  const out = new Map<string, string>();
  const file = join(tree, 'yarn.lock');
  if (!existsSync(file)) return out;
  for (const block of readFileSync(file, 'utf8').split(/\n\n+/)) {
    const lines = block.split('\n').filter((l) => !l.startsWith('#'));
    const head = lines[0];
    const version = /^\s+version "([^"]+)"/m.exec(block)?.[1];
    if (!head || !head.endsWith(':') || !version) continue;
    for (const spec of head.slice(0, -1).split(', ')) {
      out.set(spec.replace(/^"|"$/g, ''), version);
    }
  }
  return out;
}

function depsCheck(tree0: string, tree1: string): Result {
  const d0 = deps(tree0);
  const d1 = deps(tree1);
  const lines: string[] = [];
  let ok = true;
  for (const k of new Set([...Object.keys(d0), ...Object.keys(d1)])) {
    if (d0[k] === d1[k]) continue;
    const approved =
      d0[k] === undefined &&
      APPROVED_DEV_ADDITIONS.some((n) => k === `devDependencies ${n}`);
    ok &&= approved;
    lines.push(
      `${approved ? 'approved' : 'changed'}: ${k} ${d0[k] ?? '(none)'} → ${d1[k] ?? '(none)'}`
    );
  }
  // The lockfile: every entry of main resolves the same; new entries can
  // only come from the approved additions, which the line above pins.
  const l0 = lockEntries(tree0);
  const l1 = lockEntries(tree1);
  let added = 0;
  for (const [spec, v] of l0) {
    if (l1.get(spec) === v) continue;
    ok = false;
    lines.push(`yarn.lock: ${spec} ${v} → ${l1.get(spec) ?? '(gone)'}`);
  }
  for (const spec of l1.keys()) if (!l0.has(spec)) added += 1;
  lines.push(
    `yarn.lock: ${l0.size} entries of main resolve the same; ${added} added`
  );
  return { name: 'dependencies and yarn.lock', ok, lines };
}

function sameList(name: string, base: string[], head: string[]): Result {
  const left = [...base];
  const added: string[] = [];
  for (const h of head) {
    const i = left.indexOf(h);
    if (i >= 0) left.splice(i, 1);
    else added.push(h);
  }
  return {
    name,
    ok: left.length === 0 && added.length === 0,
    lines: [
      ...left.map((x) => `only on main: ${x}`),
      ...added.map((x) => `only on HEAD: ${x}`),
    ],
  };
}

// ----------------------------------------------------- model outputs (FR-049)

/** JSON with sorted keys; Maps and Sets keep their order. */
function stable(value: unknown): unknown {
  if (value instanceof Map) {
    return { $map: [...value].map(([k, v]) => [stable(k), stable(v)]) };
  }
  if (value instanceof Set) return { $set: [...value].map(stable) };
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value === 'number' && !Number.isFinite(value))
    return String(value);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      out[k] = stable((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

// The functions under test, loose on purpose: the same calls run against
// both trees, whose types are not the same module.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Mod = Record<string, any>;

interface ModelMods {
  aggregate: Mod;
  crate: Mod;
  match: Mod;
  reach: Mod;
  features: Mod;
  year: Mod;
}

/**
 * The release-year functions both trees export (main's round 005 is in
 * both): `yearOf` over every track, `parseYear` over awkward inputs,
 * `decadeOf` and `decadeLabel` over the years met. HEAD's own additions are
 * reported by `newYearChecks`, not compared.
 */
const YEAR_INPUTS: unknown[] = [
  1993,
  '1993',
  '1993-05',
  '1993-05-17',
  ' 2001/02',
  '0000',
  '1899',
  '2028',
  '2027',
  'abc',
  null,
  1993.5,
  '19930',
  '1993 remaster',
];

function yearOutputs(year: Mod, model: any, now: number): unknown {
  const ids = [...model.tracksByKey.values()]
    .map((t: any) => t.id)
    .filter((id: unknown) => typeof id === 'string');
  const years = ids.map((id: string) => year.yearOf(model, id));
  const decades = [...new Set(years.filter((y: unknown) => y !== null))]
    .map((y) => year.decadeOf(y))
    .sort();
  return {
    yearOf: years,
    parseYear: YEAR_INPUTS.map((v) => year.parseYear(v, now)),
    decades: [...new Set(decades)].map((d) => [d, year.decadeLabel(d)]),
  };
}

/** Every output the model areas give on one dataset. */
function modelOutputs(m: ModelMods, rows: unknown, now: number): unknown {
  const { aggregate, crate, match, reach, features, year } = m;
  const model = aggregate.buildModel(rows);
  const date = new Date(now);
  const periods = ['short_term', 'medium_term', 'long_term'];
  const out: Record<string, unknown> = {};

  // Ranking: Top, playlists by plays, artists by saved tracks.
  out.top = periods.map((p) => ({
    period: p,
    tracks: aggregate.topTracks(model, p),
    artists: aggregate.topArtists(model, p),
  }));
  out.playlists = model.playlists.map((p: any) => ({
    id: p.id,
    ranking: aggregate.playlistRanking(model, p.id),
  }));
  out.artists = model.artists.map((a: any) => ({
    key: a.key,
    tracks: aggregate.artistTracks(model, a.key),
  }));

  // Crate: the five views over every window, year and period.
  const plays = model.plays;
  out.rotation = crate.ROTATION_WINDOWS.map((w: number) =>
    crate.heavyRotation(plays, date, w)
  );
  out.gems = crate.GEM_WINDOWS.map((w: number) =>
    crate.forgottenGems(plays, date, w)
  );
  out.classics = ['years', 'plays'].map((s) => crate.classics(plays, s));
  const yearPeriods = [
    'all',
    'winter',
    'spring',
    'summer',
    'autumn',
    ...Array.from({ length: 12 }, (_, i) => i + 1),
  ];
  out.years = crate.yearsWithPlays(plays).map((y: number) => ({
    year: y,
    periods: yearPeriods.map((p) => crate.byYear(plays, y, p)),
  }));
  out.finish = ['finished', 'skipped'].map((t) => crate.finishRate(plays, t));

  // Match: every playlist, its first five seeds with a feature.
  out.match = model.playlists.map((p: any) => {
    const rows = aggregate.playlistRanking(model, p.id);
    const feat = (r: any) =>
      r.track.id ? features.featureFor(model, r.track.id) : null;
    const seeds = rows.filter((r: any) => feat(r) !== null).slice(0, 5);
    return seeds.map((seed: any) =>
      match.rankMatches(
        feat(seed),
        rows
          .filter((r: any) => r.entry.position !== seed.entry.position)
          .map((r: any) => ({
            id: String(r.entry.position),
            feature: feat(r),
          })),
        6
      )
    );
  });

  // Under the radar: every sort, and the coverage Settings shows.
  out.underRadar = ['plays', 'listeners', 'fans'].map((s) =>
    reach.rankUnderTheRadar(model, s)
  );
  out.reachCoverage = reach.reachCoverage(model);

  // Release year (round 005, in both trees).
  out.year = yearOutputs(year, model, now);
  return stable(out);
}

/**
 * HEAD's year functions main does not have (`datedYear`, `trackYear`): not
 * comparable, so checked against HEAD's own `yearOf`, which is compared.
 */
function newYearChecks(m: ModelMods, rows: unknown, main: Mod): string[] {
  const added = Object.keys(m.year).filter(
    (k) => typeof m.year[k] === 'function' && !(k in main)
  );
  const model = m.aggregate.buildModel(rows);
  const bad: string[] = [];
  for (const t of model.tracksByKey.values() as Iterable<any>) {
    if (typeof t.id !== 'string') continue;
    const want = m.year.yearOf(model, t.id);
    if (m.year.trackYear && m.year.trackYear(model, t.id) !== want) {
      bad.push(`trackYear(${t.id}) ≠ yearOf`);
    }
    if (
      m.year.datedYear &&
      (m.year.datedYear(model, t.id)?.year ?? null) !== want
    ) {
      bad.push(`datedYear(${t.id}) ≠ yearOf`);
    }
  }
  return [
    `new on HEAD, not on main: ${added.join(', ') || 'none'}; agree with yearOf on every track${bad.length ? `: NO (${bad.slice(0, 3).join('; ')})` : ''}`,
    ...(bad.length ? ['FAIL'] : []),
  ];
}

async function withRunner<T>(
  tree: string,
  use: (load: (path: string) => Promise<Mod>) => Promise<T>
): Promise<T> {
  const server = await createServer({
    root: tree,
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const runner = createServerModuleRunner(server.environments.ssr, {
    hmr: false,
  });
  try {
    return await use((path) => runner.import(join(tree, path)));
  } finally {
    await runner.close();
    await server.close();
  }
}

async function loadModel(
  load: (path: string) => Promise<Mod>
): Promise<ModelMods> {
  return {
    aggregate: await load('src/model/aggregate.ts'),
    crate: await load('src/model/crate.ts'),
    match: await load('src/model/match.ts'),
    reach: await load('src/model/reach.ts'),
    features: await load('src/model/features.ts'),
    year: await load('src/model/year.ts'),
  };
}

const VARIANTS = ['full', 'old-import', 'no-reach'];

async function modelCheck(mainTree: string, out: string): Promise<Result> {
  const datasets: { variant: string; rows: unknown; now: number }[] = [];
  let mainYear: Mod = {};
  await withRunner(mainTree, async (load) => {
    mainYear = { ...(await load('src/model/year.ts')) };
  });
  let extra: string[] = [];
  const head = await withRunner(ROOT, async (load) => {
    const demo = await load('src/dev/demo.ts');
    for (const v of VARIANTS) {
      datasets.push({
        variant: v,
        rows: demo.buildDemo(v, 1).rows,
        now: demo.DEMO_NOW,
      });
    }
    const mods = await loadModel(load);
    extra = newYearChecks(mods, structuredClone(datasets[0].rows), mainYear);
    return datasets.map((d) =>
      JSON.stringify(modelOutputs(mods, structuredClone(d.rows), d.now))
    );
  });
  const main = await withRunner(mainTree, async (load) => {
    const mods = await loadModel(load);
    return datasets.map((d) =>
      JSON.stringify(modelOutputs(mods, structuredClone(d.rows), d.now))
    );
  });
  const lines: string[] = [];
  let ok = !extra.includes('FAIL');
  datasets.forEach((d, i) => {
    writeFileSync(join(out, `model-main-${d.variant}.json`), main[i]);
    writeFileSync(join(out, `model-head-${d.variant}.json`), head[i]);
    const same = main[i] === head[i];
    ok &&= same;
    let at = 0;
    while (!same && main[i][at] === head[i][at]) at += 1;
    lines.push(
      same
        ? `demo '${d.variant}': ${head[i].length.toLocaleString('en')} bytes, equal`
        : `demo '${d.variant}': differ at byte ${at}: main …${main[i].slice(at, at + 80)}… HEAD …${head[i].slice(at, at + 80)}…`
    );
  });
  lines.push(...extra.filter((l) => l !== 'FAIL'));
  return {
    name: 'model outputs (ranking, Crate, Match, Under the radar, release year)',
    ok,
    lines,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------------- run

async function main(): Promise<number> {
  const base = baseCommit();
  const scratch = mkdtempSync(join(tmpdir(), 'invariants-'));
  const mainTree = join(scratch, 'main');
  console.log(
    `Invariants: HEAD (working tree) against main ${base.slice(0, 7)}`
  );
  git('worktree', 'add', '--detach', '--quiet', mainTree, base);
  const results: Result[] = [];
  try {
    // Main's tree has no node_modules; the dependencies check below proves
    // HEAD's are main's plus the approved dev additions.
    symlinkSync(join(ROOT, 'node_modules'), join(mainTree, 'node_modules'));

    const v = [dbVersion(mainTree), dbVersion(ROOT)];
    results.push({
      name: 'DB_VERSION',
      ok: v[0] === v[1],
      lines: [`main ${v[0]}, HEAD ${v[1]}`],
    });

    const headConfirms = confirmTexts(ROOT);
    const c = sameList('confirm() texts', confirmTexts(mainTree), headConfirms);
    c.lines.unshift(`${headConfirms.length} texts`);
    results.push(c);

    const headHosts = hosts(ROOT);
    const h = sameList(
      'external hosts (src/ strings, index.html, vite.config.ts)',
      hosts(mainTree),
      headHosts
    );
    h.lines.unshift(`${headHosts.length} hosts`);
    results.push(h);

    results.push(depsCheck(mainTree, ROOT));
    results.push(testCheck(mainTree, ROOT));
    results.push(await modelCheck(mainTree, scratch));
  } finally {
    git('worktree', 'remove', '--force', mainTree);
    for (const f of readdirSync(scratch)) {
      if (f.endsWith('.json') && !results.every((r) => r.ok)) continue;
      rmSync(join(scratch, f), { recursive: true, force: true });
    }
    if (readdirSync(scratch).length === 0) rmSync(scratch, { recursive: true });
    else console.log(`Model outputs kept in ${scratch}`);
  }

  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
    for (const l of r.lines) console.log(`      ${l}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(
    failed === 0 ? 'All invariants hold.' : `${failed} invariant(s) failed.`
  );
  return failed === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  }
);
