import {
  PERIODS,
  topKey,
  type AllRows,
  type ArtistRef,
  type EntryRow,
  type FeatureRow,
  type Period,
  type PlayRow,
  type PlaylistRow,
  type TopArtistItem,
  type TopItemsRow,
  type TopTrackItem,
  type TrackRow,
} from '../db/schema';
import { nameKey, normalize } from './normalize';

export interface PlaysInfo {
  plays: number;
  msPlayed: number;
  source: 'id' | 'name';
}

export interface ArtistAgg {
  key: string;
  id: string | null;
  name: string;
  trackKeys: Set<string>;
  playlistIds: Set<string>;
}

export interface Model {
  playlists: PlaylistRow[];
  playlistsById: Map<string, PlaylistRow>;
  tracksByKey: Map<string, TrackRow>;
  entriesByPlaylist: Map<string, EntryRow[]>;
  playlistsOfTrack: Map<string, Set<string>>;
  /** nameKey(lead artist, title) -> playlists holding a track of that name. */
  playlistsOfNameKey: Map<string, Set<string>>;
  artists: ArtistAgg[];
  artistsByKey: Map<string, ArtistAgg>;
  topItems: Map<string, TopItemsRow>;
  topRank: Map<string, Map<Period, number>>;
  /** Every imported row, including tracks with no credited play. */
  plays: PlayRow[];
  playsById: Map<string, PlayRow>;
  playsByName: Map<string, { plays: number; msPlayed: number }>;
  /** BPM and key rows by Spotify track id; resolve them with featureFor. */
  features: Map<string, FeatureRow>;
}

export function artistKey(a: ArtistRef): string {
  return a.id ?? `name:${normalize(a.name)}`;
}

export function buildModel(rows: AllRows): Model {
  const playlists = [...rows.playlists].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const playlistsById = new Map(playlists.map((p) => [p.id, p]));
  const tracksByKey = new Map(rows.tracks.map((t) => [t.key, t]));
  const entriesByPlaylist = new Map<string, EntryRow[]>();
  const playlistsOfTrack = new Map<string, Set<string>>();
  const playlistsOfNameKey = new Map<string, Set<string>>();
  const artistsByKey = new Map<string, ArtistAgg>();

  for (const entry of rows.entries) {
    if (!playlistsById.has(entry.playlistId)) continue;
    const list = entriesByPlaylist.get(entry.playlistId) ?? [];
    list.push(entry);
    entriesByPlaylist.set(entry.playlistId, list);
    const owners = playlistsOfTrack.get(entry.trackKey) ?? new Set<string>();
    owners.add(entry.playlistId);
    playlistsOfTrack.set(entry.trackKey, owners);
    const track = tracksByKey.get(entry.trackKey);
    if (!track) continue;
    // Consulted after playlistsOfTrack so a relinked id, whose history row
    // has a different track id, is not reported as being in no playlist.
    const lead = track.artists[0]?.name;
    if (lead) {
      const key = nameKey(lead, track.name);
      const named = playlistsOfNameKey.get(key) ?? new Set<string>();
      named.add(entry.playlistId);
      playlistsOfNameKey.set(key, named);
    }
    for (const ref of track.artists) {
      const key = artistKey(ref);
      const agg = artistsByKey.get(key) ?? {
        key,
        id: ref.id,
        name: ref.name,
        trackKeys: new Set<string>(),
        playlistIds: new Set<string>(),
      };
      agg.trackKeys.add(track.key);
      agg.playlistIds.add(entry.playlistId);
      artistsByKey.set(key, agg);
    }
  }
  for (const list of entriesByPlaylist.values()) {
    list.sort((a, b) => a.position - b.position);
  }
  const artists = [...artistsByKey.values()].sort(
    (a, b) =>
      b.trackKeys.size - a.trackKeys.size || a.name.localeCompare(b.name)
  );

  const topItems = new Map(rows.topItems.map((t) => [t.key, t]));
  const topRank = new Map<string, Map<Period, number>>();
  for (const row of rows.topItems) {
    if (row.type !== 'tracks') continue;
    for (const item of row.items) {
      const ranks = topRank.get(item.id) ?? new Map<Period, number>();
      ranks.set(row.period, item.rank);
      topRank.set(item.id, ranks);
    }
  }

  const playsById = new Map(rows.plays.map((p) => [p.trackId, p]));
  const playsByName = new Map<string, { plays: number; msPlayed: number }>();
  for (const p of rows.plays) {
    // A row built from short records only would create a name key totalling
    // zero, which playsFor would then report as "0 plays".
    if (p.plays === 0) continue;
    if (!p.trackName || !p.artistName) continue;
    const key = nameKey(p.artistName, p.trackName);
    const current = playsByName.get(key) ?? { plays: 0, msPlayed: 0 };
    current.plays += p.plays;
    current.msPlayed += p.msPlayed;
    playsByName.set(key, current);
  }

  return {
    playlists,
    playlistsById,
    tracksByKey,
    entriesByPlaylist,
    playlistsOfTrack,
    playlistsOfNameKey,
    artists,
    artistsByKey,
    topItems,
    topRank,
    plays: rows.plays,
    playsById,
    playsByName,
    features: new Map(rows.features.map((f) => [f.trackId, f])),
  };
}

export function playsFor(
  model: Model,
  track: { id: string | null; name: string; artists: ArtistRef[] }
): PlaysInfo | null {
  if (track.id) {
    const byId = model.playsById.get(track.id);
    // A row with no credited play is not a play count. Fall through to the
    // name path, which is where this track landed before short-only rows
    // existed at all.
    if (byId && byId.plays > 0)
      return { plays: byId.plays, msPlayed: byId.msPlayed, source: 'id' };
  }
  const artist = track.artists[0]?.name;
  if (!artist) return null;
  const byName = model.playsByName.get(nameKey(artist, track.name));
  return byName ? { ...byName, source: 'name' } : null;
}

function topPeriods(model: Model, id: string | null): Period[] {
  const ranks = id ? model.topRank.get(id) : undefined;
  return ranks ? PERIODS.filter((p) => ranks.has(p)) : [];
}

function bestRank(model: Model, id: string | null): number {
  const ranks = id ? model.topRank.get(id) : undefined;
  return ranks && ranks.size > 0
    ? Math.min(...ranks.values())
    : Number.POSITIVE_INFINITY;
}

/** Ordering for bestRank values; subtracting two Infinities would give NaN. */
function compareRank(a: number, b: number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export interface RankedTrack {
  entry: EntryRow;
  track: TrackRow;
  plays: PlaysInfo | null;
  inTop: Period[];
}

export function playlistRanking(
  model: Model,
  playlistId: string
): RankedTrack[] {
  const ranked: RankedTrack[] = [];
  for (const entry of model.entriesByPlaylist.get(playlistId) ?? []) {
    const track = model.tracksByKey.get(entry.trackKey);
    if (!track) continue;
    ranked.push({
      entry,
      track,
      plays: playsFor(model, track),
      inTop: topPeriods(model, track.id),
    });
  }
  return ranked.sort(
    (a, b) =>
      (b.plays?.plays ?? 0) - (a.plays?.plays ?? 0) ||
      compareRank(bestRank(model, a.track.id), bestRank(model, b.track.id)) ||
      a.entry.position - b.entry.position
  );
}

export interface AnnotatedTopTrack {
  item: TopTrackItem;
  playlistIds: string[];
  plays: PlaysInfo | null;
}

export function topTracks(model: Model, period: Period): AnnotatedTopTrack[] {
  const row = model.topItems.get(topKey('tracks', period));
  if (!row || row.type !== 'tracks') return [];
  return row.items.map((item) => ({
    item,
    playlistIds: [...(model.playlistsOfTrack.get(item.id) ?? [])],
    plays: playsFor(model, item),
  }));
}

export interface AnnotatedTopArtist {
  item: TopArtistItem;
  savedTracks: number;
  playlistCount: number;
}

export function topArtists(model: Model, period: Period): AnnotatedTopArtist[] {
  const row = model.topItems.get(topKey('artists', period));
  if (!row || row.type !== 'artists') return [];
  return row.items.map((item) => {
    const agg = model.artistsByKey.get(item.id);
    return {
      item,
      savedTracks: agg?.trackKeys.size ?? 0,
      playlistCount: agg?.playlistIds.size ?? 0,
    };
  });
}

export interface ArtistTrack {
  track: TrackRow;
  plays: PlaysInfo | null;
  playlistIds: string[];
}

export function artistTracks(model: Model, key: string): ArtistTrack[] {
  const agg = model.artistsByKey.get(key);
  if (!agg) return [];
  const out: ArtistTrack[] = [];
  for (const trackKey of agg.trackKeys) {
    const track = model.tracksByKey.get(trackKey);
    if (!track) continue;
    out.push({
      track,
      plays: playsFor(model, track),
      playlistIds: [...(model.playlistsOfTrack.get(trackKey) ?? [])],
    });
  }
  return out.sort(
    (a, b) =>
      (b.plays?.plays ?? 0) - (a.plays?.plays ?? 0) ||
      a.track.name.localeCompare(b.track.name)
  );
}
