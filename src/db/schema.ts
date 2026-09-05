import type { DBSchema } from 'idb';

export const DB_NAME = 'spotify-dj';
export const DB_VERSION = 2;

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
  // Play records stay schemaless: replacePlays clears the store, so no
  // DB_VERSION bump ever has to migrate them.
}

/** BPM and key as one source reports them. */
export interface FeatureValue {
  /** Beats per minute, as reported. */
  bpm: number | null;
  /** Pitch class 0..11, C = 0. */
  key: number | null;
  /** true = major, false = minor. */
  major: boolean | null;
  /** 0..1 when the source has it, else null. */
  energy: number | null;
  /** epoch ms */
  fetchedAt: number;
}

export interface RekordboxValue extends FeatureValue {
  matchedBy: 'title-artist-duration' | 'title-artist';
  rbTitle: string;
  rbArtist: string;
}

export interface FeatureRow {
  trackId: string;
  isrc: string | null;
  reccobeats?: FeatureValue | { notFound: true; checkedAt: number };
  rekordbox?: RekordboxValue;
  updatedAt: number;
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
  features: FeatureRow[];
}

export interface DjDb extends DBSchema {
  playlists: { key: string; value: PlaylistRow };
  tracks: { key: string; value: TrackRow };
  entries: { key: [string, number]; value: EntryRow };
  topItems: { key: string; value: TopItemsRow };
  plays: { key: string; value: PlayRow };
  features: { key: string; value: FeatureRow };
  meta: { key: string; value: MetaRow };
}
