/// <reference types="node" />
/**
 * Opens the demo on a route for both runners (`all.shots.ts`,
 * `keyboard.shots.ts`), so they judge a page the same way: every request
 * leaving 127.0.0.1 is blocked and is a finding, every `console.error` and
 * page error is a finding, the clock is frozen on the demo's "now".
 */
import type { Page } from '@playwright/test';
import { DEMO_NOW, type DemoIds, type DemoVariant } from '../../src/dev/flag';
import type { Finding } from './checks';

/** Opens `?demo=<variant>` on `hash`; returns the hash it opened. */
export async function openDemo(
  page: Page,
  findings: Finding[],
  hash: string | ((ids: DemoIds) => string),
  variant: DemoVariant = 'full'
): Promise<string> {
  // Nothing leaves the computer; every error is a finding.
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
  await page.goto(`?demo=${variant}#/`);
  await page.waitForSelector('html[data-demo-ready]', { timeout: 30_000 });
  const h =
    typeof hash === 'string'
      ? hash
      : hash(await page.evaluate(() => window.__demo!.ids));
  await page.evaluate((x) => {
    location.hash = x;
  }, h);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  return h;
}
