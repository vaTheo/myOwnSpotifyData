/// <reference types="node" />
/**
 * Before a full run of the visual loop, empties `shots-output/findings/`
 * and `shots-output/pages/`, so `yarn shots:summary` and `yarn shots:sheet`
 * read this run alone (a renamed or removed page never keeps reporting).
 * Any narrowed run keeps them and refreshes only the pages it ran: a
 * positional file or name filter, `-g`/`--grep`, `--grep-invert`,
 * `--project`, `--last-failed`, `--only-changed`, `--shard` or `--list`.
 */
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Flags that narrow the run (or run nothing). */
const NARROWING = new Set([
  '-g',
  '--grep',
  '--grep-invert',
  '--project',
  '--last-failed',
  '--only-changed',
  '--shard',
  '--list',
]);

/** Options whose value may follow as the next argument. */
const TAKES_VALUE = new Set([
  '-c',
  '--config',
  '--reporter',
  '-j',
  '--workers',
  '--repeat-each',
  '--retries',
  '--timeout',
  '--global-timeout',
  '--max-failures',
  '--output',
  '--trace',
  '--browser',
  '--tsconfig',
]);

/** True unless the command line runs every page: no positional argument
 *  after `test` and no narrowing flag. */
export function isPartialRun(argv: readonly string[]): boolean {
  const at = argv.indexOf('test');
  const args = at < 0 ? [] : argv.slice(at + 1);
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!a.startsWith('-')) return true; // a file or name filter
    const name = a.split('=')[0];
    if (NARROWING.has(name)) return true;
    if (TAKES_VALUE.has(name) && !a.includes('=')) i += 1;
  }
  return false;
}

export default function globalSetup(): void {
  if (isPartialRun(process.argv)) return;
  for (const dir of ['findings', 'pages']) {
    rmSync(`${ROOT}shots-output/${dir}`, { recursive: true, force: true });
  }
}
