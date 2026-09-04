import type { DBSchema } from 'idb';

export const DB_NAME = 'spotify-dj';
export const DB_VERSION = 1;

export interface ArtistRef {
  id: string | null;
  name: string;
}

export interface PlaylistRow {
  id: string;
  name: string;
  snapshotId: string;
  itemCount: number;
  imageUrl: string | null;
  spotifyUrl: string | null;
  syncedAt: number;
}

export interface TrackRow {
  /** Spotify track id, or the `spotify:local:` URI for local files. */
  key: string;
  id: string | null;
  uri: string;
  name: string;
  artists: ArtistRef[];
  album: string;
  durationMs: number;
  isrc: string | null;
  spotifyUrl: string | null;
  isLocal: boolean;
}

export interface EntryRow {
  playlistId: string;
  position: number;
  trackKey: string;
  addedAt: string | null;
}

export type TopType = 'tracks' | 'artists';
export type Period = 'short_term' | 'medium_term' | 'long_term';
export const PERIODS: readonly Period[] = [
  'short_term',
  'medium_term',
  'long_term',
];

export interface TopTrackItem {
  rank: number;
  id: string;
  name: string;
  artists: ArtistRef[];
  album: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
}

export interface TopArtistItem {
  rank: number;
  id: string;
  name: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
}

export type TopItemsRow = { key: string; period: Period; fetchedAt: number } & (
  | { type: 'tracks'; items: TopTrackItem[] }
  | { type: 'artists'; items: TopArtistItem[] }
);

export function topKey(type: TopType, period: Period): string {
  return `${type}:${period}`;
}

export interface PlayRow {
  trackId: string;
  plays: number;
  msPlayed: number;
  firstTs: string;
  lastTs: string;
  trackName: string | null;
  artistName: string | null;
  /** 'YYYY-MM' -> credited plays, bucketed in the importing device's zone. */
  months?: Record<string, number>;
  /** Every record with a track URI, including plays under 30 s. */
  attempts?: number;
  /** Records whose reason_end was 'trackdone'. */
  finished?: number;
  /** Records the skip rule counted as a skip. */
  skipped?: number;
  // The four are optional so rows written by an older import still type-check.
  // DB_VERSION stays 1: play records are schemaless, replacePlays clears the
  // store, and the current upgrade callback would throw on a bump.
}

export interface MetaRow {
  name: string;
  value: unknown;
}

export interface AllRows {
  playlists: PlaylistRow[];
  tracks: TrackRow[];
  entries: EntryRow[];
  topItems: TopItemsRow[];
  plays: PlayRow[];
}

export interface DjDb extends DBSchema {
  playlists: { key: string; value: PlaylistRow };
  tracks: { key: string; value: TrackRow };
  entries: { key: [string, number]; value: EntryRow };
  topItems: { key: string; value: TopItemsRow };
  plays: { key: string; value: PlayRow };
  meta: { key: string; value: MetaRow };
}
