/**
 * Every page and state the visual loop opens (spec 003, research D19),
 * following contracts/screens.md. A page marked `since` belongs to a story
 * not built yet; the runner skips it until that story is in `READY`.
 *
 * Selectors are by role and visible text, never by class, so the list
 * survives the redesign of the markup.
 */
import type { Page } from '@playwright/test';
import type { DemoIds, DemoVariant } from '../../src/dev/flag';

export type Story =
  'US1' | 'US2' | 'US3' | 'US4' | 'US5' | 'US6' | 'US7' | 'US8';

/** The stories whose screens exist; extended as each phase lands. */
export const READY: readonly Story[] = [];

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

async function tab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name, exact: true }).first().click();
}

async function setState(page: Page, name: string, value: unknown) {
  await page.evaluate(([n, v]) => window.__demo?.set(n as string, v), [
    name,
    value,
  ] as const);
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
  { id: 'crate-finish', hash: '#/crate/finish' },

  // Library: Playlists
  { id: 'playlists', hash: '#/playlists' },
  { id: 'playlists-empty', variant: 'empty', hash: '#/playlists' },
  {
    id: 'playlist-big',
    hash: (ids) => `#/playlist/${enc(ids.bigPlaylist ?? '')}`,
  },
  {
    id: 'playlist-order',
    hash: (ids) => `#/playlist/${enc(ids.playlist ?? '')}`,
    setup: (page) => tab(page, 'Playlist order'),
  },
  {
    id: 'playlist-match',
    hash: (ids) => `#/playlist/${enc(ids.playlist ?? '')}`,
    setup: async (page) => {
      await tab(page, 'Match');
      // In Match mode every row is a button; the first one becomes the seed.
      await page.locator('main li button').first().click();
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
    id: 'artists-radar-no-reach',
    variant: 'no-reach',
    hash: '#/artists',
    setup: (page) => tab(page, 'Under the radar'),
  },
  { id: 'artist', hash: (ids) => `#/artist/${enc(ids.artist ?? '')}` },

  // Mix
  { id: 'mix', hash: '#/mix' },
  {
    id: 'mix-open',
    hash: '#/mix',
    setup: (page) =>
      page.getByText('Peak time set at the Harbour', { exact: true }).click(),
  },

  // Settings and Import
  { id: 'settings', hash: '#/settings' },
  { id: 'settings-empty', variant: 'empty', hash: '#/settings' },
  { id: 'settings-locked', variant: 'locked', hash: '#/settings' },
  {
    id: 'settings-running',
    hash: '#/settings',
    setup: (page) =>
      setState(page, 'syncState', {
        status: 'running',
        done: 14,
        total: 40,
        current: 'Peak Time Techno',
        pending: [],
      }),
  },
  { id: 'import', hash: '#/import' },

  // Screens of later stories
  { id: 'overview', hash: '#/', since: 'US8' },
  { id: 'overview-empty', variant: 'empty', hash: '#/', since: 'US8' },
];
