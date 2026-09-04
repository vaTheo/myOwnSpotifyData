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
}

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

export class PlayAggregator {
  readonly counts: ImportCounts = emptyCounts();
  private readonly byId = new Map<string, PlayRow>();

  add(record: unknown): void {
    const cls = classify(record);
    this.counts[cls] += 1;
    if (cls !== 'credited') return;
    const r = record as RawRecord;
    const id = trackIdFromUri(r.spotify_track_uri);
    if (!id) return;
    const ts = text(r.ts) ?? '';
    const ms = r.ms_played as number;
    const row = this.byId.get(id);
    if (!row) {
      this.byId.set(id, {
        trackId: id,
        plays: 1,
        msPlayed: ms,
        firstTs: ts,
        lastTs: ts,
        trackName: text(r.master_metadata_track_name),
        artistName: text(r.master_metadata_album_artist_name),
      });
      return;
    }
    row.plays += 1;
    row.msPlayed += ms;
    if (ts && (!row.firstTs || ts < row.firstTs)) row.firstTs = ts;
    if (ts > row.lastTs) row.lastTs = ts;
    row.trackName ??= text(r.master_metadata_track_name);
    row.artistName ??= text(r.master_metadata_album_artist_name);
  }

  rows(): PlayRow[] {
    return [...this.byId.values()];
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
