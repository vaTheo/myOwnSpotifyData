import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// FR-009, ADR-02: nothing asks the shared store except the two runs, and no
// code of the app opens a port on load or from sync. A text check over
// `src/`, test files left out.
//
// These lists are deliberately exact. If one of them fails because you added a
// legitimate new user of the port, update the list here (and say why in the
// round's spec); if the new use reads on load or from sync, it is a bug.
const SRC = new URL('../', import.meta.url);

function sources(dir: URL, out: { path: string; text: string }[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) sources(url, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push({
        path: url.pathname.slice(SRC.pathname.length),
        text: readFileSync(url, 'utf8'),
      });
    }
  }
  return out;
}

const files = sources(SRC);
const filesWith = (re: RegExp) =>
  files
    .filter((f) => re.test(f.text))
    .map((f) => f.path)
    .sort();

describe('the shared store is read only by the two runs (FR-009)', () => {
  it('finds the source files to check', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('calls the read methods only in lookup.ts and reachRun.ts', () => {
    // A call is `.readTracks(` / `.readReach(` on a port; the definitions
    // (`shared.ts` type, `server/sharedFacts.ts` implementation) have no dot.
    expect(
      filesWith(/\.(readTracks|readReach)\(/),
      'a new file reads the shared store: if legitimate, update this list'
    ).toEqual(['features/lookup.ts', 'features/reachRun.ts']);
  });

  it('calls the share methods only in lookup.ts and reachRun.ts', () => {
    expect(
      filesWith(/\.(shareTracks|shareReach)\(/),
      'a new file writes the shared store: if legitimate, update this list'
    ).toEqual(['features/lookup.ts', 'features/reachRun.ts']);
  });

  it('names the port methods nowhere else than the type, the implementation and the runs', () => {
    expect(
      filesWith(/\b(readTracks|readReach|shareTracks|shareReach)\b/),
      'a new file names the port methods: if legitimate, update this list'
    ).toEqual([
      'features/lookup.ts',
      'features/reachRun.ts',
      'features/shared.ts',
      'server/sharedFacts.ts',
    ]);
  });

  it('builds the port in state.ts only, and hands it to the two run starters', () => {
    expect(
      filesWith(/createSharedFactsPort\(/),
      'createSharedFactsPort is called from a new file: if legitimate, update this list'
    ).toEqual(['model/state.ts', 'server/sharedFacts.ts']);
    const state = files.find((f) => f.path === 'model/state.ts')!.text;
    const lines = state.split('\n');
    const uses = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => /\bsharedPort\(\)/.test(line));
    // Besides the definition, the use sites are `shared: sharedPort()`, each
    // inside the function that starts the lookup or the reach run.
    const sites = uses.filter(({ line }) => !/function sharedPort/.test(line));
    expect(sites).toHaveLength(2);
    const owners = sites.map(({ i }) => {
      for (let j = i; j >= 0; j--) {
        const m = /^export async function (\w+)/.exec(lines[j]!);
        if (m) return m[1];
      }
      return null;
    });
    expect(owners).toEqual(['startLookup', 'startReach']);
    for (const { line } of sites) {
      expect(line.trim()).toBe('shared: sharedPort(),');
    }
  });

  it('lets the screens only ask whether a port exists, never use one', () => {
    for (const f of files) {
      if (f.path === 'model/state.ts') continue;
      for (const line of f.text.split('\n')) {
        if (!/\bsharedPort\(\)/.test(line)) continue;
        expect(line, f.path).toMatch(/sharedPort\(\) !== undefined/);
      }
    }
  });

  it('keeps the sync and server push code away from the port', () => {
    const touching = filesWith(/sharedPort|SharedFactsPort|sharedFacts/);
    // The runs, the type, the implementation, the wiring, the two screens.
    expect(
      touching,
      'a new file touches the port: if legitimate, update this list'
    ).toEqual([
      'features/lookup.ts',
      'features/reachRun.ts',
      'features/shared.ts',
      'model/state.ts',
      'server/sharedFacts.ts',
      'ui/settings/AudioSection.tsx',
      'ui/settings/ReachSection.tsx',
      'ui/signin/gate.ts',
    ]);
  });
});
