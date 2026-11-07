/**
 * The Overview's blocks (spec 003, US8, FR-050, data-model §8). Pure: every
 * figure is computed by the function its own screen uses (`heavyRotation`,
 * `topTracks`, `coverage`, `reachCoverage`, `historyLine`, `mixListItems`),
 * so the two never differ (SC-009), and nothing here reads Spotify or the
 * database: the caller hands in what the signals already hold.
 */
import type { MixJobs, MixRow } from '../../db/schema';
import { mixListItems, type MixChipKind } from '../../features/mix/mixList';
import type { ArtistReachSummary } from '../../features/reachRun';
import type { RekordboxSummary } from '../../features/rekordboxImport';
import type { ImportSummary } from '../../history/importer';
import { topTracks, type Model } from '../../model/aggregate';
import { coverage } from '../../model/coverage';
import { heavyRotation, lastMonths } from '../../model/crate';
import { reachCoverage } from '../../model/reach';
// Type-only: this file never evaluates state.ts under Vitest.
import type { CrateStatus } from '../../model/state';
import { routeHref } from '../../router';
import type { ServerStatus } from '../../server/types';
import { activeLock, quotaRefusal } from '../../spotify/quotaLock';
import type { SyncState } from '../../sync/runner';
import { monthSeries, type MonthPoint } from '../charts/series';
import { playLabel, staleMonthKey, yearSpanLabel } from '../crate/labels';
import {
  artistNames,
  formatDate,
  formatDateTime,
  formatListening,
  historyLine,
  monthLabel,
  plural,
} from '../format';

export type OverviewBlockId =
  'listening' | 'rotation' | 'top' | 'library' | 'coverage' | 'mix' | 'server';

/**
 * `empty`: the data is missing; `gated`: the screen's own gate holds (the
 * Crate on `historySummary.version === 2`, Under the radar on
 * `artistReachSummary.version === 1`); `hidden`: not drawn at all.
 */
export type OverviewState = 'ready' | 'empty' | 'gated' | 'hidden';

/** A figure; `null` is a missing number, never printed as zero. */
export interface OverviewFigure {
  label: string;
  value: string | null;
}

export interface OverviewItem {
  title: string;
  subtitle: string;
  /** The Spotify track id, for the BPM and key and the details sheet. */
  trackId?: string;
  /** The item's own figure ("12 plays"), or null when unknown. */
  value?: string | null;
  /** Plays per month over the window (Heavy rotation). */
  series?: MonthPoint[];
}

export interface OverviewAction {
  label: string;
  href: string;
}

export interface OverviewBlock {
  id: OverviewBlockId;
  state: OverviewState;
  title: string;
  /** The card's link to its screen, and the link's words. */
  link: string;
  linkLabel: string;
  figures: OverviewFigure[];
  items?: OverviewItem[];
  /** A line under the figures, word for word the screen's. */
  caption?: string;
  /** Said when a ready block has nothing to list. */
  note?: string;
  /** Why an empty or gated block shows no figures. */
  reason?: string;
  /** The one action that fixes the reason or the warning. */
  action?: OverviewAction;
  warning?: string;
  error?: string;
  /** The Mixes list's status chip, for the last saved mix. */
  chip?: { kind: MixChipKind; text: string };
}

export interface OverviewInput {
  model: Model | null;
  historySummary: ImportSummary | null;
  /** The Crate's gate, as `crateStatus` computes it. */
  crateStatus: CrateStatus;
  /** Heavy rotation's current window, in months. */
  rotationMonths: number;
  syncState: SyncState;
  lastSyncAt: number | null;
  /** The shared Spotify quota lock's end (epoch ms), or null. */
  quotaLockUntil: number | null;
  rekordboxSummary: RekordboxSummary | null;
  artistReachSummary: ArtistReachSummary | null;
  serverState: ServerStatus;
  serverLastSyncAt: number | null;
  /** Saved mixes newest first; null until they are read. */
  mixes: MixRow[] | null;
  mixJobs: MixJobs;
  /** The Mix screen's read failure, or null. */
  mixError: string | null;
  now: Date;
}

const TOP_COUNT = 5;

const IMPORT: OverviewAction = {
  label: 'Import history',
  href: routeHref({ name: 'import' }),
};

const SYNC: OverviewAction = {
  label: 'Sync in Settings',
  href: routeHref({ name: 'settings' }),
};

const count = (n: number): string => n.toLocaleString();

function listening(p: OverviewInput): OverviewBlock {
  const base = {
    id: 'listening' as const,
    title: 'Listening',
    link: routeHref({ name: 'crate' }),
    linkLabel: 'Open the Crate',
  };
  const summary = p.historySummary;
  if (!summary) {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: 'No listening history yet.',
      action: IMPORT,
    };
  }
  const ms = p.model?.plays.reduce((sum, row) => sum + row.msPlayed, 0);
  const stale = staleMonthKey(summary.range, p.now);
  return {
    ...base,
    state: 'ready',
    figures: [
      { label: 'Plays', value: count(summary.plays) },
      {
        label: 'Listening time',
        value: ms === undefined ? null : formatListening(ms),
      },
      { label: 'Years', value: yearSpanLabel(summary.range) },
      { label: 'Imported', value: formatDate(summary.importedAt) },
    ],
    caption: historyLine(summary),
    ...(stale
      ? {
          warning: `History ends ${monthLabel(stale)}. Import a newer export for recent plays.`,
          action: { label: 'Import again', href: IMPORT.href },
        }
      : {}),
  };
}

function rotation(p: OverviewInput): OverviewBlock {
  const base = {
    id: 'rotation' as const,
    title: 'Heavy rotation',
    link: routeHref({ name: 'crateView', view: 'rotation' }),
    linkLabel: 'Open Heavy rotation',
  };
  if (p.crateStatus === 'empty' || !p.model) {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: 'Heavy rotation is built from your listening history.',
      action: IMPORT,
    };
  }
  if (p.crateStatus === 'reimport') {
    return {
      ...base,
      state: 'gated',
      figures: [],
      reason: 'Your history needs importing again for the month views.',
      action: IMPORT,
    };
  }
  const m = p.model;
  const items = heavyRotation(m.plays, p.now, p.rotationMonths);
  const keys = lastMonths(p.now, p.rotationMonths);
  const range = p.historySummary?.range ?? null;
  return {
    ...base,
    state: 'ready',
    figures: [
      { label: 'Tracks', value: count(items.length) },
      { label: 'Window', value: `last ${plural(p.rotationMonths, 'month')}` },
    ],
    items: items.slice(0, TOP_COUNT).map((item) => {
      const label = playLabel(m, item.row);
      return {
        title: label.title,
        subtitle: label.subtitle,
        trackId: item.row.trackId,
        value: plural(item.windowPlays, 'play'),
        series: monthSeries(item.row.months, keys, range),
      };
    }),
    ...(items.length === 0
      ? { note: `Nothing in the last ${plural(p.rotationMonths, 'month')}.` }
      : {}),
  };
}

function top(p: OverviewInput): OverviewBlock {
  const base = {
    id: 'top' as const,
    title: 'Top this month',
    link: routeHref({ name: 'top' }),
    linkLabel: 'Open Top',
  };
  const tracks = p.model ? topTracks(p.model, 'short_term') : [];
  if (tracks.length === 0) {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: 'No top lists yet.',
      action: SYNC,
    };
  }
  return {
    ...base,
    state: 'ready',
    figures: [],
    items: tracks.slice(0, TOP_COUNT).map((r) => ({
      title: r.item.name,
      subtitle: artistNames(r.item.artists),
      trackId: r.item.id,
      value: r.plays ? plural(r.plays.plays, 'play') : null,
    })),
  };
}

/** The quota lock first, worded as the Sync card words it, then pending. */
function syncWarning(p: OverviewInput): string | undefined {
  const at = p.now.getTime();
  const shared = quotaRefusal('sync', p.quotaLockUntil, at, formatDateTime);
  if (shared) return shared;
  const s = p.syncState;
  if (s.status === 'locked') {
    const retry =
      activeLock(s.retryAt, at) !== null
        ? `Retry after ${formatDateTime(s.retryAt)}.`
        : 'You can retry now.';
    return `Spotify quota reached with ${plural(s.pending.length, 'playlist')} pending. ${retry}`;
  }
  if (s.status === 'error' && s.pending.length > 0) {
    return `${plural(s.pending.length, 'playlist')} pending. Last error: ${s.message}`;
  }
  return undefined;
}

function library(p: OverviewInput): OverviewBlock {
  const warning = syncWarning(p);
  const base = {
    id: 'library' as const,
    title: 'Library',
    link: routeHref({ name: 'playlists' }),
    linkLabel: 'Open Playlists',
    ...(warning ? { warning } : {}),
  };
  const m = p.model;
  if (!m || m.playlists.length === 0) {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: 'No playlists yet.',
      action: SYNC,
    };
  }
  return {
    ...base,
    state: 'ready',
    figures: [
      { label: 'Playlists', value: count(m.playlists.length) },
      { label: 'Tracks', value: count(m.tracksByKey.size) },
      {
        label: 'Last sync',
        value: p.lastSyncAt ? formatDateTime(p.lastSyncAt) : 'never',
      },
    ],
  };
}

function coverageBlock(p: OverviewInput): OverviewBlock {
  const base = {
    id: 'coverage' as const,
    title: 'Coverage',
    link: routeHref({ name: 'settings' }),
    linkLabel: 'Open Settings',
  };
  const m = p.model;
  const audio = m ? coverage(m) : null;
  const reach = m ? reachCoverage(m) : null;
  if (!audio || !reach || (audio.total === 0 && reach.artists === 0)) {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: 'No tracks or artists to look up yet.',
      action: SYNC,
    };
  }
  const summary = p.artistReachSummary;
  const figures: OverviewFigure[] = [
    {
      label: 'Audio data',
      value: `${count(audio.covered)} of ${plural(audio.total, 'track')}`,
    },
    {
      label: 'Artist reach',
      value: `${count(reach.covered)} of ${plural(reach.artists, 'artist')}`,
    },
    {
      label: 'Rekordbox imported',
      value: p.rekordboxSummary
        ? formatDate(p.rekordboxSummary.importedAt)
        : null,
    },
    {
      label: 'Reach as of',
      value: summary?.version === 1 ? formatDate(summary.ranAt) : null,
    },
  ];
  if (summary?.version !== 1) {
    return {
      ...base,
      state: 'gated',
      figures,
      reason: 'Under the radar needs your artists looked up.',
      action: { label: 'Look up in Settings', href: base.link },
    };
  }
  return { ...base, state: 'ready', figures };
}

function mix(p: OverviewInput): OverviewBlock {
  const base = {
    id: 'mix' as const,
    title: 'Last saved mix',
    link: routeHref({ name: 'mix' }),
    linkLabel: 'Open Mix',
    ...(p.mixError ? { error: p.mixError } : {}),
  };
  if (p.mixes === null) {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: 'Reading your saved mixes…',
    };
  }
  const newest = p.mixes[0];
  if (!newest) {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: 'No saved mixes yet.',
      action: { label: 'Open Mix', href: base.link },
    };
  }
  const item = mixListItems(
    p.mixJobs,
    p.mixes,
    p.serverState,
    p.now.getTime()
  ).find((i) => i.key === newest.url);
  return {
    ...base,
    state: 'ready',
    link: routeHref({ name: 'mix', key: newest.url }),
    linkLabel: 'Open this mix',
    figures: [{ label: 'Saved', value: formatDate(newest.savedAt) }],
    items: [{ title: item?.title ?? newest.url, subtitle: '' }],
    ...(item ? { chip: item.chip } : {}),
  };
}

function server(p: OverviewInput): OverviewBlock {
  const base = {
    id: 'server' as const,
    title: 'Server',
    link: routeHref({ name: 'settings' }),
    linkLabel: 'Open Settings',
  };
  const s = p.serverState;
  if (s.status === 'unset') return { ...base, state: 'hidden', figures: [] };
  if (s.status === 'signedOut') {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: 'Signed out of your server.',
      action: { label: 'Sign in in Settings', href: base.link },
    };
  }
  const last = s.status === 'connected' ? s.lastSyncAt : p.serverLastSyncAt;
  const figures: OverviewFigure[] = [
    { label: 'Last sync', value: last ? formatDateTime(last) : 'never' },
  ];
  switch (s.status) {
    case 'pushing':
    case 'pulling':
      figures.push({
        label: 'Now',
        value:
          s.status === 'pushing' ? 'Saving to server' : 'Loading from server',
      });
      return { ...base, state: 'ready', figures };
    case 'offline':
      return {
        ...base,
        state: 'ready',
        figures,
        warning: `Server offline: ${s.message} Local data is in use.`,
      };
    case 'paused':
      return {
        ...base,
        state: 'ready',
        figures,
        warning:
          'Server paused. Resume it from the Supabase dashboard, then open the app again.',
      };
    case 'error':
      return { ...base, state: 'ready', figures, error: s.message };
    case 'connected':
      return {
        ...base,
        state: 'ready',
        figures,
        ...(s.rejected > 0
          ? {
              warning: `${plural(s.rejected, 'row')} rejected by the safety check and left out.`,
            }
          : {}),
      };
  }
}

/** The Overview's blocks in the screen's order (contracts/screens.md §3). */
export function overviewBlocks(p: OverviewInput): OverviewBlock[] {
  return [
    listening(p),
    rotation(p),
    top(p),
    library(p),
    coverageBlock(p),
    mix(p),
    server(p),
  ];
}
