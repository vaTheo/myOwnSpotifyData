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

/** A worker tracklist from rounds 003–004, for the Mix pages (T120). */
const ROUND_004_ROWS = [
  {
    startSec: 0,
    endSec: 12,
    artist: 'Darian Falk',
    title: 'Dawn Paper',
    label: null,
    source: 'tracklistify',
    gap: false,
    detected: { artist: 'Darian Falk', title: 'Dawn Paper' },
    referenceCount: null,
    confidence: 91,
    hits: 4,
  },
  {
    startSec: 300,
    endSec: 312,
    artist: 'Amaru Prism',
    title: 'Moon Mirror',
    label: null,
    source: 'tracklistify',
    gap: false,
    detected: { artist: 'Amaru Prism', title: 'Moon Mirror' },
    referenceCount: null,
    confidence: 64,
    hits: 1,
    origin: 'replay',
    speedPercent: 4,
  },
  {
    startSec: 600,
    endSec: 900,
    artist: '',
    title: '',
    label: null,
    source: 'tracklistify',
    gap: true,
    detected: { artist: '', title: '' },
    referenceCount: null,
    clues: [
      {
        atSec: 640,
        author: 'night_owl',
        text: 'ID? sounds like Moreau Unit https://example.com/x',
        kind: 'comment',
      },
      { atSec: 700, author: '', text: 'Chapter 3', kind: 'chapter' },
    ],
  },
  {
    startSec: 905,
    endSec: null,
    artist: 'Moreau Unit',
    title: 'Silk Tide',
    label: null,
    source: 'tracklistify',
    gap: false,
    detected: { artist: 'Moreau Unit', title: 'Silk Tide' },
    referenceCount: null,
    confidence: null,
    origin: 'clue',
    clue: {
      atSec: 640,
      author: 'night_owl',
      text: 'ID? sounds like Moreau Unit',
      kind: 'comment',
    },
  },
];

async function tab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name, exact: true }).first().click();
}

async function setState(page: Page, name: string, value: unknown) {
  await page.evaluate(([n, v]) => window.__demo?.set(n as string, v), [
    name,
    value,
  ] as const);
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
    // Rounds 003–004 rows (T120): clip counts, second listen, a candidate
    // "not heard" with its clue, a gap with clues; the Sort select shows.
    id: 'mix-round004',
    hash: `#/mix/${enc('https://www.youtube.com/watch?v=demoSet0001')}`,
    setup: async (page) => {
      await page.getByRole('grid', { name: 'Tracklist' }).waitFor();
      await setState(page, 'mixRows', ROUND_004_ROWS);
    },
  },

  // Settings and Import (US5): every job state and failure the sections show
  { id: 'settings', hash: '#/settings' },
  { id: 'settings-empty', variant: 'empty', hash: '#/settings' },
  { id: 'settings-locked', variant: 'locked', hash: '#/settings' },
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

  // Screens of later stories
  { id: 'overview', hash: '#/', since: 'US8' },
  { id: 'overview-empty', variant: 'empty', hash: '#/', since: 'US8' },
];
