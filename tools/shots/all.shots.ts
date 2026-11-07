/// <reference types="node" />
/**
 * The visual loop's runner (spec 003, research D19). For every page of
 * `pages.ts` and every width project: block any request that leaves
 * 127.0.0.1, freeze the clock on the demo's "now", open the page on demo
 * data, run the layout checks, the focus check and axe (WCAG 2.2 AA), save
 * a full-page screenshot, compare it with the owner-approved baseline when
 * one exists, and fail on any finding. Judge a run by its exit code.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_NOW } from '../../src/dev/flag';
import { layoutChecks, type Finding } from './checks';
import { PAGES, READY } from './pages';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

function save(path: string, body: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

/** Tabs through the first three controls; each must show a 3 px ring. */
async function focusChecks(page: Page): Promise<Finding[]> {
  const findings: Finding[] = [];
  await page.locator('body').click({ position: { x: 1, y: 1 }, force: true });
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return {
        label: `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`,
        outline: s.outlineStyle === 'none' ? 0 : parseFloat(s.outlineWidth),
        shadow: s.boxShadow !== 'none',
      };
    });
    if (ring === null) break;
    if (ring.outline < 3 && !ring.shadow) {
      findings.push({
        check: 'focus-visible',
        selector: ring.label,
        detail: `focus ring ${ring.outline}px, needs 3px`,
      });
    }
  }
  return findings;
}

for (const shot of PAGES) {
  test(shot.id, async ({ page }, testInfo) => {
    test.skip(
      shot.since !== undefined && !READY.includes(shot.since),
      `${shot.since} not built yet`
    );
    const findings: Finding[] = [];

    // 9. Nothing leaves the computer; every error is a finding.
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      findings.push({
        check: 'network',
        selector: route.request().resourceType(),
        detail: `blocked ${url.origin}${url.pathname}`,
      });
      return route.abort('blockedbyclient');
    });
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      // The blocked requests above are already findings of their own.
      if (msg.text().includes('ERR_BLOCKED_BY_CLIENT')) return;
      findings.push({
        check: 'console',
        selector: 'console',
        detail: msg.text(),
      });
    });
    page.on('pageerror', (err) => {
      findings.push({
        check: 'console',
        selector: 'pageerror',
        detail: err.message,
      });
    });

    await page.clock.setFixedTime(new Date(DEMO_NOW));
    await page.goto(`?demo=${shot.variant ?? 'full'}#/`);
    await page.waitForSelector('html[data-demo-ready]', { timeout: 30_000 });
    const hash =
      typeof shot.hash === 'string'
        ? shot.hash
        : shot.hash(await page.evaluate(() => window.__demo!.ids));
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    if (shot.setup) await shot.setup(page);
    await page.waitForTimeout(150);

    // A page judged while blank or still loading passes every check for
    // nothing (seen once per engine on a cold dev server, S11).
    const unready = await page.evaluate(() =>
      document.querySelector('.screen-loading')
        ? 'still loading the library'
        : (document.body.innerText ?? '').trim() === ''
          ? 'blank page'
          : null
    );
    if (unready) {
      findings.push({ check: 'page', selector: shot.id, detail: unready });
    }
    findings.push(...(await page.evaluate(layoutChecks)));
    if (shot.expect) {
      for (const detail of await shot.expect(page)) {
        findings.push({ check: 'page', selector: shot.id, detail });
      }
    }
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    for (const v of axe.violations) {
      findings.push({
        check: `axe:${v.id}`,
        selector: v.nodes[0]?.target.join(' ') ?? '',
        detail: `${v.impact ?? ''} · ${v.nodes.length} node(s) · ${v.help}`,
      });
    }

    // Two pictures: the screen as the owner first sees it, and the whole
    // page. A full-page capture draws fixed bars where the first screen ends,
    // so the screen-sized one is the one to judge the layout by.
    const project = testInfo.project.name;
    const dir = `${ROOT}shots-output/pages/${project}`;
    save(
      `${dir}/${shot.id}.png`,
      await page.screenshot({ animations: 'disabled' })
    );
    save(
      `${dir}/${shot.id}-full.png`,
      await page.screenshot({ fullPage: true, animations: 'disabled' })
    );

    // Focus last: tabbing moves the page, the screenshot is taken already.
    findings.push(...(await focusChecks(page)));

    save(
      `${ROOT}shots-output/findings/${project}/${shot.id}.json`,
      JSON.stringify({ id: shot.id, project, hash, findings }, null, 2)
    );
    await testInfo.attach('findings', {
      body: JSON.stringify(findings, null, 2),
      contentType: 'application/json',
    });

    const baseline = testInfo.snapshotPath(`${shot.id}.png`);
    if (existsSync(baseline) || testInfo.config.updateSnapshots === 'all') {
      await page.evaluate(() => scrollTo(0, 0));
      await expect(page).toHaveScreenshot(`${shot.id}.png`, { fullPage: true });
    }

    expect(
      findings,
      findings.map((f) => `${f.check} ${f.selector}: ${f.detail}`).join('\n')
    ).toEqual([]);
  });
}
