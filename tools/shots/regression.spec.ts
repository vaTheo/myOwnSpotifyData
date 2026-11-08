/// <reference types="node" />
/**
 * The redesign's end-to-end regression suite (spec 003, T112): one test per
 * row of `specs/003-web-first-redesign/regression.md` the demo can drive,
 * each named by its row id. It drives the real UI on the demo data and
 * asserts results (routes, orders, gates, texts), never looks.
 *
 * Every test, through the `app` fixture: every request leaving 127.0.0.1 is
 * blocked and fails the test, as does any console error or page error
 * (`openDemo`); every `confirm()` met is recorded, answered as the test says
 * (No by default), and its text must be one of the list in how-it-works §14.
 */
import {
  expect,
  test as base,
  type Locator,
  type Page,
} from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEMO_NOW, type DemoIds, type DemoVariant } from '../../src/dev/flag';
import type { Finding } from './checks';
import { openDemo } from './open';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = `${ROOT}tools/shots/fixtures/`;
const enc = encodeURIComponent;

/** The demo's mixes (src/dev/demo.ts). */
const HARBOUR = 'https://soundcloud.com/demo-dj/peak-time-set-at-the-harbour';
const SUNRISE = 'https://www.youtube.com/watch?v=demoSet0001';
const DOCK = 'https://soundcloud.com/demo-dj/closing-set-at-the-dock';

/**
 * The `confirm()` texts of how-it-works §14, read from the page itself so
 * the list and the suite cannot drift: every quoted text of the bullet list
 * under "Their texts, word for word", `<…>` standing for any words.
 */
function confirmList(): RegExp[] {
  const doc = readFileSync(
    `${ROOT}docs/architecture/000-how-it-works.md`,
    'utf8'
  );
  const section = doc.slice(
    doc.indexOf('## 14. Jobs and state'),
    doc.indexOf('## 15.')
  );
  const list = section.slice(section.indexOf('Their texts, word for word'));
  const items = list.split('\n\n')[1] ?? '';
  const texts = [...items.replace(/\n\s+/g, ' ').matchAll(/"([^"]+)"/g)].map(
    (m) => m[1]
  );
  if (texts.length < 12) {
    throw new Error(`how-it-works §14 lists ${texts.length} confirm texts`);
  }
  return texts.map(
    (t) =>
      new RegExp(
        `^${t
          .split(/<[^>]+>/)
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('.+?')}$`
      )
  );
}
const CONFIRMS = confirmList();

interface App {
  page: Page;
  findings: Finding[];
  /** Every `confirm()` text met, in order. */
  confirms: string[];
  /** The answer the next `confirm()` gets. */
  answer: boolean;
  open(
    hash: string | ((ids: DemoIds) => string),
    variant?: DemoVariant
  ): Promise<string>;
  set(name: string, value: unknown): Promise<void>;
  ids(): Promise<DemoIds>;
}

const test = base.extend<{ app: App }>({
  app: async ({ page }, use) => {
    const app: App = {
      page,
      findings: [],
      confirms: [],
      answer: false,
      open: (hash, variant) => openDemo(page, app.findings, hash, variant),
      set: async (name, value) => {
        await page.evaluate(([n, v]) => window.__demo?.set(n as string, v), [
          name,
          value,
        ] as const);
      },
      ids: () => page.evaluate(() => window.__demo!.ids),
    };
    page.on('dialog', (d) => {
      app.confirms.push(`${d.type()}: ${d.message()}`);
      void (app.answer ? d.accept() : d.dismiss());
    });
    await use(app);
    expect(app.findings, 'blocked requests, console or page errors').toEqual(
      []
    );
    for (const c of app.confirms) {
      const [type, ...rest] = c.split(': ');
      const text = rest.join(': ');
      expect(type, `a ${type}() was met: ${text}`).toBe('confirm');
      expect(
        CONFIRMS.some((re) => re.test(text)),
        `confirm() text not in how-it-works §14: ${text}`
      ).toBe(true);
    }
  },
});

// ------------------------------------------------------------ helpers

const SERVER_SESSION = {
  accessToken: 'demo',
  refreshToken: 'demo',
  expiresAt: DEMO_NOW + 3_600_000,
  email: 'dj@example.com',
};
const SERVER_CONNECTED = {
  status: 'connected',
  lastSyncAt: DEMO_NOW - 60_000,
  usedBytes: null,
  stamps: [],
  rejected: 0,
};
/** A Spotify token granted before the two writes. */
const READ_ONLY_SESSION = {
  accessToken: 'demo',
  refreshToken: 'demo',
  expiresAt: DEMO_NOW + 3_600_000,
  scope: 'user-top-read playlist-read-private playlist-read-collaborative',
};

function main(page: Page): Locator {
  return page.getByRole('main');
}

async function h1(page: Page): Promise<string> {
  return (
    (await page.getByRole('heading', { level: 1 }).first().textContent()) ?? ''
  ).trim();
}

/** The destination link of the rail marked current. */
async function currentDestination(page: Page): Promise<string> {
  const link = page
    .getByRole('navigation', { name: 'Main' })
    .locator('[aria-current="page"]');
  return ((await link.textContent()) ?? '').trim();
}

/** The cell texts of one column of a grid, in drawn order. */
async function column(grid: Locator, header: string): Promise<string[]> {
  return grid.evaluate((g, h) => {
    const heads = [...g.querySelectorAll('[role=columnheader]')].map((c) =>
      (c.textContent ?? '').trim()
    );
    const at = heads.indexOf(h);
    if (at < 0) throw new Error(`no column ${h}: ${heads.join(' | ')}`);
    const body = g.querySelectorAll('[role=rowgroup]')[1];
    return [...body.querySelectorAll('[role=row]')]
      .map((r) => [...r.querySelectorAll('[role=gridcell]')])
      .filter((cells) => cells.length === heads.length)
      .map((cells) => (cells[at].textContent ?? '').trim());
  }, header);
}

/** The headers of a grid, in drawn order. */
async function headers(grid: Locator): Promise<string[]> {
  return grid.evaluate((g) =>
    [...g.querySelectorAll('[role=columnheader]')].map((c) =>
      (c.textContent ?? '').trim()
    )
  );
}

/**
 * "1,234", "1,234plays" (a cell's unit), "+2.9%" → the number; a dash
 * ("—no data") or nothing → null.
 */
function num(cell: string): number | null {
  if (cell.includes('no data')) return null;
  const m = /^[+-]?[\d,]+(\.\d+)?/.exec(cell.trim());
  return m ? Number(m[0].replace(/[,+]/g, '')) : null;
}

/**
 * The years of a table drawn as two-line items (phones): each item's meta
 * line ends with its year, or with nothing when it is undated.
 */
async function itemYears(grid: Locator): Promise<string[]> {
  return grid.evaluate((g) => {
    const body = g.querySelectorAll('[role=rowgroup]')[1];
    // The year's own span: the meta line's parts carry no other label.
    return [...body.querySelectorAll('[role=row][data-row-id]')].map((r) =>
      (r.querySelector('.dt-year')?.textContent ?? '').trim()
    );
  });
}

function nonIncreasing(values: number[]): boolean {
  return values.every((v, i) => i === 0 || values[i - 1] >= v);
}
function nonDecreasing(values: number[]): boolean {
  return values.every((v, i) => i === 0 || values[i - 1] <= v);
}

/**
 * A year column in drawn order: the dated ones sorted the way asked, every
 * undated one after them, and no year printed as 0 (round 005).
 */
function yearOrder(cells: string[], dir: 'asc' | 'desc'): string | null {
  if (cells.some((c) => c === '0')) return 'a year printed as 0';
  const years = cells.map(num);
  const firstUndated = years.indexOf(null);
  const dated = (
    firstUndated < 0 ? years : years.slice(0, firstUndated)
  ) as number[];
  if (dated.length === 0) return 'no dated row first';
  if (firstUndated >= 0 && years.slice(firstUndated).some((y) => y !== null)) {
    return 'a dated row after an undated one';
  }
  const sorted = dir === 'asc' ? nonDecreasing(dated) : nonIncreasing(dated);
  return sorted ? null : `years not ${dir}: ${dated.slice(0, 12).join(', ')}`;
}

/** Pages a DataTable to its end ("Show 100 more" until it goes). */
async function showAll(page: Page): Promise<void> {
  const more = page.getByRole('button', { name: /^Show [\d,]+ more$/ });
  for (let i = 0; i < 50 && (await more.count()) > 0; i += 1) {
    await more.first().click();
  }
}

/** A playlist on a larger window folds its filters behind a button. */
async function showFilters(page: Page): Promise<void> {
  const fold = page.getByRole('button', { name: 'Filters', expanded: false });
  if (await fold.count()) await fold.first().click();
}

async function search(page: Page, text: string): Promise<Locator> {
  await main(page).waitFor();
  await page.keyboard.press('/');
  const box = page.getByRole('combobox');
  await box.waitFor();
  await box.fill(text);
  return box;
}

/**
 * Picks a file through the file chooser a button opens. Firefox, about half
 * the time on a second pick in one page, opens no chooser for a click that
 * is delivered correctly and stays closed for later clicks (S15: the click
 * lands on the visible input, the page is idle and enabled, waiting longer
 * and clicking again do not help, a plain label and input page does 14 in
 * 14). The first pick of a page always goes through the chooser; when none
 * opens within 4 s the file is set on the input, which fires the same
 * `change` the app listens to.
 */
async function chooseFile(
  page: Page,
  button: Locator,
  file: string
): Promise<void> {
  const chooser = page.waitForEvent('filechooser', { timeout: 4_000 });
  chooser.catch(() => undefined);
  await button.click();
  try {
    await (await chooser).setFiles(file);
  } catch {
    await button
      .locator('xpath=ancestor-or-self::label//input[@type="file"]')
      .setInputFiles(file);
  }
}

/** The demo's open mix tracklist, drawn. */
async function openGrid(page: Page): Promise<Locator> {
  const grid = page.getByRole('grid', { name: 'Tracklist' });
  await grid.waitFor();
  return grid;
}

/** Edits the first track row of the open mix: it becomes a manual row. */
async function addManualRow(page: Page): Promise<void> {
  await openGrid(page);
  await page.getByRole('button', { name: 'Add track', exact: true }).click();
  const artist = page.getByRole('textbox', { name: /^Artist/ }).last();
  await artist.fill('Manual Artist');
  await page
    .getByRole('textbox', { name: /^Title/ })
    .last()
    .fill('Manual Title');
  await artist.press('Enter');
}

// ------------------------------------------------- A. Addresses (routes.md)

test.describe('A. addresses', () => {
  for (const [id, hash] of [
    ['A01 #/ opens the Overview', '#/'],
    ['A02 an empty address opens the Overview', ''],
    ['A03 an unknown address opens the Overview', '#/no-such-screen'],
  ] as const) {
    test(id, async ({ app }) => {
      await app.open(hash);
      await expect(app.page.getByRole('heading', { level: 1 })).toHaveText(
        'Overview'
      );
      expect(await currentDestination(app.page)).toBe('Overview');
      await expect(
        main(app.page).getByRole('heading', { name: 'Heavy rotation' })
      ).toBeVisible();
    });
  }

  test('A04 #/top opens Listening · Top', async ({ app }) => {
    await app.open('#/top');
    expect(await h1(app.page)).toBe('Listening');
    expect(await currentDestination(app.page)).toBe('Listening');
    await expect(
      app.page
        .getByRole('navigation', { name: 'Listening' })
        .getByRole('link', { name: 'Top' })
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      app.page.getByRole('grid', { name: 'Top tracks, 4 weeks' })
    ).toBeVisible();
  });

  test('A05 #/crate opens the Crate hub with its five views', async ({
    app,
  }) => {
    await app.open('#/crate');
    expect(await currentDestination(app.page)).toBe('Listening');
    await expect(
      app.page
        .getByRole('navigation', { name: 'Listening' })
        .getByRole('link', { name: 'Crate' })
    ).toHaveAttribute('aria-current', 'page');
    const titles = await main(app.page)
      .getByRole('heading', { level: 2 })
      .allTextContents();
    expect(titles).toEqual([
      'Heavy rotation',
      'Forgotten gems',
      'All-time classics',
      'By year',
      'Finish rate',
    ]);
  });

  test('A06 #/crate/<view> opens each view', async ({ app }) => {
    await app.open('#/crate');
    for (const [view, title] of [
      ['rotation', 'Heavy rotation'],
      ['gems', 'Forgotten gems'],
      ['classics', 'All-time classics'],
      ['year', 'By year'],
      ['finish', 'Finish rate'],
    ]) {
      await app.page.evaluate((h) => (location.hash = h), `#/crate/${view}`);
      await expect(app.page.getByRole('heading', { level: 1 })).toHaveText(
        title
      );
      expect(await currentDestination(app.page)).toBe('Listening');
      await expect(
        main(app.page).getByRole('grid').first(),
        `${view} draws its table`
      ).toBeVisible();
    }
  });

  test('A07 #/crate/year/<YYYY-MM> selects that month', async ({ app }) => {
    await app.open('#/crate/year/2026-08');
    await expect(
      app.page.getByRole('grid', { name: 'By year, Aug 2026' })
    ).toBeVisible();
    await expect(
      app.page.getByRole('button', { name: /^Aug 2026,/ })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('A08 #/playlists opens Library · Playlists', async ({ app }) => {
    await app.open('#/playlists');
    expect(await h1(app.page)).toBe('Library');
    expect(await currentDestination(app.page)).toBe('Library');
    const grid = app.page.getByRole('grid', { name: 'Playlists' });
    await expect(grid).toBeVisible();
    // Forty demo playlists, by name (the model's order), all listed.
    const names = await column(grid, 'Name');
    expect(names).toHaveLength(40);
    expect(names).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, 'en-GB'))
    );
  });

  test('A09 #/playlist/<id> opens the playlist beside the list', async ({
    app,
  }) => {
    await app.open((ids) => `#/playlist/${enc(ids.playlist ?? '')}`);
    const name = await h1(app.page);
    expect(name).not.toBe('Library');
    await expect(
      app.page
        .getByRole('list', { name: 'Playlists' })
        .locator('[aria-current="page"]')
    ).toContainText(name);
    await expect(
      app.page.getByRole('grid', { name: `${name}, by plays` })
    ).toBeVisible();
    // A phone shows the detail alone, with Back to the list.
    await app.page.setViewportSize({ width: 390, height: 844 });
    await expect(app.page.getByRole('list', { name: 'Playlists' })).toHaveCount(
      0
    );
    await expect(app.page.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '#/playlists'
    );
  });

  test('A10 #/artists opens Library · Artists', async ({ app }) => {
    await app.open('#/artists');
    expect(await currentDestination(app.page)).toBe('Library');
    await expect(
      app.page.getByRole('grid', { name: 'Artists by saved tracks' })
    ).toBeVisible();
  });

  test('A11 #/artist/<key> opens the artist beside the list', async ({
    app,
  }) => {
    await app.open((ids) => `#/artist/${enc(ids.artist ?? '')}`);
    const name = await h1(app.page);
    await expect(
      app.page.getByRole('grid', { name: `Saved tracks by ${name}` })
    ).toBeVisible();
    expect(await currentDestination(app.page)).toBe('Library');
  });

  test('A12 #/mix opens the Mix workspace', async ({ app }) => {
    await app.open('#/mix');
    expect(await h1(app.page)).toBe('Mix');
    expect(await currentDestination(app.page)).toBe('Mix');
    await expect(app.page.getByRole('region', { name: 'Mixes' })).toBeVisible();
    await expect(
      app.page.getByRole('textbox', { name: /^Paste a mix link/ })
    ).toBeVisible();
  });

  test('A13 #/mix/<key> opens that saved mix; an unknown key says so', async ({
    app,
  }) => {
    await app.open(`#/mix/${enc('https://soundcloud.com/nobody/never-saved')}`);
    await expect(
      app.page.getByText('This saved mix is not in this browser.')
    ).toBeVisible();
    await expect(
      app.page.getByRole('link', { name: 'Back to your mixes' })
    ).toHaveAttribute('href', '#/mix');
    await app.page.evaluate(
      (h) => (location.hash = h),
      `#/mix/${enc(HARBOUR)}`
    );
    await expect(
      app.page.getByRole('article', { name: 'Peak time set at the Harbour' })
    ).toBeVisible();
    await openGrid(app.page);
    // An unknown key while a mix is open (Back after a removal, a stale
    // bookmark): the line says so above the open mix, which stays.
    await app.page.evaluate(
      (h) => (location.hash = h),
      `#/mix/${enc('https://soundcloud.com/nobody/never-saved')}`
    );
    await expect(
      app.page.getByText('This saved mix is not in this browser.')
    ).toBeVisible();
    await expect(
      app.page.getByRole('article', { name: 'Peak time set at the Harbour' })
    ).toBeVisible();
    // A saved key again: the line goes.
    await app.page.evaluate((h) => (location.hash = h), `#/mix/${enc(DOCK)}`);
    await expect(
      app.page.getByRole('article', { name: 'Closing set at the Dock' })
    ).toBeVisible();
    await expect(
      app.page.getByText('This saved mix is not in this browser.')
    ).toHaveCount(0);
  });

  test('A18 ?d=<position> on a playlist opens that entry and selects its row', async ({
    app,
  }) => {
    const hash = await app.open(
      (ids) => `#/playlist/${enc(ids.playlist ?? '')}`
    );
    await app.page.getByRole('tab', { name: 'Playlist order' }).click();
    const grid = main(app.page).getByRole('grid').first();
    const titles = await column(grid, 'Title');
    // The fourth entry: a tap writes its position into the address.
    await grid
      .getByRole('row')
      .nth(4)
      .click({ position: { x: 120, y: 20 } });
    await expect(app.page).toHaveURL(/\?d=\d+$/);
    const d = /\?d=(\d+)$/.exec(app.page.url())?.[1];
    const sheet = app.page.getByRole('complementary');
    await app.page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    // The address alone opens that entry and selects its row.
    await app.page.evaluate((h) => (location.hash = h), `${hash}?d=${d}`);
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText(
      titles[3]
    );
    await expect(
      grid.locator('[role=row][aria-selected="true"]')
    ).toContainText(titles[3]);
    // A position the playlist does not hold: no sheet.
    await app.page.evaluate((h) => (location.hash = h), `${hash}?d=99999`);
    await expect(sheet).toHaveCount(0);
  });

  test('A14 #/settings opens Settings in seven sections', async ({ app }) => {
    await app.open('#/settings');
    expect(await currentDestination(app.page)).toBe('Settings');
    const sections = await app.page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('button')
      .allTextContents();
    // Round 006 adds the Updates section first; the seven of US5 follow.
    expect(sections[0]).toBe('Updates');
    expect(sections.slice(1)).toEqual([
      'Spotify account',
      'Spotify sync',
      'Listening history',
      'Audio data',
      'Artist reach',
      'Server',
      'Danger zone',
    ]);
  });

  test('A15 #/import opens the history import under Settings', async ({
    app,
  }) => {
    await app.open('#/import');
    expect(await h1(app.page)).toBe('Import listening history');
    expect(await currentDestination(app.page)).toBe('Settings');
    await expect(app.page.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '#/settings'
    );
  });

  test('A16 ?d=<id> opens the details sheet; a stale id is ignored; Back and Escape close it', async ({
    app,
  }) => {
    const hash = await app.open((ids) => `#/top?d=${enc(ids.track ?? '')}`);
    const sheet = app.page.getByRole('complementary');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { level: 2 })).not.toBeEmpty();
    // Escape closes it, replacing the entry.
    await app.page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    expect(new URL(app.page.url()).hash).toBe('#/top');
    // A row opens it again (a new entry): Back closes it.
    await app.page.evaluate((h) => (location.hash = h), hash);
    await expect(sheet).toBeVisible();
    await app.page
      .getByRole('grid')
      .first()
      .getByRole('row')
      .nth(2)
      .click({ position: { x: 120, y: 20 } });
    await expect(app.page).toHaveURL(/\?d=/);
    const opened = app.page.url();
    expect(opened).not.toBe(hash);
    await app.page.goBack();
    await expect(app.page).not.toHaveURL(opened);
    await expect(app.page).not.toHaveURL(/\?d=/);
    await expect(sheet).toHaveCount(0);
    // A stale id: the screen, no sheet.
    await app.page.evaluate((h) => (location.hash = h), '#/top?d=noSuchTrack');
    await expect(
      app.page.getByRole('grid', { name: 'Top tracks, 4 weeks' })
    ).toBeVisible();
    await expect(sheet).toHaveCount(0);
  });

  test('A17 a destination reopens the last route used inside it', async ({
    app,
  }) => {
    await app.open('#/crate/gems');
    await app.page.getByRole('link', { name: 'Overview' }).click();
    await expect(app.page).toHaveURL(/#\/$/);
    await app.page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Listening' })
      .click();
    await expect(app.page).toHaveURL(/#\/crate\/gems$/);
    await expect(app.page.getByRole('heading', { level: 1 })).toHaveText(
      'Forgotten gems'
    );
  });
});

// ------------------------------------------- F. Features (inventory §1)

test.describe('F. features', () => {
  test('F01 the Connect screen, signed out', async ({ app }) => {
    await app.open('#/', 'signed-out');
    await expect(app.page.getByRole('heading', { level: 1 })).toHaveText(
      'DJ Data'
    );
    await expect(
      app.page.getByRole('button', { name: 'Connect Spotify' })
    ).toBeEnabled();
    await expect(app.page.getByText('What leaves this browser')).toBeVisible();
    // No destination before a login.
    await expect(
      app.page.getByRole('navigation', { name: 'Main' })
    ).toHaveCount(0);
  });

  test('F02 Spotify sync: Settings and the playlist offer it, nothing reads on load; the lock-out rests it', async ({
    app,
  }) => {
    await app.open('#/settings');
    await expect(app.page.getByText(/^Last sync: /)).toBeVisible();
    await expect(
      app.page.getByRole('button', { name: 'Sync now', exact: true })
    ).toBeEnabled();
    await app.page.evaluate(
      (h) => (location.hash = h),
      `#/playlist/${enc((await app.ids()).playlist ?? '')}`
    );
    await expect(
      app.page.getByRole('button', { name: 'Sync this playlist' })
    ).toBeEnabled();
    // The quota lock-out: Sync this playlist rests and says why instead.
    await app.set('spotifyQuotaLock', DEMO_NOW + 3 * 3_600_000);
    await expect(
      app.page.getByRole('button', { name: 'Sync this playlist' })
    ).toHaveCount(0);
    await expect(
      app.page.getByRole('banner').getByRole('button', {
        name: /^Spotify quota reached\. .+ after .+\.$/,
        disabled: true,
      })
    ).toBeVisible();
  });

  test('F03 history import: a fixture file fills an empty library, then the Crate', async ({
    app,
  }) => {
    await app.open('#/import', 'empty');
    await chooseFile(
      app.page,
      app.page.getByRole('button', { name: /choose a file/ }),
      `${FIXTURES}Streaming_History_Audio_2026_0.json`
    );
    await expect(main(app.page)).toContainText(
      '8 plays credited across 2 tracks',
      { timeout: 20_000 }
    );
    expect(app.confirms, 'nothing to replace, no question').toEqual([]);
    await app.page.evaluate((h) => (location.hash = h), '#/crate/rotation');
    const grid = app.page.getByRole('grid').first();
    await expect(grid).toContainText('Fixture Song');
    await expect(grid).toContainText('Second Fixture');
  });

  test('F03b narrower import: the §14 question; No keeps the history, Yes replaces it', async ({
    app,
  }) => {
    await app.open('#/import');
    const file = `${FIXTURES}Streaming_History_Audio_2026_0.json`;
    const pick = app.page.getByRole('button', { name: /choose a file/ });
    app.answer = false;
    await chooseFile(app.page, pick, file);
    await expect.poll(() => app.confirms.length).toBe(1);
    expect(app.confirms[0]).toMatch(
      /^confirm: This import covers .+; your current history covers .+\. Replace it\?$/
    );
    await expect(main(app.page)).toContainText('78,873 plays credited');
    // The picker is disabled while the import runs; the refusal ends it
    // a moment after the question. Wait for that end (the message), not
    // only for the picker: Firefox opens nothing on a click that lands
    // between the two (S15, 3 runs in 8).
    await expect(main(app.page)).toContainText(
      'Import cancelled. Your existing history was kept.'
    );
    await expect(app.page.locator('input[type=file]')).toBeEnabled();
    app.answer = true;
    await chooseFile(app.page, pick, `${file}`);
    await expect.poll(() => app.confirms.length).toBe(2);
    await expect(main(app.page)).toContainText(
      '8 plays credited across 2 tracks',
      { timeout: 20_000 }
    );
  });

  test('F04 Top: rank order by default, the three periods, Artists, Compare periods', async ({
    app,
  }) => {
    await app.open('#/top');
    const grid = app.page.getByRole('grid', { name: 'Top tracks, 4 weeks' });
    const ranks = (await column(grid, '#')).map(Number);
    expect(ranks.slice(0, 50)).toEqual(
      Array.from({ length: Math.min(50, ranks.length) }, (_, i) => i + 1)
    );
    await expect(grid.getByRole('columnheader', { name: '#' })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
    for (const [tab, label] of [
      ['6 months', 'Top tracks, 6 months'],
      ['All time', 'Top tracks, all time'],
    ]) {
      await app.page.getByRole('tab', { name: tab }).click();
      await expect(
        app.page.getByRole('grid', { name: label, exact: false })
      ).toBeVisible();
    }
    await app.page.getByRole('tab', { name: 'Artists' }).click();
    await expect(
      app.page.getByRole('grid', { name: /^Top artists/ })
    ).toBeVisible();
    await app.page.getByRole('button', { name: 'Compare periods' }).click();
    for (const p of ['4 weeks', '6 months', 'All time']) {
      await expect(app.page.getByRole('list', { name: p })).toBeVisible();
    }
  });

  test('F04b sorting: a header sorts, again reverses, the rank comes back', async ({
    app,
  }) => {
    await app.open('#/top');
    const grid = app.page.getByRole('grid', { name: 'Top tracks, 4 weeks' });
    const plays = grid.getByRole('button', { name: 'Plays', exact: true });
    await plays.click();
    const head = grid.getByRole('columnheader', { name: 'Plays' });
    const first = await head.getAttribute('aria-sort');
    const values = (await column(grid, 'Plays')).map(num) as number[];
    expect(
      first === 'descending' ? nonIncreasing(values) : nonDecreasing(values)
    ).toBe(true);
    await plays.click();
    const second = await head.getAttribute('aria-sort');
    expect(second).not.toBe(first);
    const again = (await column(grid, 'Plays')).map(num) as number[];
    expect(
      second === 'descending' ? nonIncreasing(again) : nonDecreasing(again)
    ).toBe(true);
    await grid.getByRole('button', { name: '#', exact: true }).click();
    const ranks = (await column(grid, '#')).map(Number);
    expect(ranks.slice(0, 30)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1)
    );
  });

  test('F05 a playlist ranks by plays; Playlist order keeps its order', async ({
    app,
  }) => {
    await app.open((ids) => `#/playlist/${enc(ids.bigPlaylist ?? '')}`);
    const name = await h1(app.page);
    const byPlays = app.page.getByRole('grid', { name: `${name}, by plays` });
    await expect(byPlays).toBeVisible();
    await showAll(app.page);
    const plays = (await column(byPlays, 'Plays')).map((c) => num(c) ?? 0);
    expect(plays.length).toBeGreaterThan(100);
    expect(nonIncreasing(plays)).toBe(true);
    await app.page.getByRole('tab', { name: 'Playlist order' }).click();
    const ordered = app.page.getByRole('grid', { name: /order/ });
    const positions = (await column(ordered, '#')).map(Number);
    expect(positions.slice(0, 30)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1)
    );
  });

  test('F06 Artists rank by saved tracks; the artist lists them', async ({
    app,
  }) => {
    await app.open('#/artists');
    const grid = app.page.getByRole('grid', {
      name: 'Artists by saved tracks',
    });
    await showAll(app.page);
    const tracks = (await column(grid, 'Tracks')).map((c) => num(c) ?? -1);
    expect(tracks.length).toBeGreaterThan(1000);
    expect(nonIncreasing(tracks)).toBe(true);
    const first = (await column(grid, 'Name'))[0];
    await grid.getByRole('link', { name: first, exact: true }).first().click();
    await expect(app.page.getByRole('heading', { level: 1 })).toHaveText(first);
    const saved = app.page.getByRole('grid', {
      name: `Saved tracks by ${first}`,
    });
    await expect(saved.getByRole('row')).toHaveCount(tracks[0] + 1);
  });

  test('F07 the Crate views list rows; the old-import gate holds on every view', async ({
    app,
  }) => {
    await app.open('#/crate/rotation');
    await expect(
      app.page.getByRole('grid', { name: 'Heavy rotation, last 3 months' })
    ).toBeVisible();
    const inWindow = (
      await column(
        app.page.getByRole('grid', { name: 'Heavy rotation, last 3 months' }),
        'Plays in window'
      )
    ).map((c) => num(c) ?? -1);
    expect(inWindow.length).toBeGreaterThan(10);
    expect(nonIncreasing(inWindow)).toBe(true);
    await app.open('#/crate', 'old-import');
    await expect(
      app.page.getByRole('heading', {
        name: 'Your history needs importing again',
      })
    ).toBeVisible();
    for (const view of ['rotation', 'gems', 'classics', 'year', 'finish']) {
      await app.page.evaluate((h) => (location.hash = h), `#/crate/${view}`);
      await expect(
        app.page.getByRole('heading', {
          name: 'Your history needs importing again',
        }),
        `#/crate/${view} gated`
      ).toBeVisible();
      await expect(main(app.page).getByRole('grid')).toHaveCount(0);
    }
  });

  test('F07b the old-import gate lifts after a new import', async ({ app }) => {
    await app.open('#/import', 'old-import');
    app.answer = true;
    await chooseFile(
      app.page,
      app.page.getByRole('button', { name: /choose a file/ }),
      `${FIXTURES}Streaming_History_Audio_2026_0.json`
    );
    await expect(main(app.page)).toContainText(
      '8 plays credited across 2 tracks',
      { timeout: 20_000 }
    );
    await app.page.evaluate((h) => (location.hash = h), '#/crate/rotation');
    await expect(app.page.getByRole('grid').first()).toContainText(
      'Fixture Song'
    );
  });

  test('F08 BPM and key on every row; the key notation switches', async ({
    app,
  }) => {
    await app.open('#/top');
    const grid = app.page.getByRole('grid', { name: 'Top tracks, 4 weeks' });
    const keys = (await column(grid, 'Key')).filter(
      (k) => num(k) !== null || /\d/.test(k)
    );
    expect(keys.length).toBeGreaterThan(5);
    expect(keys.every((k) => /^\d{1,2}[AB]$/.test(k))).toBe(true);
    const bpms = (await column(grid, 'BPM')).map(num).filter((b) => b !== null);
    expect(bpms.length).toBeGreaterThan(5);
    await app.page.evaluate((h) => (location.hash = h), '#/settings');
    await expect(
      app.page.getByText(/^BPM and key for 2,099 of 3,199 tracks/)
    ).toBeVisible();
    await app.page.getByRole('tab', { name: 'Open Key' }).click();
    await app.page.evaluate((h) => (location.hash = h), '#/top');
    const open = (await column(grid, 'Key')).filter((k) => /\d/.test(k));
    expect(open.length).toBeGreaterThan(5);
    expect(open.every((k) => /^\d{1,2}[dm]$/.test(k))).toBe(true);
    await app.page.evaluate((h) => (location.hash = h), '#/settings');
    await app.page.getByRole('tab', { name: 'Camelot' }).click();
  });

  test('F08b a Rekordbox XML fills BPM and key of the tracks it matches', async ({
    app,
  }) => {
    await app.open('#/settings');
    await chooseFile(
      app.page,
      app.page.getByRole('button', { name: /^Rekordbox collection XML/ }),
      `${FIXTURES}rekordbox.xml`
    );
    await expect(
      app.page.getByText(
        /^parsed 2 · with BPM 2 · with key 2 · matched 1 · unmatched 1/
      )
    ).toBeVisible({ timeout: 20_000 });
    await app.page.evaluate((h) => (location.hash = h), '#/top');
    const grid = app.page.getByRole('grid', { name: 'Top tracks, 4 weeks' });
    const titles = await column(grid, 'Title');
    const at = titles.indexOf('Satellite Ember (Edit)');
    expect(at).toBeGreaterThanOrEqual(0);
    expect((await column(grid, 'BPM'))[at]).toBe('124');
    expect((await column(grid, 'Key'))[at]).toBe('5A');
  });

  test('F09 Match re-ranks a playlist around the seed', async ({ app }) => {
    await app.open((ids) => `#/playlist/${enc(ids.playlist ?? '')}`);
    await app.page.getByRole('tab', { name: 'Match' }).click();
    const grid = app.page.getByRole('grid').first();
    // The seed: the first row with a BPM and a key.
    const keys = await column(grid, 'Key');
    const bpms = await column(grid, 'BPM');
    const at = keys.findIndex(
      (k, i) => /^\d{1,2}[AB]$/.test(k) && num(bpms[i]) !== null
    );
    const titles = await column(grid, 'Title');
    await grid
      .getByRole('row')
      .nth(at + 1)
      .click({ position: { x: 120, y: 20 } });
    await expect(app.page.getByText(/^Matching: /)).toContainText(titles[at]);
    const relations = await column(grid, 'Relation');
    // The cell prints adjacent keys as +1 or −1 (matchCells.ts); a row
    // with no compatible key, out of tolerance or with no data prints none.
    const rank: Record<string, number> = {
      'same key': 0,
      relative: 1,
      '+1': 2,
      '−1': 2,
      boost: 3,
    };
    const none = (r: string) => r === '' || r.includes('no data');
    const unknown = relations.filter((r) => !none(r) && !(r in rank));
    expect(unknown, 'a relation the suite does not know').toEqual([]);
    const order = relations.map((r) => rank[r] ?? 4);
    // Compatible keys first, best relation first, then every other row.
    expect(nonDecreasing(order)).toBe(true);
    for (const r of [0, 2, 4]) {
      expect(order, `relation rank ${r} met`).toContain(r);
    }
    expect(await column(grid, 'Title')).not.toContain(titles[at]);
  });

  test('F10 safety: Connect again, the missing-scope warning, a banner with Dismiss', async ({
    app,
  }) => {
    await app.open('#/settings');
    await expect(
      app.page.getByRole('button', { name: 'Connect again' })
    ).toBeVisible();
    await app.set('spotifySession', READ_ONLY_SESSION);
    await expect(main(app.page)).toContainText('Like all songs');
    await expect(main(app.page)).toContainText('Create playlist');
    await app.set('banner', {
      kind: 'error',
      text: 'Could not open local storage: the regression says so.',
      inlineOn: [],
    });
    const alert = app.page.getByRole('alert').filter({
      hasText: 'the regression says so',
    });
    await expect(alert).toBeVisible();
    await alert.getByRole('button', { name: 'Dismiss' }).click();
    await expect(alert).toHaveCount(0);
  });

  test('F11 Under the radar: listeners and fans side by side, no 0 for a missing number, Well known last', async ({
    app,
  }) => {
    await app.open('#/artists');
    await app.page.getByRole('tab', { name: 'Under the radar' }).click();
    const grid = app.page.getByRole('grid', { name: 'Under the radar' });
    const heads = await headers(grid);
    expect(heads.indexOf('Fans')).toBe(heads.indexOf('Listeners') + 1);
    await showAll(app.page);
    for (const h of ['Listeners', 'Fans']) {
      const cells = await column(grid, h);
      expect(cells.length).toBeGreaterThan(900);
      expect(
        cells.filter((c) => num(c) === 0),
        `${h} printed as 0`
      ).toEqual([]);
      expect(cells.every((c) => num(c) !== null || c.includes('no data'))).toBe(
        true
      );
    }
    // Group headings in order; Well known is the last, never a filter.
    const groups = await grid.evaluate((g) =>
      // A heading row: one cell spanning the row.
      [...g.querySelectorAll('[role=row]')]
        .filter((r) => r.querySelector('[role=gridcell][data-span]') !== null)
        .map((r) => (r.textContent ?? '').trim())
    );
    expect(groups.length).toBeGreaterThan(0);
    expect(groups[groups.length - 1]).toMatch(/^Well known/);
    await expect(app.page.getByRole('tab', { name: /Well known/ })).toHaveCount(
      0
    );
    // No reach data yet: the view says what it needs.
    await app.open('#/artists', 'no-reach');
    await app.page.getByRole('tab', { name: 'Under the radar' }).click();
    await expect(
      app.page.getByRole('heading', { name: 'No reach data yet' })
    ).toBeVisible();
  });

  test('F12 Mix: open a saved mix, delete a row and save', async ({ app }) => {
    await app.open('#/mix');
    await app.page
      .getByRole('link', { name: /^Closing set at the Dock/ })
      .first()
      .click();
    await expect(app.page).toHaveURL(
      new RegExp(`#/mix/${enc(DOCK).replace(/[.?]/g, '\\$&')}$`)
    );
    const grid = await openGrid(app.page);
    // Round 010: no Validate; Delete (the Review column's ✕) is the review.
    await expect(grid.getByRole('button', { name: /^Validate / })).toHaveCount(
      0
    );
    const summary = app.page.getByText(/^\d+ tracks? · \d+ on Spotify/);
    const before = Number(
      /^(\d+) track/.exec((await summary.textContent()) ?? '')?.[1]
    );
    await grid
      .getByRole('button', { name: /^Remove / })
      .first()
      .click();
    await expect(summary).toHaveText(new RegExp(`^${before - 1} tracks? · `));
    await app.page.getByRole('button', { name: 'Save mix' }).click();
    await expect(
      app.page.getByRole('button', { name: 'Saved ✓' })
    ).toBeVisible();
    // Kept: closed, another screen, then the Mix screen mounted again reads
    // the saved mixes back from this browser's database (the demo refills
    // its database on a reload, so no reload here).
    await app.page.getByRole('button', { name: 'Close this mix' }).click();
    await app.page.evaluate((h) => (location.hash = h), '#/top');
    await expect(app.page.getByRole('heading', { level: 1 })).toHaveText(
      'Listening'
    );
    await app.page.evaluate((h) => (location.hash = h), '#/mix');
    await app.page
      .getByRole('link', { name: /^Closing set at the Dock/ })
      .first()
      .click();
    await openGrid(app.page);
    await expect(summary).toHaveText(new RegExp(`^${before - 1} tracks? · `));
  });

  test('F12b Mix: removing a saved mix asks first; Yes removes it', async ({
    app,
  }) => {
    await app.open('#/mix');
    const row = app.page.getByRole('link', {
      name: /^Closing set at the Dock/,
    });
    await app.page
      .getByRole('button', { name: 'More for Closing set at the Dock' })
      .click();
    await app.page.getByRole('menuitem', { name: 'Remove' }).click();
    expect(app.confirms).toEqual(['confirm: Remove this saved mix?']);
    await expect(row).toHaveCount(1);
    app.answer = true;
    await app.page
      .getByRole('button', { name: 'More for Closing set at the Dock' })
      .click();
    await app.page.getByRole('menuitem', { name: 'Remove' }).click();
    await expect(row).toHaveCount(0);
  });

  test('F12c Mix: a paste over edited rows asks first', async ({ app }) => {
    await app.open(`#/mix/${enc(HARBOUR)}`);
    await addManualRow(app.page);
    const grid = await openGrid(app.page);
    const rows = await grid.getByRole('row').count();
    const paste = async () => {
      await app.page
        .getByRole('textbox', { name: 'Paste a tracklist' })
        .fill(
          '01. Pasted Artist - Pasted Title\n02. Other Artist - Other Title'
        );
      await app.page.getByRole('button', { name: 'Add these tracks' }).click();
    };
    await app.page.getByText('Paste a tracklist', { exact: true }).click();
    await paste();
    expect(app.confirms.at(-1)).toBe(
      'confirm: Replace your edited tracklist with the pasted tracks?'
    );
    await expect(grid.getByRole('row')).toHaveCount(rows);
    await expect(grid).toContainText('Manual Title');
    // Yes: the pasted rows replace the list.
    app.answer = true;
    await paste();
    await expect(grid).toContainText('Pasted Title');
    await expect(grid).not.toContainText('Manual Title');
    expect(app.confirms).toHaveLength(2);
  });

  test('F12d Mix: the description over edited rows asks first', async ({
    app,
  }) => {
    await app.open(`#/mix/${enc(HARBOUR)}`);
    await openGrid(app.page);
    // A lookup that read a description keeps its rows on the view (a saved
    // mix does not): the demo sets that view over the open mix.
    const row = (artist: string, title: string, startSec: number) => ({
      startSec,
      endSec: null,
      artist,
      title,
      label: null,
      source: 'description',
      gap: false,
      detected: null,
      referenceCount: null,
    });
    await app.set('mixState', {
      status: 'ready',
      view: {
        url: HARBOUR,
        title: 'Peak time set at the Harbour',
        author: 'Demo DJ',
        playerSrc: null,
        sources: {
          trackid: true,
          description: true,
          pasted: false,
          linkOut: null,
        },
        descriptionRows: [
          row('Described Artist', 'Described Title', 0),
          row('Second Described', 'Another Title', 300),
        ],
        trackid: null,
        oembedError: null,
        trackidError: null,
        shortLink: false,
      },
    });
    await addManualRow(app.page);
    const grid = await openGrid(app.page);
    const replace = app.page.getByRole('button', {
      name: 'Replace with the description tracklist',
    });
    await replace.click();
    expect(app.confirms).toEqual([
      'confirm: Replace your edited tracklist with the one from the description?',
    ]);
    await expect(grid).toContainText('Manual Title');
    app.answer = true;
    await replace.click();
    await expect(grid).toContainText('Described Title');
    await expect(grid).not.toContainText('Manual Title');
  });

  test('F13 Create playlist: every track, gated by the scope, no request', async ({
    app,
  }) => {
    await app.open(`#/mix/${enc(SUNRISE)}`);
    await openGrid(app.page);
    // Round 010: no Validated only / All tracks choice; every track goes.
    await expect(
      app.page.getByRole('tab', { name: /^(Validated only|All tracks)/ })
    ).toHaveCount(0);
    const allChip = app.page.getByRole('tab', { name: /^All \(\d+\)$/ });
    const n = Number(
      /\((\d+)\)/.exec((await allChip.textContent()) ?? '')?.[1]
    );
    await expect(
      app.page.getByText(new RegExp(`^${n} tracks? will be added`))
    ).toBeVisible();
    const create = app.page.getByRole('button', {
      name: 'Create playlist from mix',
    });
    await expect(create).toBeEnabled();
    // Without the playlist scope a tap asks to connect again, sends nothing.
    await app.set('spotifySession', READ_ONLY_SESSION);
    await create.click();
    await expect(
      app.page.getByText(/This app cannot create playlists yet/)
    ).toBeVisible();
    await expect(
      app.page.getByRole('button', { name: 'Connect again to allow playlists' })
    ).toBeVisible();
  });

  test('F14 Like all songs: on the playlist, gated by the scopes, no request', async ({
    app,
  }) => {
    await app.open((ids) => `#/playlist/${enc(ids.playlist ?? '')}`);
    const like = app.page.getByRole('button', { name: 'Like all songs' });
    await expect(like).toBeEnabled();
    await app.set('spotifySession', READ_ONLY_SESSION);
    await like.click();
    await expect(
      app.page.getByText(/This app cannot like songs yet/)
    ).toBeVisible();
    await expect(
      app.page.getByRole('button', { name: 'Connect again to allow likes' })
    ).toBeVisible();
    expect(app.confirms, 'no count question without the scopes').toEqual([]);
  });

  test('F15 a Tracklistify file opens as a mix; over edited rows it asks first', async ({
    app,
  }) => {
    await app.open('#/mix');
    const pick = app.page.getByRole('button', {
      name: /^Or import a Tracklistify tracklist\.json/,
    });
    await chooseFile(app.page, pick, `${FIXTURES}tracklist.json`);
    const grid = await openGrid(app.page);
    await expect(
      app.page.getByRole('heading', { name: 'Fixture set at the test bench' })
    ).toBeVisible();
    for (const t of ['Bench Tone', 'Second Bench', 'Closing Bench']) {
      await expect(grid).toContainText(t);
    }
    await addManualRow(app.page);
    await app.page.setViewportSize({ width: 1600, height: 900 });
    await chooseFile(
      app.page,
      app.page
        .getByRole('button', {
          name: /^Or import a Tracklistify tracklist\.json/,
        })
        .first(),
      `${FIXTURES}tracklist.json`
    );
    await expect.poll(() => app.confirms.length).toBe(1);
    expect(app.confirms[0]).toBe(
      'confirm: Importing this file replaces the current tracklist, including your edits. Continue?'
    );
    await expect(grid).toContainText('Manual Title');
  });

  test('F16 dig links point out and fetch nothing', async ({ app }) => {
    await app.open(`#/mix/${enc(SUNRISE)}`);
    await openGrid(app.page);
    await app.set('createPlaylistState', {
      status: 'done',
      name: 'Sunrise closing set',
      url: 'https://open.spotify.com/playlist/demoPlaylist01',
      added: 2,
      total: 4,
      unmatched: [
        {
          artist: 'Lone Harbour',
          title: 'Fog Signal (Dub)',
          startSec: 1810,
          shazamUrl: 'https://www.shazam.com/track/1/fog-signal',
        },
        {
          artist: 'Unknown Pressing',
          title: 'Side B',
          startSec: 3655,
          shazamUrl: null,
        },
      ],
      mixUrl: SUNRISE,
    });
    await app.page.getByText(/^2 not found/).click();
    await expect(
      app.page.getByText('Lone Harbour – Fog Signal (Dub)')
    ).toBeVisible();
    await expect(
      app.page.getByRole('link', { name: 'Open in Shazam' })
    ).toHaveAttribute('href', 'https://www.shazam.com/track/1/fog-signal');
    const links = app.page.getByRole('link', { name: /^Search / });
    const hrefs = await links.evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).href)
    );
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((h) => h.startsWith('https://'))).toBe(true);
  });

  test('F18 Server: not set up by default; signed in it offers Sync now, Sign out and Remove server data', async ({
    app,
  }) => {
    await app.open('#/settings');
    await expect(app.page.getByText(/^No server set up\./)).toBeVisible();
    await app.set('serverSession', SERVER_SESSION);
    await app.set('serverState', SERVER_CONNECTED);
    await expect(
      app.page.getByText('Signed in as dj@example.com.')
    ).toBeVisible();
    await expect(
      app.page.getByRole('button', { name: 'Sync now with server' })
    ).toBeVisible();
    await expect(
      app.page.getByRole('button', { name: 'Sign out' })
    ).toBeVisible();
    // The demo has no server address, so the tap stops before its
    // question; F18b asks it with a fake address.
    await app.page.getByRole('button', { name: 'Remove server data' }).click();
    expect(app.confirms).toEqual([]);
  });

  test.describe('with a fake server address', () => {
    // The second dev server of regression.config.ts: its demo believes in a
    // server at a fake 127.0.0.1 address, which the test answers itself.
    test.use({ baseURL: 'http://127.0.0.1:5174/myOwnSpotifyData/' });

    test('F18b Remove server data asks first; No sends nothing', async ({
      app,
    }) => {
      await app.open('#/settings');
      const sent: string[] = [];
      await app.page.route('**/fake-server/**', (route) => {
        sent.push(`${route.request().method()} ${route.request().url()}`);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '[]',
        });
      });
      await app.set('serverSession', SERVER_SESSION);
      await app.set('serverState', SERVER_CONNECTED);
      const remove = app.page.getByRole('button', {
        name: 'Remove server data',
      });
      await expect(remove).toBeEnabled();
      const before = sent.length;
      await remove.click();
      expect(app.confirms).toEqual([
        'confirm: Remove all your data from the server? Local data on this browser is kept.',
      ]);
      await expect(
        app.page.getByText('Signed in as dj@example.com.')
      ).toBeVisible();
      expect(sent.slice(before), 'requests after No').toEqual([]);
    });
  });

  test('F19 Identify on my computer: the queue lists requests; Cancel and Stop ask first', async ({
    app,
  }) => {
    await app.open('#/mix');
    await expect(
      app.page.getByRole('button', { name: 'Server not set up (Settings)' })
    ).toBeDisabled();
    await app.set('serverSession', SERVER_SESSION);
    await app.set('serverState', SERVER_CONNECTED);
    const list = app.page.getByRole('region', { name: 'Mixes' });
    await expect(
      list.getByText(/^Waiting for your computer/).first()
    ).toBeVisible();
    await list.getByRole('button', { name: 'Cancel' }).first().click();
    await list
      .getByRole('button', { name: 'Stop', exact: true })
      .nth(1)
      .click();
    expect(app.confirms).toEqual([
      'confirm: Cancel this request? It leaves the queue; you can ask again later.',
      'confirm: Stop this scan? The computer ends it within about a minute and keeps the tracks found so far.',
    ]);
    // No: both stay as they were.
    await expect(list.getByRole('button', { name: 'Cancel' })).toHaveCount(2);
  });

  test('F21 Overview: every card links to its screen', async ({ app }) => {
    await app.open('#/');
    const region = app.page.getByRole('region', { name: 'Overview' });
    const want: [string, string][] = [
      ['Listening', '#/crate'],
      ['Heavy rotation', '#/crate/rotation'],
      ['Top this month', '#/top'],
      ['Library', '#/playlists'],
      ['Coverage', '#/settings'],
      ['Last saved mix', `#/mix/${enc(DOCK)}`],
    ];
    for (const [name, href] of want) {
      await expect(
        region.getByRole('heading', { name }).getByRole('link')
      ).toHaveAttribute('href', href);
    }
    // A track opens its details over its screen.
    await region
      .getByRole('heading', { name: 'Top this month' })
      .locator('xpath=following-sibling::*[1]')
      .getByRole('link')
      .first()
      .click();
    await expect(app.page).toHaveURL(/#\/top\?d=/);
    await expect(app.page.getByRole('complementary')).toBeVisible();
  });

  test('F21b search: groups, an artist goes to its page, a track opens over the screen', async ({
    app,
  }) => {
    await app.open('#/top');
    await search(app.page, 'ha');
    const groups = await app.page
      .getByRole('listbox')
      .getByRole('group')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    expect(groups).toEqual(['Tracks', 'Artists', 'Playlists', 'Mixes']);
    await app.page
      .getByRole('group', { name: 'Artists' })
      .getByRole('option')
      .first()
      .click();
    await expect(app.page).toHaveURL(/#\/artist\//);
    // Ctrl+K over Settings; Enter opens the first track's sheet there.
    await app.page.evaluate((h) => (location.hash = h), '#/settings');
    await app.page.keyboard.press('Control+k');
    await app.page.getByRole('combobox').fill('shadow');
    await app.page.keyboard.press('Enter');
    await expect(app.page).toHaveURL(/#\/settings\?d=/);
    await expect(
      app.page.getByRole('dialog').or(app.page.getByRole('complementary'))
    ).toBeVisible();
    // Nothing found: said so.
    await search(app.page, 'kia');
    await expect(app.page.getByText("Nothing matches 'kia'")).toBeVisible();
  });

  test('F21c filters: text, BPM range, key and Clear filters', async ({
    app,
  }) => {
    // The text filter on Top: every row names it, "Showing N of M" says so.
    await app.open('#/top');
    const top = app.page.getByRole('grid', { name: 'Top tracks, 4 weeks' });
    await app.page
      .getByRole('searchbox', { name: 'Filter by title or artist' })
      .fill('neon');
    await expect(
      app.page.getByText(/^Showing [\d,]+ of [\d,]+$/)
    ).toBeVisible();
    const titles = await column(top, 'Title');
    const artists = await column(top, 'Artists');
    expect(titles.length).toBeGreaterThan(0);
    expect(
      titles.every((t, i) =>
        `${t} ${artists[i]}`.toLowerCase().includes('neon')
      )
    ).toBe(true);
    // BPM range and key on a playlist.
    await app.open((ids) => `#/playlist/${enc(ids.bigPlaylist ?? '')}`);
    const grid = app.page.getByRole('grid').first();
    await showFilters(app.page);
    await app.page
      .getByRole('textbox', { name: 'Minimum BPM' })
      .first()
      .fill('124');
    await app.page
      .getByRole('textbox', { name: 'Maximum BPM' })
      .first()
      .fill('128');
    await expect(
      app.page.getByText(/^Showing [\d,]+ of [\d,]+$/)
    ).toBeVisible();
    const bpm = (await column(grid, 'BPM')).map(num);
    expect(bpm.length).toBeGreaterThan(0);
    expect(bpm.every((b) => b !== null && b >= 124 && b <= 128)).toBe(true);
    await app.page.getByRole('button', { name: /^Key:/ }).first().click();
    await app.page.getByRole('radio', { name: '8A', exact: true }).click();
    const keys = await column(grid, 'Key');
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k === '8A')).toBe(true);
    await showFilters(app.page);
    await app.page
      .getByRole('button', { name: 'Clear filters' })
      .first()
      .click();
    await expect(app.page.getByText(/^Showing [\d,]+ of [\d,]+$/)).toHaveCount(
      0
    );
  });

  test('F21d Escape closes the details sheet the moment it is drawn', async ({
    app,
  }) => {
    await app.open('#/top');
    const grid = app.page.getByRole('grid', { name: 'Top tracks, 4 weeks' });
    await grid.waitFor();
    for (let i = 0; i < 4; i += 1) {
      await escapeWhenDrawn(app.page, '.side-sheet');
      await grid
        .getByRole('row')
        .nth(i + 1)
        .click({ position: { x: 120, y: 20 } });
      await expect(app.page).toHaveURL(/#\/top$/);
      await expect(app.page.getByRole('complementary')).toHaveCount(0);
    }
  });

  test('F21e Escape closes the list–detail pane the moment it is drawn', async ({
    app,
  }) => {
    await app.open('#/playlists');
    for (let i = 0; i < 4; i += 1) {
      // The pane: Escape the moment the detail is drawn.
      await escapeWhenDrawn(app.page, '.list-detail-detail');
      await app.page
        .getByRole('grid', { name: 'Playlists' })
        .getByRole('link')
        .nth(i)
        .click();
      await expect(app.page).toHaveURL(/#\/playlists$/);
      await expect(
        app.page.getByRole('grid', { name: 'Playlists' })
      ).toBeVisible();
    }
  });
});

/**
 * Arms one Escape, dispatched the moment `selector` enters the page: in the
 * same task as the render that drew it, before any later frame. A layer
 * registered after drawing (an effect run after paint) misses it.
 */
async function escapeWhenDrawn(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const fire = () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
    const obs = new MutationObserver(() => {
      if (!document.querySelector(sel)) return;
      obs.disconnect();
      fire();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }, selector);
}

// ------------------------------- R. Rounds 003 and 004 (inventory F19)

/** Each track row of the open mix: its clip count and best score, if heard. */
async function heardFigures(
  grid: Locator
): Promise<{ hits: number; best: number }[]> {
  const texts = await grid.evaluate((g) => {
    const body = g.querySelectorAll('[role=rowgroup]')[1];
    return [...body.querySelectorAll('[role=row]')].map(
      (r) => r.getAttribute('aria-label') ?? r.textContent ?? ''
    );
  });
  return texts.flatMap((t) => {
    const m = /(\d+)× · (?:best )?(\d+) %/.exec(t);
    return m ? [{ hits: Number(m[1]), best: Number(m[2]) }] : [];
  });
}

/** The Mixes list with the server signed in (demo controls only). */
async function signedInQueue(app: App): Promise<Locator> {
  await app.open('#/mix');
  await app.set('serverSession', SERVER_SESSION);
  await app.set('serverState', SERVER_CONNECTED);
  const list = app.page.getByRole('region', { name: 'Mixes' });
  await list.getByRole('heading', { name: 'Mixes' }).waitFor();
  return list;
}

test.describe('R. rounds 003 and 004', () => {
  test('R01 a second listen says its speed', async ({ app }) => {
    await app.open(`#/mix/${enc(SUNRISE)}`);
    const grid = await openGrid(app.page);
    await expect(
      grid.getByRole('row').filter({ hasText: 'Juno Haze – Neon Shadow' })
    ).toContainText('second listen · +4 %');
    await expect(
      grid.getByRole('row').filter({ hasText: 'Lumen Rivers – Garden Gravity' })
    ).toContainText('second listen · −4 %');
  });

  test('R02 a candidate from a comment is flagged not heard and has no score', async ({
    app,
  }) => {
    await app.open(`#/mix/${enc(SUNRISE)}`);
    const grid = await openGrid(app.page);
    const row = grid
      .getByRole('row')
      .filter({ hasText: 'from a comment by night_owl' });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('not heard');
    await expect(row).not.toContainText(/heard \d+×/);
    // Kept like every track (round 010): Create playlist counts it.
    const allChip = app.page.getByRole('tab', { name: /^All \(\d+\)$/ });
    const tracks = Number(
      /\((\d+)\)/.exec((await allChip.textContent()) ?? '')?.[1]
    );
    await expect(
      app.page.getByText(new RegExp(`^${tracks} tracks will be added`))
    ).toBeVisible();
  });

  test('R03 clues around a gap and the set-wide clues open as plain lines', async ({
    app,
  }) => {
    await app.open(`#/mix/${enc(SUNRISE)}`);
    await openGrid(app.page);
    await app.page
      .getByText(/^Tracklist from the description/)
      .first()
      .click();
    const setWide = app.page.getByRole('group').filter({
      hasText: /Tracklist from the description \(3 lines, no times\)/,
    });
    await expect(setWide.getByRole('listitem')).toHaveCount(3);
    await app.page.getByText('2 clues around here').click();
    const gap = app.page
      .getByRole('group')
      .filter({ hasText: /2 clues around here/ });
    await expect(gap.getByRole('listitem')).toHaveCount(2);
    await expect(gap.getByRole('listitem').first()).toHaveText(
      /^\d+:\d{2} · night_owl · ID\? sounds like Moreau Unit/
    );
  });

  test('R04 the run line: second pass, resumed, warnings', async ({ app }) => {
    await app.open(`#/mix/${enc(SUNRISE)}`);
    await openGrid(app.page);
    await expect(
      app.page.getByText(
        'Second pass: 41 places · 3 found · Resumed (120 clips kept)'
      )
    ).toBeVisible();
    await app.page.getByText('1 warning', { exact: true }).click();
    await expect(
      app.page
        .getByRole('group')
        .filter({ hasText: /1 warning/ })
        .getByRole('listitem')
    ).toHaveCount(1);
  });

  test('R05 a set stopped early says where, with Ask again once signed in', async ({
    app,
  }) => {
    const list = await signedInQueue(app);
    const dock = list.getByRole('listitem').filter({
      has: app.page.getByRole('link', { name: /^Closing set at the Dock/ }),
    });
    await expect(dock).toContainText(
      'Stopped early at 01:12:00 (by you); ask again later for the rest'
    );
    await expect(dock.getByRole('button', { name: 'Ask again' })).toBeVisible();
    await dock.getByRole('link', { name: /^Closing set at the Dock/ }).click();
    await openGrid(app.page);
    const head = app.page.getByRole('article', {
      name: 'Closing set at the Dock',
    });
    await expect(head).toContainText(/Stopped early at 01:12:00/);
    await expect(head.getByRole('button', { name: 'Ask again' })).toBeVisible();
  });

  test('R06 every heard row says heard N× · best X %', async ({ app }) => {
    await app.open(`#/mix/${enc(SUNRISE)}`);
    const grid = await openGrid(app.page);
    const figures = await heardFigures(grid);
    // 17 tracks: one candidate (not heard), the rest heard.
    expect(figures).toHaveLength(16);
    expect(
      figures.every((f) => f.hits >= 1 && f.best > 0 && f.best <= 100)
    ).toBe(true);
  });

  test('R07 Sort by Confidence (times heard, then %): most first', async ({
    app,
  }) => {
    await app.open(`#/mix/${enc(SUNRISE)}`);
    const grid = await openGrid(app.page);
    // Round 010: Clips heard is folded into Confidence.
    await expect(
      app.page.getByLabel('Sort').locator('option', { hasText: 'Clips heard' })
    ).toHaveCount(0);
    await app.page.getByLabel('Sort').selectOption({ label: 'Confidence' });
    const byBest = await heardFigures(grid);
    expect(byBest).toHaveLength(16);
    expect(nonIncreasing(byBest.map((f) => f.hits * 1000 + f.best))).toBe(true);
    await app.page.getByLabel('Sort').selectOption({ label: 'Time' });
    const times = await column(grid, 'Time');
    expect(times[0]).toBe('0:00');
  });

  test('R08 Heard once shows only the tracks heard once, with their count', async ({
    app,
  }) => {
    await app.open(`#/mix/${enc(SUNRISE)}`);
    const grid = await openGrid(app.page);
    const once = (await heardFigures(grid)).filter((f) => f.hits === 1).length;
    const chip = app.page.getByRole('tab', { name: `Heard once (${once})` });
    await chip.click();
    const shown = await heardFigures(grid);
    expect(shown).toHaveLength(once);
    expect(shown.every((f) => f.hits === 1)).toBe(true);
  });

  test('R09 the Mixes list draws each request’s progress', async ({ app }) => {
    await app.open('#/mix');
    const list = app.page.getByRole('region', { name: 'Mixes' });
    for (const line of [
      'First pass · 47 % · about 25 min left',
      'Second pass ×1.04 · 29 % · about 9 min left',
      'Paused by Shazam until 13:35 · Shazam refuses often: a VPN or a shared network?',
      'First pass · 20 % · last news 12:35: the computer stopped sending news',
      'Second pass ×0.96 · 73 % · stopping…',
    ]) {
      await expect(list.getByText(line, { exact: true })).toBeVisible();
    }
    await expect(
      list.getByRole('progressbar', { name: 'First pass' })
    ).toHaveCount(2);
  });

  test('R10 Cancel, Move to top and Stop sit on the right rows; Move to top needs the server', async ({
    app,
  }) => {
    await app.open('#/mix');
    const list = app.page.getByRole('region', { name: 'Mixes' });
    const rowOf = (name: RegExp) =>
      list.getByRole('listitem').filter({
        has: app.page.getByRole('button', { name }),
      });
    // Queued: the first in line has Cancel only; the next can move up.
    const first = rowOf(/^youtube\.com · demoSet0003 Queued/);
    const next = rowOf(/^soundcloud\.com · lakeside-open-air Queued/);
    await expect(
      first.getByRole('button', { name: 'Move to top' })
    ).toHaveCount(0);
    await expect(first.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(
      next.getByRole('button', { name: 'Move to top' })
    ).toBeVisible();
    // The younger request moved to the top sits above the older one.
    // One read per button: `allTextContents` over this list crashes the
    // Firefox page (S15), `textContent` of each button does not.
    const queued = list.getByRole('button', { name: / Queued$/ });
    const order: string[] = [];
    for (let i = 0; i < (await queued.count()); i++) {
      order.push((await queued.nth(i).textContent()) ?? '');
    }
    expect(order.map((t) => t.split(' ')[2].replace(/Queued$/, ''))).toEqual([
      'demoSet0003',
      'lakeside-open-air',
    ]);
    // Running: Stop; stopping: Stop disabled.
    await expect(
      rowOf(/warehouse-b2b-all-night Identifying/).getByRole('button', {
        name: 'Stop',
        exact: true,
      })
    ).toBeEnabled();
    await expect(
      rowOf(/after-hours-at-the-pier Stopping…/).getByRole('button', {
        name: 'Stop',
        exact: true,
      })
    ).toBeDisabled();
    // Without the server the tap says so, asks nothing and sends nothing.
    await next.getByRole('button', { name: 'Move to top' }).click();
    await expect(
      list.getByText('Sign in to the server (Settings)')
    ).toBeVisible();
    expect(app.confirms).toEqual([]);
  });

  test('R11 Check now, and Checking… while it runs', async ({ app }) => {
    const list = await signedInQueue(app);
    await expect(
      list.getByText(/^7 requests waiting or running · checked every minute\.$/)
    ).toBeVisible();
    await expect(list.getByRole('button', { name: 'Check now' })).toBeEnabled();
    await app.set('serverState', { ...SERVER_CONNECTED, status: 'pulling' });
    await expect(
      list.getByRole('button', { name: 'Checking…' })
    ).toBeDisabled();
  });

  test('R12 a request already gone, and a server without migration 0003, say so', async ({
    app,
  }) => {
    const list = await signedInQueue(app);
    for (const note of ['Already taken by your computer', 'Already finished']) {
      await app.set('mixQueueNote', note);
      await expect(list.getByText(note, { exact: true })).toBeVisible();
    }
    const migration =
      'Apply migration 0003 on the server to use Cancel, Move to top and Stop';
    await app.set('mixError', migration);
    await expect(list.getByText(migration)).toBeVisible();
  });

  test('R13 the worker help warns against a VPN', async ({ app }) => {
    await app.open('#/mix');
    await app.page.getByText('Run the worker on your computer').click();
    await expect(
      app.page.getByText(/Don't run the worker on a VPN/)
    ).toBeVisible();
  });
});

// ------------------------------------------- Y. Release year (round 005)

test.describe('Y. release year', () => {
  test('Y01 a Released column after Key; undated is a dash, never 0', async ({
    app,
  }) => {
    for (const hash of [
      '#/top',
      '#/crate/rotation',
      '#/crate/gems',
      '#/crate/classics',
      '#/crate/year',
      '#/crate/finish',
      (ids: DemoIds) => `#/playlist/${enc(ids.bigPlaylist ?? '')}`,
      (ids: DemoIds) => `#/artist/${enc(ids.artist ?? '')}`,
    ]) {
      const at = await app.open(hash);
      // The artist's tracks sit beside the list: the second grid there.
      const grid = main(app.page)
        .getByRole('grid')
        .filter({ has: app.page.getByRole('columnheader', { name: 'Key' }) })
        .first();
      await grid.waitFor();
      await showAll(app.page);
      const heads = await headers(grid);
      expect(heads.indexOf('Released'), at).toBe(heads.indexOf('Key') + 1);
      const years = await column(grid, 'Released');
      expect(years.length, at).toBeGreaterThan(0);
      expect(
        years.filter((y) => y === '0'),
        at
      ).toEqual([]);
      expect(
        years.every((y) => /^\d{4}$/.test(y) || y.includes('no data')),
        at
      ).toBe(true);
    }
  });

  test('Y02 Released from the header: oldest first, again newest first, undated last', async ({
    app,
  }) => {
    for (const hash of [
      '#/top',
      (ids: DemoIds) => `#/playlist/${enc(ids.bigPlaylist ?? '')}`,
    ]) {
      await app.open(hash);
      const grid = main(app.page).getByRole('grid').first();
      const released = grid.getByRole('button', {
        name: 'Released',
        exact: true,
      });
      await released.click();
      await showAll(app.page);
      expect(yearOrder(await column(grid, 'Released'), 'asc')).toBeNull();
      await released.click();
      expect(yearOrder(await column(grid, 'Released'), 'desc')).toBeNull();
    }
  });

  test('Y03 Sort by year, oldest first: the switch where the header cannot sort', async ({
    app,
  }) => {
    await app.page.setViewportSize({ width: 390, height: 844 });
    await app.open('#/top');
    await showFilters(app.page);
    const toggle = app.page.getByRole('switch', {
      name: 'Sort by year, oldest first',
    });
    await expect(toggle).toHaveCount(1);
    await toggle.check();
    const grid = main(app.page).getByRole('grid').first();
    await showAll(app.page);
    expect(yearOrder(await itemYears(grid), 'asc')).toBeNull();
    await toggle.uncheck();
    expect(yearOrder(await itemYears(grid), 'asc')).not.toBeNull();
    // At 1440 the header sorts and the switch is gone.
    await app.page.setViewportSize({ width: 1440, height: 900 });
    await expect(toggle).toHaveCount(0);
  });

  test('Y04 the decade filter keeps only that decade', async ({ app }) => {
    await app.open('#/top');
    const grid = main(app.page).getByRole('grid').first();
    const total = (await column(grid, 'Released')).length;
    await app.page
      .getByRole('group', { name: 'Decade' })
      .getByRole('button', { name: '90s', exact: true })
      .click();
    const years = (await column(grid, 'Released')).map(num);
    expect(years.length).toBeGreaterThan(0);
    expect(years.every((y) => y !== null && y >= 1990 && y < 2000)).toBe(true);
    await expect(
      app.page.getByText(new RegExp(`^Showing ${years.length} of ${total}$`))
    ).toBeVisible();
    await app.page
      .getByRole('group', { name: 'Decade' })
      .getByRole('button', { name: '90s', exact: true })
      .click();
    expect(await column(grid, 'Released')).toHaveLength(total);
  });

  test('Y05 the details say Released and where from', async ({ app }) => {
    await app.open((ids) => `#/top?d=${enc(ids.track ?? '')}`);
    const sheet = app.page.getByRole('complementary');
    const released = sheet
      .getByRole('term')
      .filter({ hasText: /^Released$/ })
      .locator('xpath=following-sibling::*[1]');
    await expect(released).toHaveText(
      /^(\d{4} · (ReccoBeats \(earliest album\)|album)|.*no data.*)$/
    );
  });

  test('Y06 the open mix: Released column, Released sort and a Decade', async ({
    app,
  }) => {
    await app.open(`#/mix/${enc(SUNRISE)}`);
    const grid = await openGrid(app.page);
    expect(await headers(grid)).toContain('Released');
    await app.page.getByLabel('Sort').selectOption('released');
    expect(yearOrder(await column(grid, 'Released'), 'asc')).toBeNull();
    await app.page.getByLabel('Decade').selectOption({ label: '90s' });
    await expect(app.page.getByText(/^Hidden, not deleted/)).toBeVisible();
    const years = (await column(grid, 'Released')).map(num);
    expect(years.length).toBeGreaterThan(0);
    expect(years.every((y) => y !== null && y >= 1990 && y < 2000)).toBe(true);
  });

  test('M01 Mix header sort: Confidence highest first, then lowest, the select follows', async ({
    app,
  }) => {
    await app.open(`#/mix/${enc(SUNRISE)}`);
    const grid = await openGrid(app.page);
    const header = grid
      .getByRole('columnheader', { name: 'Confidence' })
      .getByRole('button');
    await header.click();
    const high = await heardFigures(grid);
    expect(high).toHaveLength(16);
    expect(nonIncreasing(high.map((f) => f.hits * 1000 + f.best))).toBe(true);
    await expect(app.page.getByLabel('Sort')).toHaveValue('confidence');
    await header.click();
    const low = await heardFigures(grid);
    expect(low).toHaveLength(16);
    expect(nonIncreasing(low.map((f) => -(f.hits * 1000 + f.best)))).toBe(true);
    await app.page.getByLabel('Sort').selectOption({ label: 'Set order' });
    expect((await column(grid, 'Time'))[0]).toBe('0:00');
  });

  test('M02 Mix leaner table: merged Confidence, app link, Shazam and SoundCloud icons', async ({
    app,
  }) => {
    await app.open(`#/mix/${enc(SUNRISE)}`);
    const grid = await openGrid(app.page);
    const heads = await headers(grid);
    for (const gone of ['Source', 'In your library', 'Clips']) {
      expect(heads).not.toContain(gone);
    }
    await expect(grid.getByRole('button', { name: /^Validate / })).toHaveCount(
      0
    );
    await expect(
      app.page.getByRole('tab', { name: /^(To review|Validated) / })
    ).toHaveCount(0);
    // One cell: times heard, then the best percent.
    const shorts = await grid.locator('.mix-conf-short').allTextContents();
    expect(shorts.length).toBeGreaterThan(0);
    expect(shorts.every((t) => /^(×\d+ · )?\d+%$/.test(t))).toBe(true);
    expect(shorts.some((t) => /^×\d+ · \d+%$/.test(t))).toBe(true);
    // A found row opens the Spotify app in place.
    const play = grid.getByRole('link', { name: /^Play .+ on Spotify$/ });
    await expect(play.first()).toHaveAttribute('href', /^spotify:track:\w+$/);
    await expect(play.first()).not.toHaveAttribute('target', '_blank');
    // Shazam where the row has its page, SoundCloud search on every named
    // row, each in a new tab.
    const shazam = grid.getByRole('link', { name: /^Shazam / }).first();
    await expect(shazam).toHaveAttribute(
      'href',
      /^https:\/\/www\.shazam\.com\/track\//
    );
    await expect(shazam).toHaveAttribute('target', '_blank');
    const sc = grid
      .getByRole('link', { name: /^Search SoundCloud for / })
      .first();
    await expect(sc).toHaveAttribute(
      'href',
      /^https:\/\/soundcloud\.com\/search\/sounds\?q=/
    );
    await expect(sc).toHaveAttribute('target', '_blank');
  });

  test('M03 Mix: link a Spotify track to a not-found row; an album is refused; Remove link', async ({
    app,
  }) => {
    await app.open(`#/mix/${enc(SUNRISE)}`);
    const grid = await openGrid(app.page);
    const caption = app.page
      .locator('.mix-caption')
      .filter({ hasText: / on Spotify · \d+ not found/ });
    const counts = async () => {
      const m = /(\d+) on Spotify · (\d+) not found/.exec(
        (await caption.textContent()) ?? ''
      );
      expect(m, 'the review line').not.toBeNull();
      return { found: Number(m![1]), missing: Number(m![2]) };
    };
    const before = await counts();
    expect(before.missing).toBeGreaterThan(0);
    const mark = grid
      .getByRole('button', { name: /^Link a Spotify track to / })
      .first();
    const label = (await mark.getAttribute('aria-label')) ?? '';
    const name = label.replace(/^Link a Spotify track to /, '');
    // An album link is refused with the message; the row is unchanged.
    await mark.click();
    const field = app.page.getByRole('textbox', { name: 'Spotify track link' });
    await field.fill('https://open.spotify.com/album/1qGibBSuprByJCYMC4zRUG');
    await app.page.getByRole('button', { name: 'Link', exact: true }).click();
    await expect(
      app.page.getByText('That is not a Spotify track link.')
    ).toBeVisible();
    expect(await counts()).toEqual(before);
    // The example link: the row is found, opened in the app, counts move.
    await field.fill(
      'https://open.spotify.com/track/1qGibBSuprByJCYMC4zRUG?si=f4ed2a88f4744bea'
    );
    await app.page.getByRole('button', { name: 'Link', exact: true }).click();
    await expect(field).toHaveCount(0);
    await expect(
      grid.getByRole('link', { name: `Play ${name} on Spotify` })
    ).toHaveAttribute('href', 'spotify:track:1qGibBSuprByJCYMC4zRUG');
    expect(await counts()).toEqual({
      found: before.found + 1,
      missing: before.missing - 1,
    });
    // More › Remove link: back to not found.
    await grid.getByRole('button', { name: `More for ${name}` }).click();
    await app.page.getByRole('menuitem', { name: 'Remove link' }).click();
    await expect(
      grid.getByRole('button', { name: `Link a Spotify track to ${name}` })
    ).toBeVisible();
    expect(await counts()).toEqual(before);
  });

  test('Y07 Activity names the release years pass', async ({ app }) => {
    await app.open('#/top');
    await app.set('lookupState', {
      status: 'running',
      pass: 'release years',
      done: 120,
      total: 900,
    });
    await app.page.getByRole('button', { name: /^Running/ }).click();
    await expect(app.page.getByText('Looking up release years')).toBeVisible();
  });

  test('U01 Settings · Updates lists the six jobs and the switch', async ({
    app,
  }) => {
    await app.open('#/settings');
    await expect(
      app.page.getByRole('heading', { name: 'Updates', exact: true })
    ).toBeVisible();
    for (const label of [
      'Server',
      'Spotify',
      'BPM and key',
      'Artist reach',
      'History',
      'Rekordbox',
    ]) {
      await expect(
        app.page.locator('.update-line').filter({ hasText: label }).first()
      ).toBeVisible();
    }
    await expect(
      app.page.getByRole('heading', { name: 'Automatic updates' })
    ).toBeVisible();
  });

  test('Y08 Settings · Audio data counts release years', async ({ app }) => {
    await app.open('#/settings');
    await expect(
      app.page.getByText(/^Release years: [\d,]+ of [\d,]+ tracks$/)
    ).toBeVisible();
  });
});

// --------------------------------------------------- D. Disconnect last

test('F10b Disconnect asks first; Yes empties this browser and shows Connect', async ({
  app,
}) => {
  await app.open('#/settings');
  const disconnect = app.page.getByRole('button', { name: 'Disconnect' });
  await disconnect.click();
  expect(app.confirms).toEqual([
    'confirm: Disconnect and delete all local data? Server data is kept.',
  ]);
  await expect(app.page.getByRole('heading', { level: 1 })).toHaveText(
    'Settings'
  );
  app.answer = true;
  await disconnect.click();
  await expect(
    app.page.getByRole('button', { name: 'Connect Spotify' })
  ).toBeVisible();
});
