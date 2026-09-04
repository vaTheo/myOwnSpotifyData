import type { PlayRow } from '../db/schema';

export const MIN_PLAY_MS = 30_000;

export type RecordClass =
  'credited' | 'short' | 'podcast' | 'audiobook' | 'unattributed' | 'malformed';

export type ImportCounts = Record<RecordClass, number>;

export function emptyCounts(): ImportCounts {
  return {
    credited: 0,
    short: 0,
    podcast: 0,
    audiobook: 0,
    unattributed: 0,
    malformed: 0,
  };
}

interface RawRecord {
  ts?: unknown;
  ms_played?: unknown;
  spotify_track_uri?: unknown;
  spotify_episode_uri?: unknown;
  audiobook_uri?: unknown;
  master_metadata_track_name?: unknown;
  master_metadata_album_artist_name?: unknown;
  reason_end?: unknown;
  skipped?: unknown;
}

export interface Outcomes {
  attempts: number;
  finished: number;
  skipped: number;
}

export type Outcome = 'finished' | 'skipped' | 'neutral';

/** reason_end values that mean the listener moved on. */
const SKIP_REASONS = new Set(['fwdbtn', 'backbtn', 'endplay', 'unknown']);

/** A row while it is being built: PlayRow's optional fields are always set. */
type TrackTotals = PlayRow & {
  months: Record<string, number>;
  attempts: number;
  finished: number;
  skipped: number;
};

const TRACK_PREFIX = 'spotify:track:';

export function trackIdFromUri(uri: unknown): string | null {
  if (typeof uri !== 'string' || !uri.startsWith(TRACK_PREFIX)) return null;
  const id = uri.slice(TRACK_PREFIX.length);
  return id.length > 0 ? id : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function classify(record: unknown): RecordClass {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return 'malformed';
  }
  const r = record as RawRecord;
  if (trackIdFromUri(r.spotify_track_uri)) {
    return typeof r.ms_played === 'number' && r.ms_played >= MIN_PLAY_MS
      ? 'credited'
      : 'short';
  }
  if (text(r.spotify_episode_uri)) return 'podcast';
  if (text(r.audiobook_uri)) return 'audiobook';
  return 'unattributed';
}

/**
 * reason_end decides first: records carry `skipped: true` next to 'trackdone',
 * and the flag is false for every play between 2015-04-13 and 2022-10-16, so
 * it may only ever add skips.
 */
export function outcomeOf(record: unknown): Outcome {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return 'neutral';
  }
  const r = record as RawRecord;
  if (r.reason_end === 'trackdone') return 'finished';
  if (
    r.skipped === true ||
    (typeof r.reason_end === 'string' && SKIP_REASONS.has(r.reason_end))
  ) {
    return 'skipped';
  }
  // logout, remote, trackerror, the two unexpected exits, switched-to-audio,
  // the empty string and the pre-2017 values are neither: they say nothing
  // about whether the listener liked the track.
  return 'neutral';
}

/** 'YYYY-MM' in the importing device's zone, or null for an unusable ts. */
function monthOf(ts: string): string | null {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

export class PlayAggregator {
  readonly counts: ImportCounts = emptyCounts();
  private readonly byId = new Map<string, TrackTotals>();
  private readonly totals: Outcomes = {
    attempts: 0,
    finished: 0,
    skipped: 0,
  };

  add(record: unknown): void {
    const cls = classify(record);
    this.counts[cls] += 1;
    // Short records credit no play but still say how the track ended.
    if (cls !== 'credited' && cls !== 'short') return;
    const r = record as RawRecord;
    const id = trackIdFromUri(r.spotify_track_uri);
    if (!id) return;
    let row = this.byId.get(id);
    if (!row) {
      row = {
        trackId: id,
        plays: 0,
        msPlayed: 0,
        firstTs: '',
        lastTs: '',
        trackName: null,
        artistName: null,
        months: {},
        attempts: 0,
        finished: 0,
        skipped: 0,
      };
      this.byId.set(id, row);
    }
    row.attempts += 1;
    this.totals.attempts += 1;
    const outcome = outcomeOf(record);
    if (outcome === 'finished') {
      row.finished += 1;
      this.totals.finished += 1;
    } else if (outcome === 'skipped') {
      row.skipped += 1;
      this.totals.skipped += 1;
    }
    // Keep the latest name Spotify reported; older exports carry null names.
    const trackName = text(r.master_metadata_track_name);
    if (trackName !== null) row.trackName = trackName;
    const artistName = text(r.master_metadata_album_artist_name);
    if (artistName !== null) row.artistName = artistName;
    if (cls !== 'credited') return;
    const ts = text(r.ts) ?? '';
    row.plays += 1;
    row.msPlayed += r.ms_played as number;
    if (ts && (!row.firstTs || ts < row.firstTs)) row.firstTs = ts;
    if (ts > row.lastTs) row.lastTs = ts;
    // sum(months) === plays for every record with a parseable ts.
    const month = monthOf(ts);
    if (month) row.months[month] = (row.months[month] ?? 0) + 1;
  }

  rows(): PlayRow[] {
    return [...this.byId.values()];
  }

  outcomes(): Outcomes {
    return { ...this.totals };
  }

  /** The zone the month keys were bucketed in, shown on the Import screen. */
  zone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  range(): { first: string; last: string } | null {
    let first = '';
    let last = '';
    for (const row of this.byId.values()) {
      if (row.firstTs && (!first || row.firstTs < first)) first = row.firstTs;
      if (row.lastTs > last) last = row.lastTs;
    }
    return first ? { first, last } : null;
  }
}
