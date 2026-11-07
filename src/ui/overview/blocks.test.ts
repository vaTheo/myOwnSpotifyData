import { describe, expect, it } from 'vitest';
import type { MixRow } from '../../db/schema';
import { DEMO_NOW, buildDemo } from '../../dev/demo';
import { mixListItems } from '../../features/mix/mixList';
import {
  ARTIST_REACH_SUMMARY_META,
  type ArtistReachSummary,
} from '../../features/reachRun';
import {
  REKORDBOX_SUMMARY_META,
  type RekordboxSummary,
} from '../../features/rekordboxImport';
import {
  HISTORY_SUMMARY_META,
  type ImportSummary,
} from '../../history/importer';
import { buildModel, topTracks } from '../../model/aggregate';
import { coverage } from '../../model/coverage';
import { heavyRotation } from '../../model/crate';
import { reachCoverage } from '../../model/reach';
import { routeHref } from '../../router';
import { quotaRefusal } from '../../spotify/quotaLock';
import { LAST_SYNC_META } from '../../sync/runner';
import { playLabel } from '../crate/labels';
import {
  artistNames,
  formatDate,
  formatDateTime,
  formatListening,
  historyLine,
} from '../format';
import { coverageLine, reachCoverageLine } from '../settings/lines';
import {
  overviewBlocks,
  type OverviewBlock,
  type OverviewInput,
} from './blocks';

const now = new Date(DEMO_NOW);
const full = buildDemo('full', 1);
const fullModel = buildModel(full.rows);
const summary = full.metas[HISTORY_SUMMARY_META] as ImportSummary;
const reachSummary = full.metas[
  ARTIST_REACH_SUMMARY_META
] as ArtistReachSummary;
const rekordbox = full.metas[REKORDBOX_SUMMARY_META] as RekordboxSummary;
const mixes = [...full.mixes].sort((a, b) => b.savedAt - a.savedAt);

function input(over: Partial<OverviewInput> = {}): OverviewInput {
  return {
    model: fullModel,
    historySummary: summary,
    crateStatus: 'ready',
    rotationMonths: 3,
    syncState: { status: 'idle' },
    lastSyncAt: full.metas[LAST_SYNC_META] as number,
    quotaLockUntil: null,
    rekordboxSummary: rekordbox,
    artistReachSummary: reachSummary,
    serverState: { status: 'unset' },
    serverLastSyncAt: null,
    mixes,
    mixJobs: {},
    mixError: null,
    now,
    ...over,
  };
}

function block(blocks: OverviewBlock[], id: OverviewBlock['id']) {
  const found = blocks.find((b) => b.id === id);
  if (!found) throw new Error(`no ${id} block`);
  return found;
}

function figure(b: OverviewBlock, label: string): string | null {
  const found = b.figures.find((f) => f.label === label);
  if (!found) throw new Error(`no ${label} figure on ${b.id}`);
  return found.value;
}

describe('overviewBlocks (spec 003, US8, SC-009)', () => {
  it('returns the seven blocks in the screen order', () => {
    expect(overviewBlocks(input()).map((b) => b.id)).toEqual([
      'listening',
      'rotation',
      'top',
      'library',
      'coverage',
      'mix',
      'server',
    ]);
  });

  it('every block links to its screen', () => {
    const blocks = overviewBlocks(input());
    expect(block(blocks, 'listening').link).toBe(routeHref({ name: 'crate' }));
    expect(block(blocks, 'rotation').link).toBe(
      routeHref({ name: 'crateView', view: 'rotation' })
    );
    expect(block(blocks, 'top').link).toBe(routeHref({ name: 'top' }));
    expect(block(blocks, 'library').link).toBe(
      routeHref({ name: 'playlists' })
    );
    expect(block(blocks, 'coverage').link).toBe(
      routeHref({ name: 'settings' })
    );
    expect(block(blocks, 'mix').link).toBe(
      routeHref({ name: 'mix', key: mixes[0].url })
    );
  });

  describe('listening', () => {
    it('repeats the Settings history line and its figures', () => {
      const b = block(overviewBlocks(input()), 'listening');
      expect(b.state).toBe('ready');
      expect(b.caption).toBe(historyLine(summary));
      expect(figure(b, 'Plays')).toBe(summary.plays.toLocaleString());
      expect(figure(b, 'Imported')).toBe(formatDate(summary.importedAt));
    });

    it('sums the listening time of every play row', () => {
      const b = block(overviewBlocks(input()), 'listening');
      const ms = fullModel.plays.reduce((s, p) => s + p.msPlayed, 0);
      expect(ms).toBeGreaterThan(0);
      expect(figure(b, 'Listening time')).toBe(formatListening(ms));
    });

    it('warns when the history is stale', () => {
      const later = new Date(DEMO_NOW + 120 * 86_400_000);
      const b = block(overviewBlocks(input({ now: later })), 'listening');
      expect(b.warning).toMatch(/^History ends /);
      expect(b.action?.href).toBe(routeHref({ name: 'import' }));
    });

    it('is empty with no history, and offers the import', () => {
      const b = block(
        overviewBlocks(input({ historySummary: null, crateStatus: 'empty' })),
        'listening'
      );
      expect(b.state).toBe('empty');
      expect(b.reason).toBe('No listening history yet.');
      expect(b.action).toEqual({
        label: 'Import history',
        href: routeHref({ name: 'import' }),
      });
      expect(b.figures).toEqual([]);
    });
  });

  describe('rotation', () => {
    it('lists the top five of heavyRotation at the current setting', () => {
      for (const months of [1, 3, 6]) {
        const b = block(
          overviewBlocks(input({ rotationMonths: months })),
          'rotation'
        );
        const want = heavyRotation(fullModel.plays, now, months);
        expect(b.state).toBe('ready');
        expect(figure(b, 'Tracks')).toBe(want.length.toLocaleString());
        expect(b.items?.map((i) => i.trackId)).toEqual(
          want.slice(0, 5).map((r) => r.row.trackId)
        );
        expect(b.items?.[0]?.title).toBe(
          playLabel(fullModel, want[0].row).title
        );
        expect(b.items?.[0]?.series).toHaveLength(months);
      }
    });

    it('follows the Crate gate: no history is empty', () => {
      const b = block(
        overviewBlocks(input({ historySummary: null, crateStatus: 'empty' })),
        'rotation'
      );
      expect(b.state).toBe('empty');
      expect(b.action?.href).toBe(routeHref({ name: 'import' }));
      expect(b.items).toBeUndefined();
    });

    it('follows the Crate gate: an import before version 2 is gated', () => {
      const old = { ...summary };
      delete old.version;
      const b = block(
        overviewBlocks(input({ historySummary: old, crateStatus: 'reimport' })),
        'rotation'
      );
      expect(b.state).toBe('gated');
      expect(b.reason).toMatch(/needs importing again/);
      expect(b.action?.href).toBe(routeHref({ name: 'import' }));
      expect(b.items).toBeUndefined();
    });
  });

  describe('top', () => {
    it("lists the 4-week top five, as the Top screen's list", () => {
      const b = block(overviewBlocks(input()), 'top');
      const want = topTracks(fullModel, 'short_term').slice(0, 5);
      expect(b.state).toBe('ready');
      expect(b.items?.map((i) => i.trackId)).toEqual(
        want.map((r) => r.item.id)
      );
      expect(b.items?.[0]?.subtitle).toBe(artistNames(want[0].item.artists));
      expect(b.items?.[0]?.href).toBe(
        routeHref({ name: 'top', detail: want[0].item.id })
      );
    });

    it('is empty with no top lists, and points to Sync', () => {
      const b = block(overviewBlocks(input({ model: null })), 'top');
      expect(b.state).toBe('empty');
      expect(b.reason).toBe('No top lists yet.');
      expect(b.action?.href).toBe(routeHref({ name: 'settings' }));
    });
  });

  describe('library', () => {
    it('counts playlists and tracks, and the last sync', () => {
      const b = block(overviewBlocks(input()), 'library');
      expect(figure(b, 'Playlists')).toBe(
        fullModel.playlists.length.toLocaleString()
      );
      expect(figure(b, 'Tracks')).toBe(
        fullModel.tracksByKey.size.toLocaleString()
      );
      expect(figure(b, 'Last sync')).toBe(
        formatDateTime(full.metas[LAST_SYNC_META] as number)
      );
      expect(b.warning).toBeUndefined();
    });

    it('carries the quota-lock warning, worded as Settings words it', () => {
      const until = DEMO_NOW + 3_600_000;
      const b = block(
        overviewBlocks(input({ quotaLockUntil: until })),
        'library'
      );
      expect(b.warning).toBe(
        quotaRefusal('sync', until, DEMO_NOW, formatDateTime)
      );
    });

    it("says the sync's own line once when it names the same end", () => {
      const until = DEMO_NOW + 3_600_000;
      const b = block(
        overviewBlocks(
          input({
            quotaLockUntil: until,
            syncState: {
              status: 'locked',
              retryAt: until,
              pending: ['a', 'b', 'c'],
              done: 37,
              total: 40,
            },
          })
        ),
        'library'
      );
      expect(b.warning).toBe(
        `Spotify quota reached with 3 playlists pending. Retry after ${formatDateTime(until)}.`
      );
    });

    it('drops a lapsed lock', () => {
      const b = block(
        overviewBlocks(input({ quotaLockUntil: DEMO_NOW - 1 })),
        'library'
      );
      expect(b.warning).toBeUndefined();
    });

    it('names the pending playlists of a sync the quota stopped', () => {
      const b = block(
        overviewBlocks(
          input({
            syncState: {
              status: 'locked',
              retryAt: DEMO_NOW - 1,
              pending: ['a', 'b'],
              done: 3,
              total: 5,
            },
          })
        ),
        'library'
      );
      expect(b.warning).toBe(
        'Spotify quota reached with 2 playlists pending. You can retry now.'
      );
    });

    it('is empty with no playlists', () => {
      const b = block(overviewBlocks(input({ model: null })), 'library');
      expect(b.state).toBe('empty');
      expect(b.reason).toBe('No playlists yet.');
      expect(b.action?.href).toBe(routeHref({ name: 'settings' }));
    });
  });

  describe('coverage', () => {
    it('shows the Settings shares of coverage and reachCoverage', () => {
      const b = block(overviewBlocks(input()), 'coverage');
      const audio = figure(b, 'Audio data') ?? '';
      const reach = figure(b, 'Artist reach') ?? '';
      expect(b.state).toBe('ready');
      expect(coverageLine(coverage(fullModel))).toContain(
        `BPM and key for ${audio}`
      );
      expect(reachCoverageLine(reachCoverage(fullModel))).toContain(
        `Reach data for ${reach}`
      );
      expect(figure(b, 'Reach as of')).toBe(formatDate(reachSummary.ranAt));
      expect(figure(b, 'Rekordbox imported')).toBe(
        formatDate(rekordbox.importedAt)
      );
    });

    it('follows the Under the radar gate on the summary version', () => {
      const b = block(
        overviewBlocks(input({ artistReachSummary: null })),
        'coverage'
      );
      expect(b.state).toBe('gated');
      expect(b.action?.href).toBe(routeHref({ name: 'settings' }));
      // The share still reads, 0 of N rather than nothing.
      expect(figure(b, 'Artist reach')).toMatch(/ of /);
      expect(figure(b, 'Reach as of')).toBeNull();
    });

    it('is empty with nothing synced or imported', () => {
      const b = block(overviewBlocks(input({ model: null })), 'coverage');
      expect(b.state).toBe('empty');
    });
  });

  describe('mix', () => {
    it("names the newest saved mix with the Mixes list's chip", () => {
      const b = block(overviewBlocks(input()), 'mix');
      const item = mixListItems({}, mixes, { status: 'unset' }, DEMO_NOW).find(
        (i) => i.key === mixes[0].url
      );
      expect(b.state).toBe('ready');
      expect(b.chip).toEqual(item?.chip);
      expect(b.items?.[0]?.title).toBe(item?.title);
      expect(figure(b, 'Saved')).toBe(formatDate(mixes[0].savedAt));
    });

    it('says Playlist made once a playlist exists', () => {
      const made: MixRow = { ...mixes[0], playlistUrl: 'https://x/p' };
      const b = block(
        overviewBlocks(input({ mixes: [made, ...mixes.slice(1)] })),
        'mix'
      );
      expect(b.chip?.text).toBe('Playlist made');
    });

    it('is empty with no saved mix, and opens Mix', () => {
      const b = block(overviewBlocks(input({ mixes: [] })), 'mix');
      expect(b.state).toBe('empty');
      expect(b.reason).toBe('No saved mixes yet.');
      expect(b.action?.href).toBe(routeHref({ name: 'mix' }));
      expect(b.link).toBe(routeHref({ name: 'mix' }));
    });

    it('says it is reading before the mixes arrive', () => {
      const b = block(overviewBlocks(input({ mixes: null })), 'mix');
      expect(b.state).toBe('empty');
      expect(b.reason).toBe('Reading your saved mixes…');
      expect(b.action).toBeUndefined();
    });

    it('shows a read failure', () => {
      const b = block(
        overviewBlocks(input({ mixes: [], mixError: 'Could not read' })),
        'mix'
      );
      expect(b.error).toBe('Could not read');
      expect(b.reason).toBeUndefined();
    });
  });

  describe('server', () => {
    it('is hidden when no server is configured', () => {
      const b = block(overviewBlocks(input()), 'server');
      expect(b.state).toBe('hidden');
    });

    it('shows the last sync when connected', () => {
      const at = DEMO_NOW - 60_000;
      const b = block(
        overviewBlocks(
          input({
            serverState: {
              status: 'connected',
              lastSyncAt: at,
              usedBytes: null,
              stamps: [],
              rejected: 0,
            },
          })
        ),
        'server'
      );
      expect(b.state).toBe('ready');
      expect(figure(b, 'Last sync')).toBe(formatDateTime(at));
    });

    it('warns when offline, and asks to sign in when signed out', () => {
      const offline = block(
        overviewBlocks(
          input({ serverState: { status: 'offline', message: 'No answer.' } })
        ),
        'server'
      );
      expect(offline.warning).toMatch(/^Server offline: No answer\./);
      const out = block(
        overviewBlocks(input({ serverState: { status: 'signedOut' } })),
        'server'
      );
      expect(out.state).toBe('empty');
      expect(out.action?.href).toBe(routeHref({ name: 'settings' }));
    });

    it('shows a server error', () => {
      const b = block(
        overviewBlocks(
          input({ serverState: { status: 'error', message: 'Refused.' } })
        ),
        'server'
      );
      expect(b.error).toBe('Refused.');
    });
  });
});
