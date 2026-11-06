/// <reference types="node" />
/**
 * Builds shots-output/contact-sheet.html from the last `yarn shots` run: for
 * each page, the 1440 and 390 px screenshots side by side with the findings
 * of each width. Run with `yarn shots:sheet`, or
 * `yarn shots:sheet --pages top-tracks,playlist-big` for a subset. Node runs
 * this file directly (type stripping), so it imports nothing but `node:`.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface Finding {
  check: string;
  selector: string;
  detail: string;
}

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = `${ROOT}shots-output/`;
const WIDTHS = ['1440', '1024', '768', '390'];
const SHOWN = ['1440', '390'];

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function findingsOf(width: string, id: string): Finding[] | null {
  const file = `${OUT}findings/${width}/${id}.json`;
  if (!existsSync(file)) return null;
  return (JSON.parse(readFileSync(file, 'utf8')) as { findings: Finding[] })
    .findings;
}

const arg = process.argv.indexOf('--pages');
const wanted =
  arg >= 0 && process.argv[arg + 1]
    ? new Set(process.argv[arg + 1].split(','))
    : null;
const ids = existsSync(`${OUT}pages/1440`)
  ? readdirSync(`${OUT}pages/1440`)
      .filter((f) => f.endsWith('.png') && !f.endsWith('-full.png'))
      .map((f) => f.slice(0, -4))
      .filter((id) => wanted === null || wanted.has(id))
      .sort()
  : [];

const sections = ids.map((id) => {
  const counts = WIDTHS.map((w) => {
    const f = findingsOf(w, id);
    return `${w}: ${f === null ? 'not run' : f.length === 0 ? 'clean' : `${f.length} finding(s)`}`;
  }).join(' · ');
  const shots = SHOWN.map((w) => {
    const f = findingsOf(w, id) ?? [];
    // Grouped by check: a count and three examples each, so a page with
    // thousands of undersized rows stays one readable line.
    const groups = new Map<string, Finding[]>();
    for (const x of f) groups.set(x.check, [...(groups.get(x.check) ?? []), x]);
    const items = [...groups].map(([check, list]) => {
      const examples = list
        .slice(0, 3)
        .map((x) => `${escape(x.selector)}: ${escape(x.detail)}`)
        .join('<br>');
      return `<li><b>${escape(check)} × ${list.length}</b><br>${examples}</li>`;
    });
    const list =
      f.length === 0
        ? '<p class="clean">No finding</p>'
        : `<ul>${items.join('')}</ul>`;
    return `<figure class="w${w}"><figcaption>${w} px</figcaption><a href="pages/${w}/${id}-full.png" title="Open the whole page"><img loading="lazy" src="pages/${w}/${id}.png" alt="${escape(id)} at ${w} px"></a>${list}</figure>`;
  }).join('');
  return `<section id="${escape(id)}"><h2>${escape(id)}</h2><p class="counts">${counts}</p><div class="row">${shots}</div></section>`;
});

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Contact sheet</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; padding: 24px; background: #0e1509; color: #dde6d0; font: 14px/1.5 system-ui, sans-serif; }
  h1 { font-size: 22px; } h2 { font-size: 16px; margin: 0; }
  section { border-top: 1px solid #3e4a34; padding: 24px 0; }
  .counts { color: #bdcbae; margin: 4px 0 12px; }
  .row { display: flex; gap: 24px; align-items: flex-start; }
  figure { margin: 0; } .w1440 { flex: 3; } .w390 { flex: 1; max-width: 390px; }
  figcaption { color: #bdcbae; margin-bottom: 4px; }
  img { width: 100%; border: 1px solid #3e4a34; border-radius: 8px; }
  ul { padding-left: 18px; color: #ffb4ab; } .clean { color: #7FFF00; }
  nav a { color: #7FFF00; margin-right: 12px; }
</style></head><body>
<h1>Contact sheet · ${ids.length} page(s)</h1>
<nav>${ids.map((id) => `<a href="#${escape(id)}">${escape(id)}</a>`).join('')}</nav>
${sections.join('\n')}
</body></html>
`;
writeFileSync(`${OUT}contact-sheet.html`, html);
console.log(`Wrote ${OUT}contact-sheet.html (${ids.length} pages)`);
