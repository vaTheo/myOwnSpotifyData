import {
  PERIODS,
  topKey,
  type AllRows,
  type ArtistRef,
  type EntryRow,
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
  artists: ArtistAgg[];
  artistsByKey: Map<string, ArtistAgg>;
  topItems: Map<string, TopItemsRow>;
  topRank: Map<string, Map<Period, number>>;
  playsById: Map<string, PlayRow>;
  playsByName: Map<string, { plays: number; msPlayed: number }>;
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
    artists,
    artistsByKey,
    topItems,
    topRank,
    playsById,
    playsByName,
  };
}

export function playsFor(
  model: Model,
  track: { id: string | null; name: string; artists: ArtistRef[] }
): PlaysInfo | null {
  if (track.id) {
    const byId = model.playsById.get(track.id);
    if (byId)
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
      bestRank(model, a.track.id) - bestRank(model, b.track.id) ||
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
