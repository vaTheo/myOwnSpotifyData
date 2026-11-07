/// <reference types="node" />
/**
 * Before a full run of the visual loop, empties `shots-output/findings/`
 * and `shots-output/pages/`, so `yarn shots:summary` and `yarn shots:sheet`
 * read this run alone (a renamed or removed page never keeps reporting).
 * A partial run (`-g`, `--grep`, `--project`, `--last-failed`, a file
 * filter) keeps them: it refreshes only the pages it ran, beside the last
 * full run's.
 */
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const FILTERS = [
  '-g',
  '--grep',
  '--grep-invert',
  '--project',
  '--last-failed',
  '--only-changed',
];

/** True when the command line narrows the run. */
export function isPartialRun(argv: readonly string[]): boolean {
  const i = argv.indexOf('test');
  const args = i < 0 ? argv : argv.slice(i + 1);
  return args.some(
    (a) =>
      FILTERS.some((f) => a === f || a.startsWith(`${f}=`)) ||
      /\.shots\.ts(:\d+)?$/.test(a)
  );
}

export default function globalSetup(): void {
  if (isPartialRun(process.argv)) return;
  for (const dir of ['findings', 'pages']) {
    rmSync(`${ROOT}shots-output/${dir}`, { recursive: true, force: true });
  }
}
