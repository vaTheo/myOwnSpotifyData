/**
 * Every page and state the visual loop opens (spec 003, research D19),
 * following contracts/screens.md. A page marked `since` belongs to a story
 * not built yet; the runner skips it until that story is in `READY`.
 *
 * Selectors are by role and visible text, never by class, so the list
 * survives the redesign of the markup.
 */
import type { Page } from '@playwright/test';
import { DEMO_NOW, type DemoIds, type DemoVariant } from '../../src/dev/flag';

export type Story =
  'US1' | 'US2' | 'US3' | 'US4' | 'US5' | 'US6' | 'US7' | 'US8';

/** The stories whose screens exist; extended as each phase lands. */
export const READY: readonly Story[] = ['US3'];

export interface ShotPage {
  id: string;
  /** Demo variant, `full` when absent. */
  variant?: DemoVariant;
  /** The hash route to open, or a builder from the demo's ids. */
  hash: string | ((ids: DemoIds) => string);
  /** Clicks and state changes after the page has rendered. */
  setup?: (page: Page) => Promise<void>;
  /** Extra checks of this page; each returned string is a finding. */
  expect?: (page: Page) => Promise<string[]>;
  since?: Story;
}

const enc = encodeURIComponent;

/** The server session the Settings pages sign in with (demo only). */
const SERVER_SESSION = {
  accessToken: 'demo',
  refreshToken: 'demo',
  expiresAt: DEMO_NOW + 3_600_000,
  email: 'dj@example.com',
};

/** An artist reach summary for the `done` reach states. */
const REACH_SUMMARY = {
  version: 1,
  ranAt: DEMO_NOW - 86_400_000,
  paused: [],
  artists: 1204,
  covered: 1151,
  resolved: 1151,
  listenbrainz: 1100,
  deezer: 1120,
  wikipedia: 310,
  wellKnown: 290,
};

/** A connected server, so Ask again shows on the Mix pages (S08b). */
const SERVER_CONNECTED = {
  status: 'connected',
  lastSyncAt: DEMO_NOW - 60_000,
  usedBytes: null,
  stamps: [],
  rejected: 0,
};

/** The Mixes list with a connected server: every chip and queue action. */
async function mixesConnected(page: Page): Promise<void> {
  await page.getByRole('heading', { name: 'Mixes', exact: true }).waitFor();
  await setState(page, 'serverSession', SERVER_SESSION);
  await setState(page, 'serverState', SERVER_CONNECTED);
}

async function tab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name, exact: true }).first().click();
}

async function setState(page: Page, name: string, value: unknown) {
  await page.evaluate(([n, v]) => window.__demo?.set(n as string, v), [
    name,
    value,
  ] as const);
}

/** The demo's scanned mix: the review, the run line, the filters (S08c). */
const SUNRISE = 'https://www.youtube.com/watch?v=demoSet0001';

/** The open mix's tracklist on screen. */
async function openGrid(page: Page): Promise<void> {
  await page.getByRole('grid', { name: 'Tracklist' }).waitFor();
}

/** The demo's TrackId mix: nothing validated, so All tracks by default. */
const HARBOUR = 'https://soundcloud.com/demo-dj/peak-time-set-at-the-harbour';

/**
 * No button or link left behind the opaque top bar, where axe reads it as
 * a covered touch target: the page moves by the fewest pixels (up first)
 * until the band under the bar holds none.
 */
async function settleRows(page: Page, keep?: string): Promise<void> {
  await page.evaluate((keepText) => {
    const bar = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        '--app-top-bar'
      )
    );
    const targets = [
      ...document.querySelectorAll<HTMLElement>(
        'button, a[href], select, input, [role=tab]'
      ),
    ].filter((el) => !el.closest('header'));
    // The top bar's own controls (the search field, S09): a target under
    // the bar must not share any of their pixels either.
    const barTargets = [
      ...document.querySelectorAll<HTMLElement>(
        'header button, header a[href]'
      ),
    ].map((el) => el.getBoundingClientRect());
    const underBarTarget = (r: DOMRect): boolean =>
      barTargets.some(
        (b) =>
          r.left < b.right &&
          r.right > b.left &&
          r.top < b.bottom &&
          r.bottom > b.top
      );
    // The heading the page is about stays below the bar.
    const kept = [...document.querySelectorAll<HTMLElement>('h2')].find(
      (h) => h.textContent === keepText
    );
    const clear = (withKept: boolean): boolean =>
      (!withKept ||
        kept === undefined ||
        kept.getBoundingClientRect().top >= bar) &&
      targets.every((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.height === 0 ||
          r.bottom <= 0 ||
          r.top >= bar ||
          (r.top >= 0 && r.bottom <= bar && !underBarTarget(r))
        );
      });
    const start = window.scrollY;
    // With the heading in view if a place allows it, else without.
    for (const withKept of [true, false]) {
      for (let d = 0; d <= 400; d += 1) {
        for (const y of [start - d, start + d]) {
          window.scrollTo(0, y);
          if (clear(withKept)) return;
        }
      }
    }
    window.scrollTo(0, start);
  }, keep);
}

/**
 * The Create playlist card brought on screen, below the tracklist, after
 * the demo states are set (they change its height): Add track right under
 * the top bar, then no row cut half under it.
 */
async function createCard(
  page: Page,
  ...states: [string, unknown][]
): Promise<void> {
  await openGrid(page);
  for (const [name, value] of states) await setState(page, name, value);
  await page
    .getByRole('button', { name: 'Add track', exact: true })
    .evaluate((el) => {
      (el as HTMLElement).style.scrollMarginTop = 'var(--app-top-bar)';
      el.scrollIntoView({ block: 'start' });
    });
  await settleRows(page, 'Create playlist');
}

/** Two tracks Create playlist did not find, with their dig links. */
const UNMATCHED = [
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
];

/** The 1440 project's window widened to 1,600 px (the Mixes pane stays). */
async function at1600(page: Page): Promise<void> {
  if (page.viewportSize()?.width !== 1440) return;
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(150);
}

/** The 1024 project's window shrunk to 900 px; other widths stay. */
async function at900(page: Page): Promise<void> {
  if (page.viewportSize()?.width !== 1024) return;
  await page.setViewportSize({ width: 900, height: 768 });
  await page.waitForTimeout(150);
}

/** The first track row of the screen's table (row 0 is the header). */
async function firstRow(page: Page): Promise<void> {
  await page
    .getByRole('grid')
    .first()
    .getByRole('row')
    .nth(1)
    .click({ position: { x: 120, y: 20 } });
}

/**
 * The charts page's grid: Winter pressed, then Jan 2026 focused with the
 * keyboard's focus ring (Shift+Tab, Tab first so focus counts as keyboard).
 */
async function winterJanuary(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Winter 2026,/ }).click();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: /^Jan 2026,/ }).focus();
  await page.mouse.move(1, 1);
}

/** The search opened with `/` and `text` typed in it (US7). */
async function search(page: Page, text: string): Promise<void> {
  await page.locator('main').waitFor();
  await page.keyboard.press('/');
  const box = page.getByRole('combobox');
  await box.waitFor();
  await box.fill(text);
}

/** The result groups on screen are these, in this order. */
function searchGroups(want: string[]) {
  return async (page: Page): Promise<string[]> => {
    const got = await page
      .getByRole('listbox')
      .getByRole('group')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    return got.join(',') === want.join(',')
      ? []
      : [`search groups ${got.join(', ') || 'none'}, want ${want.join(', ')}`];
  };
}

/** A playlist on a larger window folds its filters behind a button. */
async function showFilters(page: Page): Promise<void> {
  const fold = page.getByRole('button', { name: 'Filters', expanded: false });
  if (await fold.count()) await fold.click();
}

/** The first FilterBar's BPM range. */
async function bpmRange(page: Page, min: string, max: string): Promise<void> {
  await showFilters(page);
  await page.getByRole('textbox', { name: 'Minimum BPM' }).first().fill(min);
  await page.getByRole('textbox', { name: 'Maximum BPM' }).first().fill(max);
}

/** The first FilterBar's key, with or without the compatible keys. */
async function pickKey(
  page: Page,
  code: string,
  compatible: boolean
): Promise<void> {
  await showFilters(page);
  await page.getByRole('button', { name: /^Key:/ }).first().click();
  if (compatible) {
    await page.getByRole('switch', { name: 'Include compatible keys' }).check();
  }
  await page.getByRole('radio', { name: code, exact: true }).click();
}

/** A filter is in force: "Showing N of M" says so. */
async function showing(page: Page): Promise<string[]> {
  return (await page.getByText(/^Showing [\d,]+ of [\d,]+$/).count())
    ? []
    : ['no "Showing N of M" line'];
}

/**
 * SC-001: at 1440 × 900 a playlist shows at least 15 whole rows without
 * scrolling, with the title, artists, plays, BPM and key columns on screen.
 */
async function fifteenRows(page: Page): Promise<string[]> {
  const size = page.viewportSize();
  if (!size || size.width !== 1440 || size.height !== 900) return [];
  return page.evaluate(() => {
    const out: string[] = [];
    const grid = document.querySelector('[role=grid]');
    if (!grid) return ['SC-001: no table on the page'];
    const rows = [...grid.querySelectorAll('[role=row][data-row-id]')];
    const whole = rows.filter((row) => {
      const r = row.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight + 0.5;
    });
    if (whole.length < 15)
      out.push(`SC-001: ${whole.length} whole rows in the viewport, needs 15`);
    const all = [...grid.querySelectorAll('[role=columnheader]')];
    const headers = all
      .filter((h) => h.getBoundingClientRect().width > 0)
      .map((h) => (h.textContent ?? '').trim());
    for (const name of ['Title', 'Artists', 'Plays', 'BPM', 'Key']) {
      if (!headers.includes(name))
        out.push(`SC-001: no ${name} column on screen`);
    }
    // A readable title: the 15 rows' title cells are not cut short.
    const at = all.findIndex((h) => (h.textContent ?? '').trim() === 'Title');
    if (at >= 0) {
      for (const row of whole.slice(0, 15)) {
        const text = row
          .querySelectorAll('[role=gridcell]')
          [at]?.querySelector('.dt-text');
        if (text && text.scrollWidth > text.clientWidth + 1)
          out.push(
            `SC-001: title cut to ${text.clientWidth}px: "${text.textContent}"`
          );
      }
    }
    return out;
  });
}

export const PAGES: ShotPage[] = [
  // Connect and the frame
  { id: 'connect', variant: 'signed-out', hash: '#/' },
  {
    id: 'banner-error',
    hash: '#/top',
    setup: (page) =>
      setState(page, 'banner', {
        kind: 'error',
        text: 'Could not open local storage: the demo says so.',
        inlineOn: [],
      }),
  },

  {
    id: 'activity-open',
    hash: '#/top',
    setup: async (page) => {
      await setState(page, 'syncState', {
        status: 'running',
        done: 14,
        total: 40,
        current: 'Peak Time Techno',
        pending: [],
      });
      await page.getByRole('button', { name: /^Running/ }).click();
    },
  },

  // Listening: Top
  { id: 'top-tracks', hash: '#/top' },
  { id: 'top-artists', hash: '#/top', setup: (page) => tab(page, 'Artists') },
  {
    id: 'top-compare',
    hash: '#/top',
    // The toggle exists on large windows only; at 390 the page is the table.
    setup: async (page) => {
      const toggle = page.getByRole('button', { name: 'Compare periods' });
      if (await toggle.count()) await toggle.click();
    },
  },
  { id: 'top-empty', variant: 'empty', hash: '#/top' },

  // Listening: Crate
  { id: 'crate', hash: '#/crate' },
  { id: 'crate-empty', variant: 'empty', hash: '#/crate' },
  { id: 'crate-old-import', variant: 'old-import', hash: '#/crate' },
  { id: 'crate-rotation', hash: '#/crate/rotation' },
  { id: 'crate-gems', hash: '#/crate/gems' },
  { id: 'crate-classics', hash: '#/crate/classics' },
  { id: 'crate-year', hash: '#/crate/year' },
  { id: 'crate-year-month', hash: '#/crate/year/2026-08' },
  {
    // Winter: the grid's season header on wider windows, the chip on a
    // phone; the rows' charts open with the previous December.
    id: 'crate-year-winter',
    hash: '#/crate/year',
    setup: async (page) => {
      const season = page.getByRole('button', { name: /^Winter \d{4},/ });
      if (await season.count()) await season.first().click();
      else await tab(page, 'Winter');
    },
  },
  { id: 'crate-finish', hash: '#/crate/finish' },

  // Library: Playlists
  { id: 'playlists', hash: '#/playlists' },
  { id: 'playlists-empty', variant: 'empty', hash: '#/playlists' },
  {
    id: 'playlist-big',
    hash: (ids) => `#/playlist/${enc(ids.bigPlaylist ?? '')}`,
    expect: fifteenRows,
  },
  {
    // Inside the one quota lock-out (S08d round 1): Sync this playlist rests
    // and says why; Like all songs refuses inline on a tap.
    id: 'playlist-quota',
    hash: (ids) => `#/playlist/${enc(ids.playlist ?? '')}`,
    setup: (page) =>
      setState(page, 'spotifyQuotaLock', DEMO_NOW + 3 * 3_600_000),
  },
  {
    id: 'playlist-order',
    hash: (ids) => `#/playlist/${enc(ids.playlist ?? '')}`,
    setup: (page) => tab(page, 'Playlist order'),
  },
  {
    id: 'playlist-match-select',
    hash: (ids) => `#/playlist/${enc(ids.playlist ?? '')}`,
    setup: (page) => tab(page, 'Match'),
  },
  {
    id: 'playlist-match',
    hash: (ids) => `#/playlist/${enc(ids.playlist ?? '')}`,
    setup: async (page) => {
      await tab(page, 'Match');
      // In Match mode a row click sets the seed.
      await firstRow(page);
    },
  },
  {
    id: 'playlist-liking',
    hash: (ids) => `#/playlist/${enc(ids.playlist ?? '')}`,
    setup: async (page) => {
      const id = await page.evaluate(() => window.__demo?.ids.playlist);
      await setState(page, 'likeState', {
        status: 'liking',
        playlistId: id,
        done: 12,
        total: 40,
      });
    },
  },

  // Library: Artists
  { id: 'artists', hash: '#/artists' },
  {
    id: 'artists-radar',
    hash: '#/artists',
    setup: (page) => tab(page, 'Under the radar'),
  },
  {
    id: 'artists-radar-listeners',
    hash: '#/artists',
    setup: async (page) => {
      await tab(page, 'Under the radar');
      // The Listeners header sorts on larger windows; a phone keeps the tabs.
      const header = page.getByRole('button', { name: 'Listeners' });
      if (await header.count()) await header.click();
      else await tab(page, 'Fewest listeners');
    },
  },
  {
    // A filter that reaches every group, so the headings are on screen.
    id: 'artists-radar-groups',
    hash: '#/artists',
    setup: async (page) => {
      await tab(page, 'Under the radar');
      await page.getByPlaceholder('Filter artists').fill('fjord');
    },
  },
  {
    id: 'artists-radar-no-reach',
    variant: 'no-reach',
    hash: '#/artists',
    setup: (page) => tab(page, 'Under the radar'),
  },
  { id: 'artist', hash: (ids) => `#/artist/${enc(ids.artist ?? '')}` },

  // Mix
  { id: 'mix', hash: '#/mix' },
  {
    // Opened by its address (S08, T084): TrackId and description rows, a gap.
    id: 'mix-open',
    hash: `#/mix/${enc('https://soundcloud.com/demo-dj/peak-time-set-at-the-harbour')}`,
  },
  {
    // Opened from the Saved mixes list: a worker scan with confidences.
    id: 'mix-worker',
    hash: '#/mix',
    setup: (page) =>
      page
        .getByRole('link', {
          name: /Sunrise closing set \(scanned on my computer\)/,
        })
        .first()
        .click(),
  },
  {
    // A row's More menu open: Edit, Delete, Search on Spotify.
    id: 'mix-menu',
    hash: `#/mix/${enc('https://soundcloud.com/demo-dj/peak-time-set-at-the-harbour')}`,
    setup: (page) =>
      page
        .getByRole('grid', { name: 'Tracklist' })
        .getByRole('button', { name: /^More for / })
        .first()
        .click(),
  },
  {
    // The Mixes pane brought back beside an open mix (folded below 1,600 px).
    id: 'mix-open-pane',
    hash: `#/mix/${enc('https://soundcloud.com/demo-dj/peak-time-set-at-the-harbour')}`,
    setup: async (page) => {
      await page.getByRole('grid', { name: 'Tracklist' }).waitFor();
      const mixes = page.getByRole('button', { name: 'Mixes', exact: true });
      if (await mixes.isVisible()) await mixes.click();
    },
  },
  {
    // A failure while the pane is folded over an open mix (review F1): the
    // error line under the mix's header and the mark on the Mixes button;
    // on phones under the mix's header too, not in the list (round 2).
    id: 'mix-error-folded',
    hash: `#/mix/${enc('https://soundcloud.com/demo-dj/peak-time-set-at-the-harbour')}`,
    setup: async (page) => {
      await page.getByRole('grid', { name: 'Tracklist' }).waitFor();
      await setState(
        page,
        'mixError',
        'Could not read your requests: the server did not answer'
      );
    },
  },
  {
    // A row in edit: four text fields, Save and Cancel.
    id: 'mix-edit',
    hash: `#/mix/${enc('https://soundcloud.com/demo-dj/peak-time-set-at-the-harbour')}`,
    setup: async (page) => {
      await page
        .getByRole('grid', { name: 'Tracklist' })
        .getByRole('button', { name: /^More for / })
        .first()
        .click();
      await page.getByRole('menuitem', { name: 'Edit' }).click();
    },
  },
  {
    // An address naming a mix this browser has not saved.
    id: 'mix-missing',
    hash: `#/mix/${enc('https://soundcloud.com/someone/not-saved-here')}`,
  },
  {
    // Rounds 003–004 rows, seeded (T120, T128): clip counts, second listen
    // at +4 % and −4 %, a candidate "not heard" with its clue, a gap with
    // clues, set-wide clues; the Sort select shows.
    id: 'mix-round004',
    hash: `#/mix/${enc('https://www.youtube.com/watch?v=demoSet0001')}`,
  },
  {
    // The review (S08c, T117, T118): Spotify status per row (found, not
    // found, not checked), Validate on, the filter chips, the run line
    // with its warning collapsed, the review line and Check on Spotify.
    id: 'mix-review',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: openGrid,
  },
  {
    // The same with the Mixes pane beside it: 1,600 px, where it stays.
    id: 'mix-review-1600',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await at1600(page);
      await openGrid(page);
    },
  },
  {
    // Check on Spotify running: "Checked 12 of 40", the bar and Stop.
    id: 'mix-check-running',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await openGrid(page);
      await setState(page, 'spotifyCheckState', {
        status: 'running',
        url: SUNRISE,
        done: 12,
        total: 40,
        stopping: false,
      });
    },
  },
  {
    // Check on Spotify done: every named track checked, the button resting.
    id: 'mix-check-done',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await openGrid(page);
      await setState(page, 'spotifyCheckState', {
        status: 'finished',
        url: SUNRISE,
        done: 40,
        total: 40,
        stopped: false,
      });
    },
  },
  {
    // A check refused inline (quota), never a banner.
    id: 'mix-check-error',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await openGrid(page);
      await setState(page, 'spotifyCheckState', {
        status: 'error',
        url: SUNRISE,
        message: 'Spotify quota reached. Check again after 7 Nov 2026, 22:00.',
      });
    },
  },
  ...(
    [
      ['mix-filter-review', /^To review/],
      ['mix-filter-validated', /^Validated \(/],
      ['mix-filter-notfound', /^Not on Spotify/],
      ['mix-filter-heard', /^Heard once/],
    ] as const
  ).map(([id, name]): ShotPage => ({
    // One filter chip on: the rows it keeps and the caption.
    id,
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await openGrid(page);
      await page.getByRole('tab', { name }).click();
    },
  })),
  {
    // A quota lock-out met by a check: the button rests disabled with the
    // message until it lapses (fix round 1).
    id: 'mix-check-locked',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await openGrid(page);
      await setState(page, 'spotifyQuotaLock', DEMO_NOW + 3 * 3_600_000);
    },
  },
  {
    // The phone's More menu with its Listen… item opened (fix round 1, R3);
    // on wider windows the same row's More menu.
    id: 'mix-listen-more',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await openGrid(page);
      await page
        .getByRole('grid', { name: 'Tracklist' })
        .getByRole('button', { name: /^More for / })
        .first()
        .click();
      const listen = page.getByRole('menuitem', { name: 'Listen…' });
      if (await listen.isVisible()) await listen.click();
    },
  },
  {
    // The run line's warning expanded.
    id: 'mix-run-warnings',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await openGrid(page);
      await page.getByText('1 warning', { exact: true }).click();
    },
  },
  {
    // A result asked again after a stop (T124, T125): stopped early with
    // Ask again, the review kept on the earlier tracks, the removed one
    // left out, the new ones To review. The server is connected.
    id: 'mix-reresult',
    hash: `#/mix/${enc('https://soundcloud.com/demo-dj/closing-set-at-the-dock')}`,
    setup: async (page) => {
      await openGrid(page);
      await setState(page, 'serverSession', SERVER_SESSION);
      await setState(page, 'serverState', SERVER_CONNECTED);
    },
  },
  {
    // The Listen menu open (the More menu on phones, where it joins it).
    id: 'mix-listen',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await openGrid(page);
      const grid = page.getByRole('grid', { name: 'Tracklist' });
      const listen = grid.getByRole('button', { name: /^Listen to / }).first();
      if (await listen.isVisible()) await listen.click();
      else
        await grid
          .getByRole('button', { name: /^More for / })
          .first()
          .click();
    },
  },
  {
    // The Mixes list (T116, T121, T123): running with progress (first pass,
    // second pass ×1.04), paused, stale, stopping; two queued, the younger
    // moved to the top; found, failed, rejected, stopped early with Ask
    // again; saved and playlist made. The server is connected.
    id: 'mix-queue',
    hash: '#/mix',
    setup: mixesConnected,
  },
  {
    // The list scrolled to its finished rows: Failed with its reason,
    // stopped early with Ask again, earlier requests collapsed.
    id: 'mix-finished',
    hash: '#/mix',
    setup: async (page) => {
      await mixesConnected(page);
      await page
        .getByRole('button', { name: /festival-warm-up/ })
        .scrollIntoViewIfNeeded();
    },
  },
  {
    // Cancel found the request already taken (ruling D4).
    id: 'mix-gone-taken',
    hash: '#/mix',
    setup: async (page) => {
      await mixesConnected(page);
      await setState(page, 'mixQueueNote', 'Already taken by your computer');
    },
  },
  {
    // Stop found the request already finished (ruling D4).
    id: 'mix-gone-finished',
    hash: '#/mix',
    setup: async (page) => {
      await mixesConnected(page);
      await setState(page, 'mixQueueNote', 'Already finished');
    },
  },
  {
    // A server without migration 0003 (ruling D5).
    id: 'mix-migration',
    hash: '#/mix',
    setup: async (page) => {
      await mixesConnected(page);
      await setState(
        page,
        'mixError',
        'Apply migration 0003 on the server to use Cancel, Move to top and Stop'
      );
    },
  },

  {
    // A gap's clues and the set-wide clues opened (T120): one
    // "mm:ss · author · text" line each, as plain text.
    id: 'mix-clues-open',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await openGrid(page);
      await page
        .getByText(/^Tracklist from the /)
        .first()
        .click();
      const gap = page.getByText(/clues? around here$/).first();
      await gap.scrollIntoViewIfNeeded();
      await gap.click();
      await settleRows(page);
    },
  },
  {
    // The Sort select on Clips heard (round 004): most heard first.
    id: 'mix-sort-clips',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await openGrid(page);
      await page.getByLabel('Sort').selectOption('clips');
    },
  },
  {
    // Create playlist on Validated only, the default once a track is
    // validated (T119, D6): the unvalidated candidate is left out.
    id: 'mix-create-validated',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: (page) => createCard(page),
  },
  {
    // The same mix on All tracks: every track, the candidate included.
    id: 'mix-create-all',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await createCard(page);
      await page.getByRole('tab', { name: /^All tracks/ }).click();
      await settleRows(page, 'Create playlist');
    },
  },
  {
    // Validated only with nothing validated: the button rests, and why.
    id: 'mix-create-none',
    hash: `#/mix/${enc(HARBOUR)}`,
    setup: async (page) => {
      await createCard(page);
      await page.getByRole('tab', { name: /^Validated only/ }).click();
      await settleRows(page, 'Create playlist');
    },
  },
  {
    // Matching tracks: the bar, the button busy.
    id: 'mix-create-running',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await createCard(page, [
        'createPlaylistState',
        {
          status: 'resolving',
          done: 2,
          total: 4,
        },
      ]);
    },
  },
  {
    // Done: the link, and the not-found disclosure open with dig links.
    id: 'mix-create-done',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await createCard(page, [
        'createPlaylistState',
        {
          status: 'done',
          name: 'Sunrise closing set',
          url: 'https://open.spotify.com/playlist/demoPlaylist01',
          added: 2,
          total: 4,
          unmatched: UNMATCHED,
        },
      ]);
      const notFound = page.getByText(/^2 not found/);
      await notFound.click();
      await notFound.scrollIntoViewIfNeeded();
      await settleRows(page);
    },
  },
  {
    // An add batch failed: the error inline, the playlist's link, the count.
    id: 'mix-create-error',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await createCard(page, [
        'createPlaylistState',
        {
          status: 'error',
          message: 'Spotify error 502: Bad gateway',
          url: 'https://open.spotify.com/playlist/demoPlaylist01',
          added: 0,
          total: 4,
        },
      ]);
    },
  },
  {
    // Spotify's quota met inside the run (S08d): remembered app-wide and
    // said once, inline; the button rests until the lock lapses.
    id: 'mix-create-quota',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await createCard(
        page,
        ['spotifyQuotaLock', DEMO_NOW + 3 * 3_600_000],
        [
          'createPlaylistState',
          {
            status: 'error',
            message:
              'Spotify quota reached. Try again after 6 Nov 2026, 16:00.',
          },
        ]
      );
    },
  },
  {
    // The playlist scope missing: Connect again, inline.
    id: 'mix-create-scope',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await createCard(page, ['createPlaylistState', { status: 'needScope' }]);
    },
  },
  {
    // The create card with the Mixes pane beside it, at 1,600 px.
    id: 'mix-create-1600',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await at1600(page);
      await createCard(page);
    },
  },
  {
    // Inside the one quota lock-out (S08d): the button rests with its line.
    id: 'mix-create-locked',
    hash: `#/mix/${enc(SUNRISE)}`,
    setup: async (page) => {
      await createCard(page, ['spotifyQuotaLock', DEMO_NOW + 3 * 3_600_000]);
    },
  },

  // Settings and Import (US5): every job state and failure the sections show
  { id: 'settings', hash: '#/settings' },
  { id: 'settings-empty', variant: 'empty', hash: '#/settings' },
  { id: 'settings-locked', variant: 'locked', hash: '#/settings' },
  {
    // A quota lock-out another reader met (S08d): Sync now rests, with why.
    id: 'settings-quota',
    hash: '#/settings',
    setup: (page) =>
      setState(page, 'spotifyQuotaLock', DEMO_NOW + 3 * 3_600_000),
  },
  {
    // Sync, lookup, Rekordbox and reach running, the server sending.
    id: 'settings-running',
    hash: '#/settings',
    setup: async (page) => {
      await setState(page, 'syncState', {
        status: 'running',
        done: 14,
        total: 40,
        current: 'Peak Time Techno',
        pending: [],
      });
      await setState(page, 'lookupState', {
        status: 'running',
        pass: 'ISRC',
        done: 320,
        total: 1180,
      });
      await setState(page, 'rekordboxState', {
        status: 'running',
        file: 'rekordbox.xml',
        index: 1,
        total: 1,
      });
      await setState(page, 'reachState', {
        status: 'running',
        step: 'listenbrainz',
        done: 412,
        total: 1204,
        paused: ['deezer'],
      });
      await setState(page, 'serverSession', SERVER_SESSION);
      await setState(page, 'serverState', {
        status: 'pushing',
        dataset: 'tracks',
        done: 1500,
        total: 4980,
      });
    },
  },
  {
    // Every job done, the server connected with its stamps table.
    id: 'settings-done',
    hash: '#/settings',
    setup: async (page) => {
      await setState(page, 'lookupState', {
        status: 'done',
        found: 1012,
        notFound: 168,
        total: 1180,
      });
      await setState(page, 'reachState', {
        status: 'done',
        summary: REACH_SUMMARY,
        run: { lookedUp: 1204, written: 2110, unresolved: 53 },
        paused: [],
      });
      await setState(page, 'serverSession', SERVER_SESSION);
      await setState(page, 'serverState', {
        status: 'connected',
        lastSyncAt: DEMO_NOW - 3_600_000,
        usedBytes: 12.5 * 1024 * 1024,
        rejected: 3,
        stamps: [
          {
            name: 'Playlists',
            localAt: DEMO_NOW - 86_400_000,
            serverAt: DEMO_NOW - 86_400_000,
            rows: 42,
          },
          {
            name: 'History',
            localAt: DEMO_NOW - 864_000_000,
            serverAt: null,
            rows: null,
          },
          {
            name: 'Audio data',
            localAt: null,
            serverAt: DEMO_NOW - 172_800_000,
            rows: 1012,
          },
        ],
      });
    },
  },
  {
    // Every failure: sync, lookup, Rekordbox, reach (a source paused), and
    // the server signed out with an error and a link just sent.
    id: 'settings-errors',
    hash: '#/settings',
    setup: async (page) => {
      await setState(page, 'syncState', {
        status: 'error',
        message: 'Spotify did not answer (HTTP 502).',
        pending: ['Peak Time Techno'],
      });
      await setState(page, 'lookupState', {
        status: 'error',
        message: 'ReccoBeats did not answer (HTTP 503).',
      });
      await setState(page, 'rekordboxState', {
        status: 'error',
        message: 'This file is not a Rekordbox collection.',
      });
      await setState(page, 'reachState', {
        status: 'error',
        message: 'MusicBrainz did not answer (HTTP 503).',
        paused: ['wikidata'],
      });
      await setState(page, 'serverState', {
        status: 'error',
        message: 'Signed out of the server: the session expired.',
      });
      await setState(page, 'serverLinkSent', 'dj@example.com');
    },
  },
  {
    // A cancelled sync; the server offline; nothing new for either lookup.
    id: 'settings-offline',
    hash: '#/settings',
    setup: async (page) => {
      await setState(page, 'syncState', {
        status: 'cancelled',
        message: 'Sync cancelled. Nothing was changed.',
      });
      await setState(page, 'lookupState', {
        status: 'done',
        found: 0,
        notFound: 0,
        total: 0,
      });
      await setState(page, 'reachState', {
        status: 'done',
        summary: REACH_SUMMARY,
        run: { lookedUp: 0, written: 0, unresolved: 53 },
        paused: [],
      });
      await setState(page, 'serverSession', SERVER_SESSION);
      await setState(page, 'serverState', {
        status: 'offline',
        message: 'The network is unreachable.',
      });
    },
  },
  {
    id: 'settings-paused',
    hash: '#/settings',
    setup: async (page) => {
      await setState(page, 'serverSession', SERVER_SESSION);
      await setState(page, 'serverState', {
        status: 'paused',
        dashboardUrl: 'https://supabase.com/dashboard',
      });
    },
  },
  {
    // US5 scenario 2: the index scrolls to Artist reach and marks it (large).
    id: 'settings-index',
    hash: '#/settings',
    setup: async (page) => {
      const item = page
        .getByRole('navigation', { name: 'Settings sections' })
        .getByRole('button', { name: 'Artist reach' });
      if (await item.isVisible()) await item.click();
    },
    expect: async (page) => {
      const nav = page.getByRole('navigation', { name: 'Settings sections' });
      if (!(await nav.isVisible())) return [];
      const marked = await nav.locator('[aria-current="true"]').innerText();
      return marked === 'Artist reach' ? [] : [`index marks ${marked}`];
    },
  },
  {
    // A token granted before the two writes: the account section warns.
    id: 'settings-scopes',
    hash: '#/settings',
    setup: (page) =>
      setState(page, 'spotifySession', {
        accessToken: 'demo',
        refreshToken: 'demo',
        expiresAt: DEMO_NOW + 3_600_000,
        scope: 'user-top-read playlist-read-private',
      }),
  },
  { id: 'import', hash: '#/import' },
  { id: 'import-empty', variant: 'empty', hash: '#/import' },
  {
    id: 'import-running',
    hash: '#/import',
    setup: (page) =>
      setState(page, 'importState', {
        status: 'running',
        file: 'Streaming_History_Audio_2021-2023_2.json',
        index: 3,
        total: 6,
      }),
  },
  {
    id: 'import-error',
    hash: '#/import',
    setup: (page) =>
      setState(page, 'importState', {
        status: 'error',
        message: 'This zip holds no streaming history.',
      }),
  },
  {
    // A dropped file of another type is refused at the drop area.
    id: 'import-refused',
    hash: '#/import',
    setup: async (page) => {
      const data = await page.evaluateHandle(() => {
        const dt = new DataTransfer();
        dt.items.add(new File(['x'], 'notes.txt', { type: 'text/plain' }));
        return dt;
      });
      await page
        .getByText(/^(Drop|Choose) my_spotify_data\.zip/)
        .dispatchEvent('drop', { dataTransfer: data });
    },
  },
  {
    id: 'import-cancelled',
    hash: '#/import',
    setup: (page) =>
      setState(page, 'importState', {
        status: 'cancelled',
        message: 'Import cancelled. Your existing history was kept.',
      }),
  },

  // Track details (US3): the side sheet over Top, Playlist, Artist, Crate
  {
    id: 'top-details',
    hash: '#/top',
    setup: firstRow,
    since: 'US3',
  },
  {
    // SC-001 with the sheet docked beside the 500-track playlist.
    id: 'playlist-big-details',
    hash: (ids) => `#/playlist/${enc(ids.bigPlaylist ?? '')}?d=0`,
    expect: fifteenRows,
    since: 'US3',
  },
  {
    id: 'playlist-details',
    hash: (ids) => `#/playlist/${enc(ids.playlist ?? '')}`,
    setup: firstRow,
    since: 'US3',
  },
  {
    id: 'artist-details',
    hash: (ids) => `#/artist/${enc(ids.artist ?? '')}`,
    setup: firstRow,
    since: 'US3',
  },
  {
    id: 'crate-rotation-details',
    hash: '#/crate/rotation',
    setup: firstRow,
    since: 'US3',
  },
  {
    // The details History (T075): plays per month over the whole history,
    // the mini year × month grid on large windows, the peak month's link.
    id: 'details-history',
    hash: '#/crate/rotation',
    setup: async (page) => {
      await firstRow(page);
      await page.evaluate(() => {
        const body = document.querySelector('.side-sheet-body');
        if (body) body.scrollTop = body.scrollHeight;
      });
    },
    since: 'US3',
  },
  {
    // A history imported before month buckets (summary version 1): the
    // sheet as the demo's real state shows it, without the Crate's months.
    id: 'top-details-old-import',
    variant: 'old-import',
    hash: '#/top',
    setup: firstRow,
    since: 'US3',
  },
  {
    // US3 scenario 4: opened at 1440, the window shrinks to a phone, and
    // the playlist and its track details are still open.
    id: 'details-resize',
    hash: (ids) => `#/playlist/${enc(ids.playlist ?? '')}?d=0`,
    setup: async (page) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(150);
    },
    expect: async (page) =>
      (await page.getByRole('dialog').count()) === 1
        ? []
        : ['the details sheet closed on the resize'],
    since: 'US3',
  },

  // List–detail (US3, FR-020): Playlists and Artists with one item open.
  {
    id: 'playlists-split',
    hash: (ids) => `#/playlist/${enc(ids.playlist ?? '')}`,
    expect: async (page) => {
      const size = page.viewportSize();
      if (!size || size.width < 840) return [];
      return (await page.getByRole('list', { name: 'Playlists' }).count())
        ? []
        : ['no playlist list beside the playlist'];
    },
    since: 'US3',
  },
  {
    id: 'artists-split',
    hash: (ids) => `#/artist/${enc(ids.artist ?? '')}`,
    expect: async (page) => {
      const size = page.viewportSize();
      if (!size || size.width < 840) return [];
      return (await page
        .getByRole('list', { name: 'Artists by saved tracks' })
        .count())
        ? []
        : ['no artist list beside the artist'];
    },
    since: 'US3',
  },
  {
    id: 'artists-radar-split',
    hash: '#/artists',
    setup: async (page) => {
      await tab(page, 'Under the radar');
      await page
        .getByRole('grid')
        .first()
        .getByRole('row')
        .nth(2)
        .click({ position: { x: 200, y: 20 } });
    },
    since: 'US3',
  },
  // An expanded window near its narrow end (SC-003): the 1024 project
  // shrinks to 900 px; the other widths repeat their own split pages.
  {
    id: 'playlists-split-900',
    hash: (ids) => `#/playlist/${enc(ids.playlist ?? '')}`,
    setup: at900,
    since: 'US3',
  },
  {
    // Match folds the pane below large (ruling R1).
    id: 'playlist-match-900',
    hash: (ids) => `#/playlist/${enc(ids.playlist ?? '')}`,
    setup: async (page) => {
      await at900(page);
      await tab(page, 'Match');
      await firstRow(page);
    },
    since: 'US3',
  },
  {
    id: 'artists-split-900',
    hash: (ids) => `#/artist/${enc(ids.artist ?? '')}`,
    setup: at900,
    since: 'US3',
  },

  // The chart blocks (S05) on a dev-only page, until S06 places them
  {
    id: 'charts',
    hash: '#/dev/charts',
    setup: async (page) => {
      // A click on the first bar of the 2026 chart: the tooltip must name
      // the clicked month, not jump to the last one when focus arrives. Its
      // text is kept, because the grid below takes the focus next.
      const chart = page.getByRole('img', { name: /^Plays per month/ }).nth(1);
      const box = await chart.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 24, box.y + box.height / 2);
      }
      await page.evaluate(() => {
        const tip = document.querySelector('.chart-tip')?.textContent ?? '';
        document.body.dataset.shotTip = tip;
      });
      // Nov 2026, the busiest (heat 4) cell: selected, then focused from
      // the keyboard, so the selection ring and the focus ring both show.
      await page.getByRole('button', { name: /^Nov 2026,/ }).click();
      await page.keyboard.press('Shift+Tab');
      // The pointer stays on the cell: its hover layer is checked too.
      await page.keyboard.press('Tab');
    },
    expect: async (page) => {
      const tip = await page.evaluate(() => document.body.dataset.shotTip);
      return tip?.startsWith('Jan 2026')
        ? []
        : [`a click on Jan 2026 shows "${tip || 'no tooltip'}"`];
    },
  },

  {
    // Winter selected and Jan 2026 focused from the keyboard: January's
    // selection ring and focus ring show whole beside the year column.
    id: 'charts-winter',
    hash: '#/dev/charts',
    setup: winterJanuary,
  },
  {
    // The same, with the grid scrolled to its right end (a phone): the
    // sticky year column and header corners cover what scrolled under them.
    id: 'charts-scrolled',
    hash: '#/dev/charts',
    setup: async (page) => {
      await winterJanuary(page);
      await page.evaluate(() => {
        const box = document.querySelector('.ym-scroll');
        if (box) box.scrollLeft = box.scrollWidth;
      });
    },
  },

  // Find and filter (US7): the search view and the track filters
  {
    // Every group: tracks (Shadow…), artists (… Harbor), playlists and the
    // Harbour mix; the demo holds no "kia", which is the no-match page.
    id: 'search-open',
    hash: '#/top',
    setup: (page) => search(page, 'ha'),
    expect: searchGroups(['Tracks', 'Artists', 'Playlists', 'Mixes']),
  },
  {
    id: 'search-kia',
    hash: '#/top',
    setup: (page) => search(page, 'kia'),
    expect: async (page) =>
      (await page.getByText("Nothing matches 'kia'").count())
        ? []
        : ['no "Nothing matches" line'],
  },
  {
    id: 'search-show-all',
    hash: '#/top',
    setup: async (page) => {
      await search(page, 'ha');
      await page
        .getByRole('option', { name: /^Show all/ })
        .first()
        .click();
    },
  },
  {
    // Opened by Ctrl+K over Settings: the empty query lists what was opened.
    id: 'search-recent',
    hash: '#/settings',
    setup: async (page) => {
      await search(page, 'ha');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+k');
      await page.getByRole('combobox').waitFor();
    },
    expect: searchGroups(['Recent']),
  },
  {
    // A track chosen over a screen without a list: its sheet over Settings.
    id: 'search-track-over-settings',
    hash: '#/settings',
    setup: async (page) => {
      await search(page, 'shadow');
      await page.keyboard.press('Enter');
      await page
        .getByRole('heading', { level: 2, name: /Shadow/ })
        .first()
        .waitFor();
    },
  },
  {
    id: 'search-artist-chosen',
    hash: '#/top',
    setup: async (page) => {
      await search(page, 'harbor');
      await page
        .getByRole('group', { name: 'Artists' })
        .getByRole('option')
        .first()
        .click();
      await page.waitForTimeout(150);
    },
    expect: async (page) =>
      page.url().includes('#/artist/') ? [] : [`went to ${page.url()}`],
  },
  {
    // US7's independent test: 124–128 BPM, compatible with 8A.
    id: 'playlist-filter',
    hash: (ids) => `#/playlist/${enc(ids.bigPlaylist ?? '')}`,
    setup: async (page) => {
      await bpmRange(page, '124', '128');
      await pickKey(page, '8A', true);
    },
    expect: showing,
  },
  {
    id: 'key-picker',
    hash: (ids) => `#/playlist/${enc(ids.playlist ?? '')}`,
    setup: async (page) => {
      await pickKey(page, '8A', true);
      await page.getByRole('button', { name: /^Key:/ }).click();
    },
  },
  {
    id: 'filter-error',
    hash: '#/top',
    setup: (page) => bpmRange(page, '130', '120'),
    expect: async (page) =>
      (await page
        .getByRole('alert')
        .getByText(/Min is above max/)
        .count())
        ? []
        : ['no BPM error'],
  },
  {
    id: 'filter-none',
    hash: '#/top',
    setup: async (page) => {
      await page
        .getByRole('searchbox', { name: 'Filter by title or artist' })
        .fill('zzzz');
    },
    expect: async (page) =>
      (await page.getByText('No tracks match these filters.').count())
        ? []
        : ['no empty state for a filter that hides every row'],
  },
  {
    id: 'top-filter',
    hash: '#/top',
    setup: (page) => bpmRange(page, '120', '126'),
    expect: showing,
  },
  {
    id: 'artist-filter',
    hash: (ids) => `#/artist/${enc(ids.artist ?? '')}`,
    setup: (page) =>
      page
        .getByRole('searchbox', { name: 'Filter by title or artist' })
        .fill('a'),
    expect: showing,
  },
  {
    id: 'crate-rotation-filter',
    hash: '#/crate/rotation',
    setup: (page) => pickKey(page, '8A', true),
    expect: showing,
  },
  {
    id: 'crate-gems-filter',
    hash: '#/crate/gems',
    setup: (page) => bpmRange(page, '120', '130'),
    expect: showing,
  },
  {
    id: 'crate-classics-filter',
    hash: '#/crate/classics',
    setup: (page) => bpmRange(page, '120', '130'),
    expect: showing,
  },
  {
    id: 'crate-year-filter',
    hash: '#/crate/year',
    setup: (page) => bpmRange(page, '120', '130'),
    expect: showing,
  },
  {
    id: 'crate-finish-filter',
    hash: '#/crate/finish',
    setup: (page) => bpmRange(page, '120', '130'),
    expect: showing,
  },
  {
    // S04 parked fix 2: a sort chosen on a large window, then a phone.
    id: 'sort-kept-compact',
    hash: '#/top',
    setup: async (page) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole('button', { name: 'BPM', exact: true }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(150);
    },
    expect: async (page) =>
      (await page.getByText(/^Sorted by BPM/).count())
        ? []
        : ['the sort in force is not shown on the phone'],
  },
  {
    // S04 parked fix 1: at 1,100 px the table beside the pane keeps headers.
    id: 'playlist-split-1100',
    hash: (ids) => `#/playlist/${enc(ids.playlist ?? '')}`,
    setup: async (page) => {
      if (page.viewportSize()?.width !== 1440) return;
      await page.setViewportSize({ width: 1100, height: 900 });
      await page.waitForTimeout(250);
    },
    expect: async (page) =>
      page.viewportSize()?.width !== 1100 ||
      (await page.getByRole('columnheader', { name: 'BPM' }).isVisible())
        ? []
        : ['no column headers beside the pane at 1,100 px'],
  },

  // Screens of later stories
  { id: 'overview', hash: '#/', since: 'US8' },
  { id: 'overview-empty', variant: 'empty', hash: '#/', since: 'US8' },
];
