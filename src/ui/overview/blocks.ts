/**
 * The Overview's blocks (spec 003, US8, FR-050, data-model §8). Pure: every
 * figure is computed by the function its own screen uses (`heavyRotation`,
 * `topTracks`, `coverage`, `reachCoverage`, `historyLine`, `mixListItems`),
 * so the two never differ (SC-009), and nothing here reads Spotify or the
 * database: the caller hands in what the signals already hold.
 */
import type { MixJobs, MixRow, PlayRow, ServerPending } from '../../db/schema';
import { mixListItems, type MixChipKind } from '../../features/mix/mixList';
import type { ArtistReachSummary } from '../../features/reachRun';
import type { RekordboxSummary } from '../../features/rekordboxImport';
import type { ImportSummary } from '../../history/importer';
import { topTracks, type Model } from '../../model/aggregate';
import { coverage } from '../../model/coverage';
import {
  heavyRotation,
  lastMonths,
  type RotationItem,
} from '../../model/crate';
import { reachCoverage } from '../../model/reach';
// Type-only: this file never evaluates state.ts under Vitest.
import type { CrateStatus } from '../../model/state';
import { routeHref } from '../../router';
import type { ServerStatus } from '../../server/types';
import { activeLock, quotaRefusal } from '../../spotify/quotaLock';
import type { SyncState } from '../../sync/runner';
import { monthSeries, type MonthPoint } from '../charts/series';
import { playLabel, staleMonthKey, yearSpanLabel } from '../crate/labels';
import { pendingValue } from '../settings/lines';
import { fmt, msg } from '../../i18n';
import {
  artistNames,
  formatDate,
  formatDateTime,
  formatListening,
  historyLine,
  monthLabel,
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
  /** The item's details over its screen (`?d=`). */
  href?: string;
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
  /** The card's link to its screen. */
  link: string;
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
  /** The datasets waiting to send to the server; null until read. */
  serverPending: ServerPending | null;
  /** Why the pending flags could not be read, or null. */
  serverPendingError: string | null;
  /** Saved mixes newest first; null until they are read. */
  mixes: MixRow[] | null;
  mixJobs: MixJobs;
  /** The Mix screen's read failure, or null. */
  mixError: string | null;
  now: Date;
}

const TOP_COUNT = 5;

/** Built when called: the label is the text of the language shown. */
const importAction = (): OverviewAction => ({
  label: msg().overview.actions.importHistory,
  href: routeHref({ name: 'import' }),
});

const syncAction = (): OverviewAction => ({
  label: msg().overview.actions.syncInSettings,
  href: routeHref({ name: 'settings' }),
});

const count = (n: number): string => fmt.int(n);

let rotationMemo: {
  plays: PlayRow[];
  key: string;
  items: RotationItem[];
} | null = null;

/**
 * `heavyRotation` memoised on the play rows, the window's months and its
 * length: the Overview re-renders on every job's progress tick, and the
 * list only changes with a new model or a new month.
 */
export function rotationOf(
  plays: PlayRow[],
  now: Date,
  months: number
): RotationItem[] {
  const key = lastMonths(now, months).join(',');
  if (rotationMemo?.plays === plays && rotationMemo.key === key) {
    return rotationMemo.items;
  }
  const items = heavyRotation(plays, now, months);
  rotationMemo = { plays, key, items };
  return items;
}

let listeningMemo: { plays: PlayRow[]; ms: number } | null = null;

/** Every play row's listening time, summed once per model. */
export function listeningMs(plays: PlayRow[]): number {
  if (listeningMemo?.plays === plays) return listeningMemo.ms;
  const ms = plays.reduce((sum, row) => sum + row.msPlayed, 0);
  listeningMemo = { plays, ms };
  return ms;
}

function listening(p: OverviewInput): OverviewBlock {
  const text = msg().overview.listening;
  const base = {
    id: 'listening' as const,
    title: text.title,
    link: routeHref({ name: 'crate' }),
  };
  const summary = p.historySummary;
  if (!summary) {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: text.noHistory,
      action: importAction(),
    };
  }
  const ms = p.model ? listeningMs(p.model.plays) : undefined;
  const stale = staleMonthKey(summary.range, p.now);
  return {
    ...base,
    state: 'ready',
    figures: [
      { label: text.plays, value: count(summary.plays) },
      {
        label: text.time,
        value: ms === undefined ? null : formatListening(ms),
      },
      { label: text.years, value: yearSpanLabel(summary.range) },
      { label: text.imported, value: formatDate(summary.importedAt) },
    ],
    // Only a version 2 summary knows its zone, as in HistorySection.
    caption: historyLine(
      summary,
      summary.version === 2 ? summary.zone : undefined
    ),
    ...(stale
      ? {
          warning: text.stale(monthLabel(stale)),
          action: {
            label: msg().overview.actions.importAgain,
            href: importAction().href,
          },
        }
      : {}),
  };
}

function rotation(p: OverviewInput): OverviewBlock {
  const text = msg().overview.rotation;
  const base = {
    id: 'rotation' as const,
    title: text.title,
    link: routeHref({ name: 'crateView', view: 'rotation' }),
  };
  if (p.crateStatus === 'empty' || !p.model) {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: text.empty,
      action: importAction(),
    };
  }
  if (p.crateStatus === 'reimport') {
    return {
      ...base,
      state: 'gated',
      figures: [],
      reason: text.reimport,
      action: importAction(),
    };
  }
  const m = p.model;
  const items = rotationOf(m.plays, p.now, p.rotationMonths);
  const keys = lastMonths(p.now, p.rotationMonths);
  const range = p.historySummary?.range ?? null;
  return {
    ...base,
    state: 'ready',
    figures: [
      { label: text.tracks, value: count(items.length) },
      { label: text.window, value: text.windowValue(p.rotationMonths) },
    ],
    items: items.slice(0, TOP_COUNT).map((item) => {
      const label = playLabel(m, item.row);
      return {
        title: label.title,
        subtitle: label.subtitle,
        trackId: item.row.trackId,
        href: routeHref({
          name: 'crateView',
          view: 'rotation',
          detail: item.row.trackId,
        }),
        value: msg().n.play(item.windowPlays),
        series: monthSeries(item.row.months, keys, range),
      };
    }),
    ...(items.length === 0 ? { note: text.nothing(p.rotationMonths) } : {}),
  };
}

function top(p: OverviewInput): OverviewBlock {
  const base = {
    id: 'top' as const,
    title: msg().overview.top.title,
    link: routeHref({ name: 'top' }),
  };
  const tracks = p.model ? topTracks(p.model, 'short_term') : [];
  if (tracks.length === 0) {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: msg().overview.top.empty,
      action: syncAction(),
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
      href: routeHref({ name: 'top', detail: r.item.id }),
      value: r.plays ? msg().n.play(r.plays.plays) : null,
    })),
  };
}

/** The quota lock, worded as the Sync card words it, then pending. */
function syncWarning(p: OverviewInput): string | undefined {
  const at = p.now.getTime();
  const s = p.syncState;
  const shared = activeLock(p.quotaLockUntil, at);
  const text = msg().overview.library;
  // As the Sync card: its own line when the lock it met is the one holding
  // (it names the pending playlists), else the shared lock's line.
  if (s.status === 'locked' && (shared === null || s.retryAt >= shared)) {
    const retry =
      activeLock(s.retryAt, at) !== null
        ? text.retryAfter(formatDateTime(s.retryAt))
        : text.retryNow;
    return `${text.quota(s.pending.length)} ${retry}`;
  }
  if (shared !== null) {
    return quotaRefusal('sync', shared, at, formatDateTime) ?? undefined;
  }
  if (s.status === 'error') {
    // As the Sync card: the error always shows, the pending count with it.
    return s.pending.length > 0
      ? text.pendingError(s.pending.length, s.message)
      : text.lastError(s.message);
  }
  return undefined;
}

function library(p: OverviewInput): OverviewBlock {
  const warning = syncWarning(p);
  const text = msg().overview.library;
  const base = {
    id: 'library' as const,
    title: text.title,
    link: routeHref({ name: 'playlists' }),
    ...(warning ? { warning } : {}),
  };
  const m = p.model;
  if (!m || m.playlists.length === 0) {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: text.empty,
      action: syncAction(),
    };
  }
  return {
    ...base,
    state: 'ready',
    figures: [
      { label: text.playlists, value: count(m.playlists.length) },
      { label: text.tracks, value: count(m.tracksByKey.size) },
      {
        label: text.lastSync,
        value: p.lastSyncAt ? formatDateTime(p.lastSyncAt) : text.never,
      },
    ],
  };
}

function coverageBlock(p: OverviewInput): OverviewBlock {
  const text = msg().overview.coverage;
  const base = {
    id: 'coverage' as const,
    title: text.title,
    link: routeHref({ name: 'settings' }),
  };
  const m = p.model;
  const audio = m ? coverage(m) : null;
  const reach = m ? reachCoverage(m) : null;
  if (!audio || !reach || (audio.total === 0 && reach.artists === 0)) {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: text.empty,
      action: syncAction(),
    };
  }
  const summary = p.artistReachSummary;
  const figures: OverviewFigure[] = [
    {
      label: text.audio,
      value: text.audioValue(audio.covered, audio.total),
    },
    {
      label: text.reach,
      value: text.reachValue(reach.covered, reach.artists),
    },
    {
      label: text.rekordbox,
      value: p.rekordboxSummary
        ? formatDate(p.rekordboxSummary.importedAt)
        : null,
    },
    {
      label: text.reachAsOf,
      value: summary?.version === 1 ? formatDate(summary.ranAt) : null,
    },
  ];
  if (summary?.version !== 1) {
    return {
      ...base,
      state: 'gated',
      figures,
      reason: text.gated,
      action: {
        label: msg().overview.actions.lookUp,
        href: routeHref({ name: 'settings', item: 'reach' }),
      },
    };
  }
  return { ...base, state: 'ready', figures };
}

function mix(p: OverviewInput): OverviewBlock {
  const text = msg().overview.mix;
  const base = {
    id: 'mix' as const,
    title: text.title,
    link: routeHref({ name: 'mix' }),
    ...(p.mixError ? { error: p.mixError } : {}),
  };
  if (p.mixes === null) {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: text.reading,
    };
  }
  const newest = p.mixes[0];
  // A failed read says so, not "no saved mixes".
  if (!newest && p.mixError) return { ...base, state: 'empty', figures: [] };
  if (!newest) {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: text.empty,
      action: { label: msg().overview.actions.openMix, href: base.link },
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
    figures: [{ label: text.saved, value: formatDate(newest.savedAt) }],
    items: [
      {
        title: item?.title ?? newest.url,
        subtitle: '',
        href: routeHref({ name: 'mix', key: newest.url }),
      },
    ],
    ...(item ? { chip: item.chip } : {}),
  };
}

function server(p: OverviewInput): OverviewBlock {
  const s = p.serverState;
  // One error line: the server's own failure first, then the read error.
  const readError = p.serverPendingError;
  const error =
    s.status === 'error'
      ? readError
        ? `${s.message} ${readError}`
        : s.message
      : readError;
  const text = msg().overview.server;
  const base = {
    id: 'server' as const,
    title: text.title,
    link: routeHref({ name: 'settings' }),
    ...(error ? { error } : {}),
  };
  if (s.status === 'unset') return { ...base, state: 'hidden', figures: [] };
  if (s.status === 'signedOut') {
    return {
      ...base,
      state: 'empty',
      figures: [],
      reason: text.signedOut,
      action: { label: msg().overview.actions.signIn, href: base.link },
    };
  }
  const last = s.status === 'connected' ? s.lastSyncAt : p.serverLastSyncAt;
  const figures: OverviewFigure[] = [
    { label: text.lastSync, value: last ? formatDateTime(last) : text.never },
    {
      label: text.waiting,
      value: p.serverPending ? pendingValue(p.serverPending) : null,
    },
  ];
  switch (s.status) {
    case 'pushing':
    case 'pulling':
      figures.push({
        label: text.now,
        value: s.status === 'pushing' ? text.saving : text.loading,
      });
      return { ...base, state: 'ready', figures };
    case 'offline':
      return {
        ...base,
        state: 'ready',
        figures,
        warning: text.offline(s.message),
      };
    case 'paused':
      return {
        ...base,
        state: 'ready',
        figures,
        warning: text.paused,
      };
    case 'error':
      return { ...base, state: 'ready', figures };
    case 'connected':
      return {
        ...base,
        state: 'ready',
        figures,
        ...(s.rejected > 0
          ? {
              warning: text.rejected(s.rejected),
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
