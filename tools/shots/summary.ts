/// <reference types="node" />
/**
 * A short text summary of the last `yarn shots` run, for reading in a
 * terminal or by an agent without loading the JSON: findings per check,
 * per page, and up to five distinct examples of the checks asked for.
 *
 *   yarn shots:summary                        counts only
 *   yarn shots:summary overlap,clipped-text   plus examples of those checks
 *
 * Node runs this file directly (type stripping): it imports only `node:`.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface Finding {
  check: string;
  selector: string;
  detail: string;
}

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIR = `${ROOT}shots-output/findings`;
const wanted = new Set((process.argv[2] ?? '').split(',').filter(Boolean));

if (!existsSync(DIR)) {
  console.log('No findings: run `yarn shots` first.');
  process.exit(0);
}

const byCheck = new Map<string, number>();
const byPage = new Map<string, Map<string, number>>();
const examples = new Map<string, Set<string>>();
let pages = 0;
for (const width of readdirSync(DIR).sort()) {
  for (const file of readdirSync(`${DIR}/${width}`).sort()) {
    pages += 1;
    const id = file.replace(/\.json$/, '');
    const { findings } = JSON.parse(
      readFileSync(`${DIR}/${width}/${file}`, 'utf8')
    ) as { findings: Finding[] };
    for (const f of findings) {
      byCheck.set(f.check, (byCheck.get(f.check) ?? 0) + 1);
      const page = byPage.get(id) ?? new Map<string, number>();
      page.set(f.check, (page.get(f.check) ?? 0) + 1);
      byPage.set(id, page);
      if (wanted.has(f.check)) {
        const list = examples.get(f.check) ?? new Set<string>();
        if (list.size < 5)
          list.add(`[${width} ${id}] ${f.selector}: ${f.detail}`);
        examples.set(f.check, list);
      }
    }
  }
}

const total = [...byCheck.values()].reduce((a, b) => a + b, 0);
console.log(`${pages} page runs, ${total} finding(s)`);
for (const [check, n] of [...byCheck].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${check}: ${n}`);
}
for (const [id, checks] of [...byPage].sort()) {
  console.log(
    `  ${id}: ${[...checks].map(([c, n]) => `${c} ${n}`).join(', ')}`
  );
}
for (const [check, list] of examples) {
  console.log(`-- ${check}`);
  for (const line of list) console.log(`  ${line}`);
}
