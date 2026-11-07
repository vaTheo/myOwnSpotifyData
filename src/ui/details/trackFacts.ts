import type {
  ArtistRef,
  PlayRow,
  TopTrackItem,
  TrackRow,
} from '../../db/schema';
import { artistKey, playsFor, type Model } from '../../model/aggregate';
import { peakMonth } from '../../model/crate';
import { reccobeatsValue, resolveFeature } from '../../model/features';
import { nameKey, normalize } from '../../model/normalize';

/**
 * Which track a details sheet is about (spec 003, data-model §5): a track id
 * (Top, Artist, search), a playlist entry (a playlist may hold a track
 * twice), or a play row of the history (the Crate views).
 */
export type TrackRef =
  | { trackId: string }
  | { playlistId: string; position: number }
  | { playRowId: string };

export interface TrackAudio {
  bpm: number | null;
  key: number | null;
  major: boolean | null;
  energy: number | null;
  source: 'rekordbox' | 'reccobeats';
  fetchedAt: number;
}

export interface TrackPlays {
  plays: number;
  /** Counted by artist and title, as the Plays column notes it. */
  byName: boolean;
  msPlayed: number;
  firstTs: string;
  lastTs: string;
  attempts: number | null;
  finished: number | null;
  skipped: number | null;
  unclear: number | null;
}

/** Everything the app knows about one track, for the details sheet. */
export interface TrackFacts {
  title: string;
  /** `artistKey` is set only for an artist with saved tracks. */
  artists: { name: string; artistKey: string | null }[];
  album: string | null;
  durationMs: number | null;
  spotifyUrl: string | null;
  isLocal: boolean;
  audio: TrackAudio | null;
  /** Null before an import, and for a track the history never credited. */
  plays: TrackPlays | null;
  months: Record<string, number> | null;
  peakMonth: string | null;
  playlists: { id: string; name: string }[];
}

function topTrack(model: Model, id: string): TopTrackItem | null {
  for (const row of model.topItems.values()) {
    if (row.type !== 'tracks') continue;
    const found = row.items.find((item) => item.id === id);
    if (found) return found;
  }
  return null;
}

/** The track a reference names, from the synced library or the top lists. */
function resolveTrack(
  model: Model,
  ref: TrackRef
): { track: TrackRow | null; top: TopTrackItem | null; id: string | null } {
  if ('playlistId' in ref) {
    const entry = model.entriesByPlaylist
      .get(ref.playlistId)
      ?.find((e) => e.position === ref.position);
    const track = entry ? model.tracksByKey.get(entry.trackKey) : undefined;
    return { track: track ?? null, top: null, id: track?.id ?? null };
  }
  const id = 'trackId' in ref ? ref.trackId : ref.playRowId;
  const track = model.tracksByKey.get(id) ?? null;
  return {
    track,
    top: track ? null : topTrack(model, id),
    id: track ? track.id : id,
  };
}

function savedArtist(model: Model, ref: ArtistRef): string | null {
  const key = artistKey(ref);
  return model.artistsByKey.has(key) ? key : null;
}

/** A history row names one artist as text: match it to a saved one. */
function artistOfRow(model: Model, name: string): string | null {
  const wanted = normalize(name);
  return model.artists.find((a) => normalize(a.name) === wanted)?.key ?? null;
}

/** Sums a field only when every row recorded it (older imports did not). */
function total(
  rows: PlayRow[],
  field: 'attempts' | 'finished' | 'skipped'
): number | null {
  let sum = 0;
  for (const row of rows) {
    const value = row[field];
    if (value === undefined) return null;
    sum += value;
  }
  return sum;
}

function playsOfRows(
  rows: PlayRow[],
  plays: number,
  msPlayed: number,
  byName: boolean
): TrackPlays {
  const firstTs = rows
    .map((r) => r.firstTs)
    .reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a));
  const lastTs = rows
    .map((r) => r.lastTs)
    .reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
  const attempts = total(rows, 'attempts');
  const finished = total(rows, 'finished');
  const skipped = total(rows, 'skipped');
  // As the Finish view computes it; the clamp keeps a stale row from
  // printing a negative count.
  const unclear =
    attempts === null || finished === null || skipped === null
      ? null
      : Math.max(0, attempts - finished - skipped);
  return {
    plays,
    byName,
    msPlayed,
    firstTs,
    lastTs,
    attempts,
    finished,
    skipped,
    unclear,
  };
}

function mergedMonths(rows: PlayRow[]): Record<string, number> | null {
  const withMonths = rows.filter((r) => r.months !== undefined);
  if (withMonths.length === 0) return null;
  const out: Record<string, number> = {};
  for (const row of withMonths) {
    for (const [month, n] of Object.entries(row.months ?? {})) {
      out[month] = (out[month] ?? 0) + n;
    }
  }
  return out;
}

/** By id first, then by artist and title, as `playlistsOfRow` does. */
function playlistIds(
  model: Model,
  key: string | null,
  artist: string | null,
  title: string
): string[] {
  const byId = key ? model.playlistsOfTrack.get(key) : undefined;
  if (byId && byId.size > 0) return [...byId];
  if (!artist) return [];
  const byName = model.playlistsOfNameKey.get(nameKey(artist, title));
  return byName ? [...byName] : [];
}

/**
 * The facts of one track for the details sheet (spec 003, data-model §5),
 * or null for an unknown or stale reference. Nothing is computed anew: plays
 * come from `playsFor` (the Plays column's count), audio from
 * `resolveFeature` (the BPM and key columns' source), so the sheet and the
 * table never disagree. A play row reference takes the row itself, as the
 * Crate views count it.
 */
export function trackFacts(model: Model, ref: TrackRef): TrackFacts | null {
  const { track, top, id } = resolveTrack(model, ref);
  const row = id ? model.playsById.get(id) : undefined;
  if (!track && !top && !row) return null;
  if ('playRowId' in ref && !row) return null;

  const title = track?.name ?? top?.name ?? row?.trackName ?? 'Unknown title';
  const refs = track?.artists ?? top?.artists ?? null;
  const artists = refs
    ? refs.map((a) => ({ name: a.name, artistKey: savedArtist(model, a) }))
    : [
        {
          name: row?.artistName ?? 'Unknown artist',
          artistKey: row?.artistName
            ? artistOfRow(model, row.artistName)
            : null,
        },
      ];
  const isLocal = track?.isLocal ?? false;
  const spotifyUrl = isLocal
    ? null
    : (track?.spotifyUrl ??
      top?.spotifyUrl ??
      (id ? `https://open.spotify.com/track/${id}` : null));

  const featureRow = id ? model.features.get(id) : undefined;
  const resolved = resolveFeature(featureRow);
  const sourceValue =
    resolved?.source === 'rekordbox'
      ? featureRow?.rekordbox
      : featureRow
        ? reccobeatsValue(featureRow)
        : null;
  const audio: TrackAudio | null =
    resolved && sourceValue
      ? {
          bpm: resolved.bpm,
          key: resolved.key,
          major: resolved.major,
          energy: sourceValue.energy,
          source: resolved.source,
          fetchedAt: sourceValue.fetchedAt,
        }
      : null;

  let plays: TrackPlays | null = null;
  let months: Record<string, number> | null = null;
  if ('playRowId' in ref && row) {
    plays = playsOfRows([row], row.plays, row.msPlayed, false);
    months = row.months ?? null;
  } else {
    const info = playsFor(model, {
      id,
      name: title,
      artists: refs ?? [],
    });
    if (info) {
      const lead = refs?.[0]?.name ?? '';
      const key = nameKey(lead, title);
      const rows =
        info.source === 'id' && row
          ? [row]
          : model.plays.filter(
              (p) =>
                p.plays > 0 &&
                p.artistName !== null &&
                p.trackName !== null &&
                nameKey(p.artistName, p.trackName) === key
            );
      if (rows.length > 0) {
        plays = playsOfRows(
          rows,
          info.plays,
          info.msPlayed,
          info.source === 'name'
        );
        months = mergedMonths(rows);
      }
    }
  }

  // A play row keeps its own names here, as `playlistsOfRow` (the Crate's
  // "not in a playlist" flag) reads them.
  const ids =
    'playRowId' in ref && row
      ? row.trackName
        ? playlistIds(model, row.trackId, row.artistName, row.trackName)
        : playlistIds(model, row.trackId, null, '')
      : playlistIds(model, track?.key ?? id, refs?.[0]?.name ?? null, title);
  const playlists = ids.map((pid) => ({
    id: pid,
    name: model.playlistsById.get(pid)?.name ?? pid,
  }));

  return {
    title,
    artists,
    album: track?.album || top?.album || null,
    durationMs: track?.durationMs ?? null,
    spotifyUrl,
    isLocal,
    audio,
    plays,
    months,
    peakMonth: months ? peakMonth(months, Object.keys(months).sort()) : null,
    playlists,
  };
}

/** One string per reference, equal for equal references. */
function refKey(ref: TrackRef): string {
  if ('trackId' in ref) return `t:${ref.trackId}`;
  if ('playRowId' in ref) return `h:${ref.playRowId}`;
  return `p:${ref.playlistId}:${ref.position}`;
}

/**
 * `trackFacts` remembering its last answer while the model and the
 * reference stay (S13 A6): an open sheet re-renders on every keystroke of
 * the screen under it, and the by-name play count scans every play row.
 */
export function factsCache(): (
  model: Model,
  ref: TrackRef
) => TrackFacts | null {
  let last: { model: Model; key: string; facts: TrackFacts | null } | null =
    null;
  return (model, ref) => {
    const key = refKey(ref);
    if (last !== null && last.model === model && last.key === key) {
      return last.facts;
    }
    const facts = trackFacts(model, ref);
    last = { model, key, facts };
    return facts;
  };
}
