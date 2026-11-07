/// <reference types="node" />
/**
 * The keyboard-only walkthrough (spec 003 T100, FR-043, quickstart §12),
 * at 1440 and 390 px on the demo data. Two kinds of test:
 *
 * - a Tab sweep of every screen: each stop must show a 3 px ring, sit
 *   inside the window and not under a bar (WCAG 2.4.11), and the stops the
 *   screen promises (Create playlist, the queue buttons…) must be reached;
 * - the layered keys: `/` and Ctrl+K open the search, Escape clears its
 *   text then closes it; arrows move through a table and Enter opens the
 *   details; Escape closes the topmost layer only (Activity > sheet) and
 *   gives the focus back; the key picker and the row menus.
 *
 * Findings land beside the page findings (`kbd-<id>.json`), so
 * `yarn shots:summary` counts them. Judge a run by its exit code.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEMO_NOW, type DemoIds, type DemoVariant } from '../../src/dev/flag';
import type { Finding } from './checks';
import { openDemo } from './open';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const enc = encodeURIComponent;
const SUNRISE = 'https://www.youtube.com/watch?v=demoSet0001';

/** Opens the demo on a route with the page runner's helper (console
 *  errors, page errors and outside requests are findings), then settles. */
async function open(
  page: Page,
  findings: Finding[],
  hash: string | ((ids: DemoIds) => string),
  variant: DemoVariant = 'full'
): Promise<void> {
  await openDemo(page, findings, hash, variant);
  await page.waitForTimeout(150);
}

/** The stops of the last sweep, saved with the findings for S14. */
let lastStops: string[] = [];

interface Stop {
  label: string;
  ring: boolean;
  /** The element the sweep started on: the sweep went round. */
  isFirst: boolean;
  inView: boolean;
  covered: string | null;
}

/** What the focused element is, and whether it can be seen. */
async function stop(page: Page): Promise<Stop | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const field = el as HTMLInputElement;
    const name =
      el.getAttribute('aria-label') ??
      (field.labels?.[0]?.textContent || field.placeholder || null) ??
      (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const role = el.getAttribute('role') ?? el.tagName.toLowerCase();
    // The ring is the element's own: its outline, or the outline of its
    // own ::after or ::before box (a card-wide link, `.hub-link`). A parent's
    // ring or a resting shadow does not count.
    const width = (c: CSSStyleDeclaration) =>
      c.outlineStyle === 'none' ? 0 : parseFloat(c.outlineWidth);
    const outline = Math.max(
      width(getComputedStyle(el)),
      width(getComputedStyle(el, '::after')),
      width(getComputedStyle(el, '::before'))
    );
    const w = window as unknown as { __kbdFirst?: Element };
    const isFirst = w.__kbdFirst === el;
    w.__kbdFirst ??= el;
    const r = el.getBoundingClientRect();
    const inView =
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < innerHeight &&
      r.left < innerWidth;
    // Covered: the middle of the control (clamped to the window) belongs
    // to something else, a fixed bar or a sheet laid over it.
    const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
    const hit = document.elementFromPoint(x, y);
    const covered =
      hit && hit !== el && !el.contains(hit) && !hit.contains(el)
        ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]}`
        : null;
    return {
      label: `${role} "${name}"`,
      ring: outline >= 3,
      isFirst,
      inView,
      covered,
    };
  });
}

/**
 * Tabs through the whole screen from the top, up to `max` stops, and
 * returns the labels met. Each stop without a ring, outside the window or
 * under another element is a finding.
 */
async function sweep(
  page: Page,
  findings: Finding[],
  max = 160
): Promise<string[]> {
  // Blur alone keeps the browser's starting point (a clicked tab): a
  // focusable mark at the top of the body moves it to the document start.
  await page.evaluate(() => {
    scrollTo(0, 0);
    delete (window as unknown as { __kbdFirst?: Element }).__kbdFirst;
    const mark = document.createElement('span');
    mark.tabIndex = -1;
    mark.id = 'kbd-start';
    document.body.prepend(mark);
    mark.focus({ preventScroll: true });
  });
  const seen: string[] = [];
  lastStops = seen;
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    if (i === 0) {
      await page.evaluate(() => document.getElementById('kbd-start')?.remove());
    }
    const s = await stop(page);
    if (s === null) break;
    if (s.isFirst) break;
    seen.push(s.label);
    if (!s.ring) {
      findings.push({
        check: 'kbd-ring',
        selector: s.label,
        detail: 'no visible focus ring',
      });
    }
    if (!s.inView) {
      findings.push({
        check: 'kbd-offscreen',
        selector: s.label,
        detail: 'focused outside the window',
      });
    } else if (s.covered) {
      findings.push({
        check: 'kbd-obscured',
        selector: s.label,
        detail: `covered by ${s.covered}`,
      });
    }
  }
  if (seen.length >= max) {
    findings.push({
      check: 'kbd-long',
      selector: 'Tab',
      detail: `more than ${max} Tab stops: a list is not one stop`,
    });
  }
  return seen;
}

function need(
  findings: Finding[],
  seen: string[],
  what: RegExp,
  why: string
): void {
  if (!seen.some((l) => what.test(l))) {
    findings.push({
      check: 'kbd-unreachable',
      selector: String(what),
      detail: why,
    });
  }
}

function finding(findings: Finding[], selector: string, detail: string): void {
  findings.push({ check: 'kbd-key', selector, detail });
}

/** Tabs until the focus matches, up to `max` presses; false when never. */
async function tabTo(page: Page, what: RegExp, max = 160): Promise<boolean> {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    const s = await stop(page);
    if (s && what.test(s.label)) return true;
  }
  return false;
}

/** Waits up to a second for the locator to show; false when it never does. */
async function shows(l: Locator): Promise<boolean> {
  return l
    .first()
    .waitFor({ state: 'visible', timeout: 1000 })
    .then(
      () => true,
      () => false
    );
}

/** Waits up to a second for the locator to go; false when it stays. */
async function gone(l: Locator): Promise<boolean> {
  return l
    .first()
    .waitFor({ state: 'hidden', timeout: 1000 })
    .then(
      () => true,
      () => false
    );
}

async function focused(page: Page): Promise<string> {
  return (await stop(page))?.label ?? 'body';
}

interface Walk {
  id: string;
  hash: string | ((ids: DemoIds) => string);
  variant?: DemoVariant;
  run: (page: Page, findings: Finding[]) => Promise<void>;
}

/** The screens of the walkthrough, each swept; extra stops it must reach. */
const SCREENS: {
  id: string;
  hash: string | ((ids: DemoIds) => string);
  variant?: DemoVariant;
  setup?: (page: Page) => Promise<void>;
  wideNeeds?: [RegExp, string][];
  needs?: [RegExp, string][];
}[] = [
  { id: 'overview', hash: '#/' },
  { id: 'top', hash: '#/top' },
  { id: 'crate', hash: '#/crate' },
  { id: 'crate-rotation', hash: '#/crate/rotation' },
  { id: 'crate-year', hash: '#/crate/year' },
  { id: 'crate-finish', hash: '#/crate/finish' },
  { id: 'playlists', hash: '#/playlists' },
  {
    id: 'playlist',
    hash: (ids) => `#/playlist/${enc(ids.bigPlaylist ?? ids.playlist ?? '')}`,
    // Phones show the filters inline, larger windows fold them away.
    needs: [[/^row /, 'a track of the playlist']],
    wideNeeds: [[/"Filters"/, 'the Filters button']],
  },
  { id: 'artists', hash: '#/artists' },
  {
    id: 'artists-radar',
    hash: '#/artists',
    setup: (page) =>
      page
        .getByRole('tab', { name: 'Under the radar', exact: true })
        .first()
        .click(),
  },
  {
    id: 'artist',
    hash: (ids) => `#/artist/${enc(ids.artist ?? '')}`,
    needs: [[/^row /, 'a track of the artist']],
  },
  { id: 'mix', hash: '#/mix' },
  {
    id: 'mix-open',
    hash: `#/mix/${enc(SUNRISE)}`,
    needs: [
      [/Create playlist/, 'Create playlist'],
      [/More for /, 'a row menu'],
    ],
  },
  { id: 'settings', hash: '#/settings' },
  { id: 'import', hash: '#/import' },
];

const WALKS: Walk[] = [
  ...SCREENS.map((s): Walk => ({
    id: `sweep-${s.id}`,
    hash: s.hash,
    variant: s.variant,
    run: async (page, findings) => {
      if (s.setup) {
        await s.setup(page);
        await page.waitForTimeout(150);
      }
      const seen = await sweep(page, findings);
      if (seen.length < 3) {
        findings.push({
          check: 'kbd-unreachable',
          selector: s.id,
          detail: `only ${seen.length} stop(s)`,
        });
      }
      const wide = (page.viewportSize()?.width ?? 0) >= 600;
      for (const [what, why] of [
        ...(s.needs ?? []),
        ...(wide ? (s.wideNeeds ?? []) : []),
      ])
        need(findings, seen, what, why);
    },
  })),
  {
    // `/` and Ctrl+K open the search; Escape clears, then closes, and the
    // focus goes back to where it was.
    id: 'search',
    hash: '#/top',
    run: async (page, findings) => {
      await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.blur()
      );
      await tabTo(page, /./);
      const before = await focused(page);
      await page.keyboard.press('/');
      const field = page
        .getByRole('searchbox', { name: /Search tracks/ })
        .or(page.getByRole('combobox', { name: /Search tracks/ }));
      if (!(await shows(field))) {
        finding(findings, '/', 'does not open the search');
        return;
      }
      if (!(await field.evaluate((el) => el === document.activeElement))) {
        finding(findings, '/', 'the search field does not take the focus');
      }
      await page.keyboard.type('a');
      await page.waitForTimeout(100);
      const active = () => field.getAttribute('aria-activedescendant');
      const atFirst = await active();
      await page.keyboard.press('ArrowDown');
      const atSecond = await active();
      if (!atSecond || atSecond === atFirst) {
        finding(findings, 'ArrowDown', 'does not move the selected result');
      } else if (
        (await page
          .locator(`[id="${atSecond}"]`)
          .getAttribute('aria-selected')) !== 'true'
      ) {
        finding(findings, 'ArrowDown', 'the result it names is not selected');
      }
      await page.keyboard.press('Escape');
      if (!(await shows(field))) {
        finding(
          findings,
          'Escape',
          'closed the search instead of clearing the text'
        );
        return;
      }
      if ((await field.inputValue()) !== '')
        finding(findings, 'Escape', 'did not clear the text');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      if (!(await gone(field)))
        finding(findings, 'Escape', 'did not close the empty search');
      const after = await focused(page);
      if (after !== before)
        finding(
          findings,
          'Escape',
          `focus went to ${after}, not back to ${before}`
        );
      await page.keyboard.press('Control+k');
      if (!(await shows(field))) {
        finding(findings, 'Ctrl+K', 'does not open the search');
        return;
      }
      // Enter opens the selected result: the search closes and the address
      // names what was opened (a track's details, or a screen).
      const from = page.url();
      await page.keyboard.type('a');
      await page.waitForTimeout(100);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      if (!(await gone(field))) {
        finding(findings, 'Enter', 'did not close the search');
      }
      await page.waitForTimeout(200);
      if (page.url() === from) {
        finding(findings, 'Enter', 'did not open the selected result');
      }
    },
  },
  {
    // A table: arrows move between rows, Enter opens the details, Escape
    // closes them and gives the focus back to the row.
    id: 'table',
    hash: '#/top',
    run: async (page, findings) => {
      if (!(await tabTo(page, /^row /))) {
        finding(findings, 'Tab', 'never reaches a table row');
        return;
      }
      const first = await focused(page);
      await page.keyboard.press('ArrowDown');
      const second = await focused(page);
      if (second === first || !second.startsWith('row ')) {
        finding(findings, 'ArrowDown', `focus ${second} after ${first}`);
      }
      await page.keyboard.press('ArrowUp');
      if ((await focused(page)) !== first)
        finding(findings, 'ArrowUp', 'does not come back');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      if (!page.url().includes('d=')) {
        finding(findings, 'Enter', 'does not open the details');
        return;
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      if (page.url().includes('d='))
        finding(findings, 'Escape', 'does not close the details');
      const back = await focused(page);
      if (back !== first)
        finding(findings, 'Escape', `focus on ${back}, not back on ${first}`);
    },
  },
  {
    // The details over a table, then Activity over both: Escape closes
    // Activity alone, then the details.
    id: 'layers',
    hash: '#/top',
    run: async (page, findings) => {
      await page.evaluate(() =>
        window.__demo?.set('syncState', {
          status: 'running',
          done: 3,
          total: 40,
          current: 'Warm-up',
          pending: [],
        })
      );
      await page.waitForTimeout(100);
      // On a phone the details are a full-screen dialog that holds the
      // focus: Activity is not under it, so it is checked alone.
      const compact = (page.viewportSize()?.width ?? 0) < 600;
      if (!compact) {
        if (!(await tabTo(page, /^row /))) {
          finding(findings, 'Tab', 'never reaches a table row');
          return;
        }
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
      }
      const activity = page.getByRole('button', {
        name: /^Running|jobs running$/,
      });
      if (!(await shows(activity))) {
        finding(findings, 'Activity', 'no Activity button with a job running');
        return;
      }
      await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.blur()
      );
      if (compact && !(await tabTo(page, /Running|jobs running/, 30))) {
        finding(findings, 'Tab', 'never reaches the Activity button');
        return;
      }
      if (!compact) await activity.focus();
      await page.keyboard.press('Enter');
      const panel = page.getByRole('dialog', { name: 'Running jobs' });
      if (!(await shows(panel))) {
        finding(findings, 'Enter', 'does not open Activity');
        return;
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      if (!(await gone(panel)))
        finding(
          findings,
          'Escape',
          `did not close Activity (focus ${await focused(page)})`
        );
      if (!compact && !page.url().includes('d='))
        finding(findings, 'Escape', 'closed the details with Activity');
      if (!/Running|jobs running/.test(await focused(page))) {
        finding(
          findings,
          'Escape',
          `focus on ${await focused(page)}, not the Activity button`
        );
      }
      if (compact) return;
      // The search over the details: Escape closes the search alone.
      await page.keyboard.press('/');
      const field = page.getByRole('combobox', { name: /Search tracks/ });
      if (!(await shows(field))) {
        finding(findings, '/', 'does not open the search over the details');
        return;
      }
      await page.keyboard.press('Escape');
      if (!(await gone(field)))
        finding(findings, 'Escape', 'did not close the search');
      if (!page.url().includes('d='))
        finding(findings, 'Escape', 'closed the details with the search');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      if (page.url().includes('d='))
        finding(findings, 'Escape', 'last Escape did not close the details');
    },
  },
  {
    // A list–detail screen at 1440 (a playlist beside the list): Escape
    // closes the details sheet first, then the detail pane, and the focus
    // goes back to the playlist's row in the full list.
    id: 'pane',
    hash: (ids) => `#/playlist/${enc(ids.playlist ?? '')}`,
    run: async (page, findings) => {
      if ((page.viewportSize()?.width ?? 0) < 1200) return;
      if (!(await tabTo(page, /^row /))) {
        finding(findings, 'Tab', 'never reaches a track row');
        return;
      }
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      if (!page.url().includes('d=')) {
        finding(findings, 'Enter', 'does not open the details');
        return;
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      if (page.url().includes('d='))
        finding(findings, 'Escape', 'did not close the details');
      if (!page.url().includes('#/playlist/'))
        finding(findings, 'Escape', 'closed the pane with the details');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      if (!page.url().endsWith('#/playlists'))
        finding(findings, 'Escape', `the pane stayed (${page.url()})`);
      const at = await focused(page);
      if (!at.startsWith('row '))
        finding(findings, 'Escape', `focus on ${at}, not the playlist row`);
    },
  },
  {
    // The key picker: Enter opens it, arrows move between keys, Escape
    // closes the picker alone and the focus is back on its button.
    id: 'key-picker',
    hash: (ids) => `#/playlist/${enc(ids.bigPlaylist ?? ids.playlist ?? '')}`,
    run: async (page, findings) => {
      // Larger windows fold the filters behind a Filters button.
      if (await page.getByRole('button', { name: 'Filters' }).isVisible()) {
        if (!(await tabTo(page, /"Filters"/))) {
          finding(findings, 'Tab', 'never reaches Filters');
          return;
        }
        await page.keyboard.press('Enter');
        await page.waitForTimeout(100);
      }
      if (!(await tabTo(page, /"Key: /, 60))) {
        finding(findings, 'Tab', 'never reaches the key picker');
        return;
      }
      await page.keyboard.press('Enter');
      const menu = page.getByRole('dialog', { name: 'Key filter' });
      if (!(await shows(menu))) {
        finding(findings, 'Enter', 'does not open the key picker');
        return;
      }
      await page.keyboard.press('Tab');
      const a = await focused(page);
      await page.keyboard.press('ArrowRight');
      if ((await focused(page)) === a)
        finding(findings, 'ArrowRight', 'does not move between keys');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      if (!(await gone(menu)))
        finding(findings, 'Escape', 'did not close the key picker');
      if (!/Key: /.test(await focused(page))) {
        finding(
          findings,
          'Escape',
          `focus on ${await focused(page)}, not the key button`
        );
      }
    },
  },
  {
    // A row menu of the open mix: Enter opens it, Escape closes it and the
    // focus is back on its button.
    id: 'row-menu',
    hash: `#/mix/${enc(SUNRISE)}`,
    run: async (page, findings) => {
      await page.getByRole('grid', { name: 'Tracklist' }).waitFor();
      if (!(await tabTo(page, /More for /))) {
        finding(findings, 'Tab', 'never reaches a row menu');
        return;
      }
      const button = await focused(page);
      await page.keyboard.press('Enter');
      const menu = page.getByRole('menu');
      if (!(await shows(menu))) {
        finding(findings, 'Enter', 'does not open the row menu');
        return;
      }
      const inMenu = await page
        .waitForFunction(
          () => !!document.activeElement?.closest('[role=menu]'),
          undefined,
          { timeout: 1000 }
        )
        .then(
          () => true,
          () => false
        );
      if (!inMenu)
        finding(
          findings,
          'Enter',
          `the focus does not move into the menu (${button} -> ${await focused(page)})`
        );
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      if (!(await gone(menu)))
        finding(findings, 'Escape', 'did not close the row menu');
      if ((await focused(page)) !== button) {
        finding(
          findings,
          'Escape',
          `focus on ${await focused(page)}, not ${button}`
        );
      }
    },
  },
  {
    // The Mixes list with a connected server: the queue buttons are stops.
    id: 'mix-queue',
    hash: '#/mix',
    run: async (page, findings) => {
      await page.getByRole('heading', { name: 'Mixes', exact: true }).waitFor();
      await page.evaluate((now) => {
        window.__demo?.set('serverSession', {
          accessToken: 'demo',
          refreshToken: 'demo',
          expiresAt: now + 3_600_000,
          email: 'dj@example.com',
        });
        window.__demo?.set('serverState', {
          status: 'connected',
          lastSyncAt: now - 60_000,
          usedBytes: null,
          stamps: [],
          rejected: 0,
        });
      }, DEMO_NOW);
      await page.waitForTimeout(150);
      const seen = await sweep(page, findings, 220);
      need(findings, seen, /Cancel/, 'Cancel a waiting request');
      need(findings, seen, /Move to top/, 'Move to top');
      need(findings, seen, /Stop/, 'Stop a running scan');
    },
  },
];

for (const walk of WALKS) {
  test(`kbd-${walk.id}`, async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    test.skip(
      project !== '1440' && project !== '390',
      'keyboard walk at 1440 and 390 only'
    );
    const findings: Finding[] = [];
    lastStops = [];
    await open(page, findings, walk.hash, walk.variant);
    await walk.run(page, findings);
    const dir = `${ROOT}shots-output/findings/${project}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      `${dir}/kbd-${walk.id}.json`,
      JSON.stringify(
        { id: `kbd-${walk.id}`, project, findings, stops: lastStops },
        null,
        2
      )
    );
    expect(
      findings,
      findings.map((f) => `${f.check} ${f.selector}: ${f.detail}`).join('\n')
    ).toEqual([]);
  });
}
