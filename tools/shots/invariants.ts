/// <reference types="node" />
/**
 * The redesign's static invariants (spec 003, T113, FR-049): what the branch
 * must not change against `main`. Each check prints PASS or FAIL with what
 * differs; the run exits 1 on any FAIL. `yarn invariants`.
 *
 * - `DB_VERSION` is the same.
 * - Every `confirm()` text is the same (literals, the constants they name,
 *   and the two question builders), whatever file asks it.
 * - The external hosts named in `src/` (tests excluded) are the same.
 * - The dependencies are the same, apart from the approved dev additions.
 * - Every unit test name on `main` still exists (a moved one is listed with
 *   its new file).
 * - The ranking, Crate, Match and Under the radar functions of `src/model/`
 *   give byte-equal JSON on the demo dataset in both trees.
 *
 * `main` is the merge base of HEAD with `origin/main` (override with
 * `INVARIANTS_BASE=<commit>`); its tree is a temporary `git worktree` in the
 * system temp directory, removed at the end. HEAD is the working tree, so
 * uncommitted edits are judged too. The demo dataset is built from HEAD's
 * `src/dev/demo.ts` (main has no demo) and handed to both trees unchanged.
 *
 * Node runs this file directly (type stripping): it imports only `node:` and
 * Vite, whose module runner loads each tree's TypeScript.
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
};

/** Functions that build a `confirm()` question passed in by a caller. */
const QUESTION_BUILDERS = ['likeQuestion', 'replaceQuestion'];

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
const isSource = (f: string) => /\.(ts|tsx|css|html)$/.test(f) && !isTest(f);

/** The source without comments (strings kept), for call scanning. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
    } else if (c === "'" || c === '"' || c === '`') {
      const end = skipString(src, i);
      out += src.slice(i, end);
      i = end;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** The index just past the string literal starting at `i`. */
function skipString(src: string, i: number): number {
  const q = src[i];
  let j = i + 1;
  while (j < src.length && src[j] !== q) j += src[j] === '\\' ? 2 : 1;
  return j + 1;
}

/** The text between the parenthesis at `open` and its match. */
function argsAt(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipString(src, i) - 1;
    } else if (c === '(') {
      depth += 1;
    } else if (c === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return src.slice(open + 1);
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** A string built of literals joined by `+`, or null. */
function literalValue(expr: string): string | null {
  const parts = expr.split(/\s*\+\s*/);
  let out = '';
  for (const p of parts) {
    const m = /^(['"`])([\s\S]*)\1$/.exec(p.trim());
    if (!m || (m[1] === '`' && m[2].includes('${'))) return null;
    out += m[2].replace(/\\(.)/g, '$1');
  }
  return out;
}

// ---------------------------------------------------------------- checks

function dbVersion(tree: string): string {
  const src = readFileSync(join(tree, 'src/db/schema.ts'), 'utf8');
  return /export const DB_VERSION\s*=\s*(\d+)/.exec(src)?.[1] ?? 'absent';
}

/** Every confirm() text in the tree, sorted (a multiset). */
function confirmTexts(tree: string): string[] {
  const files = walk(tree, 'src').filter((f) => /\.tsx?$/.test(f));
  const sources = new Map(
    files
      .filter((f) => !isTest(f))
      .map((f) => [f, stripComments(readFileSync(join(tree, f), 'utf8'))])
  );
  const constant = (name: string): string | null => {
    for (const src of sources.values()) {
      const at = new RegExp(`\\b${name}\\s*=\\s*`).exec(src);
      if (!at) continue;
      const start = at.index + at[0].length;
      const end = src.indexOf(';', start);
      return literalValue(src.slice(start, end));
    }
    return null;
  };
  const body = (fn: string): string | null => {
    for (const src of sources.values()) {
      const at = new RegExp(`function ${fn}\\s*\\(`).exec(src);
      if (!at) continue;
      const open = src.indexOf('{', at.index + at[0].length);
      let depth = 0;
      for (let i = open; i < src.length; i += 1) {
        const c = src[i];
        if (c === "'" || c === '"' || c === '`') i = skipString(src, i) - 1;
        else if (c === '{') depth += 1;
        else if (c === '}' && --depth === 0) {
          return squash(src.slice(open, i + 1));
        }
      }
    }
    return null;
  };
  const texts: string[] = [];
  for (const src of sources.values()) {
    for (const m of src.matchAll(/(?<![\w.])confirm\s*\(/g)) {
      const arg = squash(argsAt(src, m.index + m[0].length - 1));
      if (arg === '') continue;
      const lit = literalValue(arg);
      const call = /^(\w+)\(/.exec(arg)?.[1];
      if (lit !== null) texts.push(`"${lit}"`);
      else if (/^[A-Z][A-Z0-9_]*$/.test(arg)) {
        texts.push(`${arg} = "${constant(arg) ?? '?'}"`);
      } else if (call) texts.push(`${call}(…) ${body(call) ?? '?'}`);
      else texts.push(`(${arg})`);
    }
  }
  for (const fn of QUESTION_BUILDERS) {
    texts.push(`builder ${fn} ${body(fn) ?? 'absent'}`);
  }
  return texts.sort();
}

/**
 * Hosts of every http(s) URL written in the app's code: tests, comments and
 * the dev-only demo (`src/dev/`, absent from a production build, its URLs
 * never fetched) are left out.
 */
function hosts(tree: string): string[] {
  const set = new Set<string>();
  const files = walk(tree, 'src').filter(
    (f) => isSource(f) && !f.startsWith('src/dev/')
  );
  for (const f of files) {
    const raw = readFileSync(join(tree, f), 'utf8');
    const src = f.endsWith('.html') ? raw : stripComments(raw);
    for (const m of src.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) {
      set.add(m[1].toLowerCase());
    }
  }
  return [...set].sort();
}

/** Every `it`/`test` name per test file. */
function testNames(tree: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const f of walk(tree, 'src').filter(isTest)) {
    const src = stripComments(readFileSync(join(tree, f), 'utf8'));
    const names = new Set<string>();
    const re =
      /(?<![\w.])(?:it|test)(?:\.(?:only|skip|todo|concurrent|fails))?(\.each)?\s*\(/g;
    for (const m of src.matchAll(re)) {
      let at = m.index + m[0].length - 1;
      if (m[1]) {
        // it.each(table)('name', …): skip the table to the second call.
        at += argsAt(src, at).length + 2;
        while (/\s/.test(src[at] ?? '')) at += 1;
        if (src[at] !== '(') continue;
      }
      let s = at + 1;
      while (/\s/.test(src[s] ?? '')) s += 1;
      if (!["'", '"', '`'].includes(src[s])) continue;
      names.add(src.slice(s + 1, skipString(src, s) - 1));
    }
    out.set(f, names);
  }
  return out;
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
}

/** Every output the four model areas give on one dataset. */
function modelOutputs(m: ModelMods, rows: unknown, now: number): unknown {
  const { aggregate, crate, match, reach, features } = m;
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
  return stable(out);
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
  };
}

const VARIANTS = ['full', 'old-import', 'no-reach'];

async function modelCheck(mainTree: string, out: string): Promise<Result> {
  const datasets: { variant: string; rows: unknown; now: number }[] = [];
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
    return datasets.map((d) =>
      JSON.stringify(modelOutputs(mods, structuredClone(d.rows), d.now))
    );
  });
  const base = await withRunner(mainTree, async (load) => {
    const mods = await loadModel(load);
    return datasets.map((d) =>
      JSON.stringify(modelOutputs(mods, structuredClone(d.rows), d.now))
    );
  });
  const lines: string[] = [];
  let ok = true;
  datasets.forEach((d, i) => {
    writeFileSync(join(out, `model-main-${d.variant}.json`), base[i]);
    writeFileSync(join(out, `model-head-${d.variant}.json`), head[i]);
    const same = base[i] === head[i];
    ok &&= same;
    let at = 0;
    while (!same && base[i][at] === head[i][at]) at += 1;
    lines.push(
      same
        ? `demo '${d.variant}': ${head[i].length.toLocaleString('en')} bytes, equal`
        : `demo '${d.variant}': differ at byte ${at}: main …${base[i].slice(at, at + 80)}… HEAD …${head[i].slice(at, at + 80)}…`
    );
  });
  return {
    name: 'model outputs (ranking, Crate, Match, Under the radar)',
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

    const c = sameList(
      'confirm() texts',
      confirmTexts(mainTree),
      confirmTexts(ROOT)
    );
    c.lines.unshift(`${confirmTexts(ROOT).length} texts`);
    results.push(c);

    const h = sameList(
      'external hosts named in src/',
      hosts(mainTree),
      hosts(ROOT)
    );
    h.lines.unshift(`${hosts(ROOT).length} hosts`);
    results.push(h);

    const d0 = deps(mainTree);
    const d1 = deps(ROOT);
    const depLines: string[] = [];
    let depOk = true;
    for (const k of new Set([...Object.keys(d0), ...Object.keys(d1)])) {
      if (d0[k] === d1[k]) continue;
      const approved =
        d0[k] === undefined &&
        APPROVED_DEV_ADDITIONS.some((n) => k === `devDependencies ${n}`);
      depOk &&= approved;
      depLines.push(
        `${approved ? 'approved' : 'changed'}: ${k} ${d0[k] ?? '(none)'} → ${d1[k] ?? '(none)'}`
      );
    }
    results.push({ name: 'dependencies', ok: depOk, lines: depLines });

    const t0 = testNames(mainTree);
    const t1 = testNames(ROOT);
    const testLines: string[] = [];
    let moved = 0;
    let total = 0;
    for (const [file, names] of t0) {
      for (const n of names) {
        total += 1;
        if (t1.get(file)?.has(n)) continue;
        const renamed = RENAMED_TESTS[n];
        if (renamed && t1.get(file)?.has(renamed)) {
          testLines.push(`renamed on purpose: "${n}" → "${renamed}" (${file})`);
          continue;
        }
        const now = [...t1].find(([, s]) => s.has(n))?.[0];
        if (now) {
          moved += 1;
          testLines.push(`moved: "${n}" ${file} → ${now}`);
        } else testLines.push(`missing: "${n}" (${file})`);
      }
    }
    const missing = testLines.filter((l) => l.startsWith('missing')).length;
    testLines.unshift(
      `${total} names on main, ${moved} moved, ${missing} missing`
    );
    results.push({
      name: 'unit test names',
      ok: missing === 0,
      lines: testLines,
    });

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
