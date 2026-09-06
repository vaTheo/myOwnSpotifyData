import type { DBSchema } from 'idb';

export const DB_NAME = 'spotify-dj';
export const DB_VERSION = 4; // was 3

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

/** How far a per-artist identity step has got. 'unchecked' is the initial state. */
export type ResolveStatus = 'unchecked' | 'ok' | 'notFound' | 'retryLater';

/** The three sources that produce a stored number, i.e. `ArtistReachRow.source`. */
export type ReachSource = 'listenbrainz' | 'deezer' | 'wikipedia';

export type ReachStatus = 'ok' | 'notFound' | 'retryLater';

/** Store `artistIdentity`, keyPath 'artistId'. */
export interface ArtistIdentityRow {
  /** Spotify artist id; the only key any lookup starts from. */
  artistId: string;
  /** Spotify's name, kept so a run can verify what a source echoes back. */
  name: string;
  mbid: string | null;
  mbidStatus: ResolveStatus;
  qid: string | null;
  qidStatus: ResolveStatus;
  /**
   * When Wikidata last answered about this artist, or null if it never has.
   * The QID refresh reads this clock and not `resolvedAt`: one row carries
   * three steps, a `notFound` MBID or Deezer id is rewritten every thirty
   * days, and every write bumps `resolvedAt` — so the ninety-day sitelink
   * refresh would never come due.
   */
  qidCheckedAt: number | null;
  /** Wikidata `wikibase:sitelinks`, all languages; null until Wikidata answered. */
  sitelinks: number | null;
  /** Article path segments exactly as the sitelink spells them, or null. */
  wikiTitles: { en: string | null; fr: string | null };
  deezerArtistId: number | null;
  /** The name Deezer echoed, kept as the record of what the check accepted. */
  deezerName: string | null;
  deezerStatus: ResolveStatus;
  /** When the row was last written; the clock the MBID and Deezer steps read. */
  resolvedAt: number;
  /** Epoch ms before which a 'retryLater' step must not be asked again. */
  retryAfter: number | null;
}

/** Store `artistReach`, keyPath 'key' = `${artistId}|${source}`. */
export interface ArtistReachRow {
  key: string;
  artistId: string;
  source: ReachSource;
  status: ReachStatus;
  /**
   * listenbrainz: total_user_count. deezer: nb_fan.
   * wikipedia: en + fr views over the last 12 complete months.
   * null unless status is 'ok'.
   */
  value: number | null;
  /**
   * listenbrainz fills `listens` (total_listen_count), kept so a later version
   * can show listens per listener without re-fetching a source paced at one
   * request per second; wikipedia fills `en`, `fr` and `months`; deezer fills
   * nothing. All optional so a source can gain a field without a version bump.
   */
  extra?: { listens?: number; en?: number; fr?: number; months?: number };
  fetchedAt: number;
  /** Epoch ms before which a 'retryLater' row must not be asked again. */
  retryAfter: number | null;
  /** The exact URL the number came from, kept as provenance. */
  sourceUrl: string;
}

/** The `artistReach` key path: one row per artist per source. */
export function reachKey(artistId: string, source: ReachSource): string {
  return `${artistId}|${source}`;
}

/** Where a tracklist row came from. 'manual' = the owner typed or edited it. */
export type MixRowSource = 'trackid' | 'description' | 'pasted' | 'manual';

export interface TracklistRow {
  /** Seconds from the start of the mix, or null when the source had no time. */
  startSec: number | null;
  /** Seconds; TrackId is the only source with an end, else null. */
  endSec: number | null;
  /** Shown and edited. Seeded from `detected`; the owner may overwrite it. */
  artist: string;
  title: string;
  /** MixesDB / TrackId label, or null. */
  label: string | null;
  source: MixRowSource;
  /**
   * true for an "ID · unidentified · mm:ss – mm:ss" stretch. `artist`/`title`
   * are ignored for a gap row: it links to nothing and matches nothing.
   */
  gap: boolean;
  /**
   * The values the source produced, kept beside the edited ones so an edit is
   * reversible and provenance survives. null for a row the owner added from
   * scratch (source 'manual').
   */
  detected: { artist: string; title: string } | null;
  /** TrackId `referenceCount` (how many corpus mixes hold the track), else null. */
  referenceCount: number | null;
}

/** New store `mixes`, keyPath 'url'. One row per saved mix. */
export interface MixRow {
  /** normalizeMixUrl(pasted) — the store key, and the guard's comparand. */
  url: string;
  /** oEmbed `title` verbatim (it already ends "… by <author>"), or null. */
  title: string | null;
  /** oEmbed `author_name` verbatim, kept for provenance; not rendered beside the title. */
  author: string | null;
  /**
   * The validated player iframe src, or null. Stored so reopening a saved mix
   * restores the player with no network call — it is a derived public URL, not
   * audio, and never carries a token.
   */
  playerSrc: string | null;
  /**
   * TrackId slug when that layer answered, so the provenance link survives a
   * reopen; null when TrackId did not answer. Never derived from the permalink.
   */
  slug: string | null;
  /** Which layers answered, for the provenance line and the saved-mixes list. */
  sources: {
    trackid: boolean;
    description: boolean;
    pasted: boolean;
    /** A "full tracklist at <url>" link found in the description, or null. */
    linkOut: string | null;
  };
  /** The one working list the owner curated, in play order. */
  rows: TracklistRow[];
  /** external_urls.spotify of the playlist last created for this mix, or absent. */
  playlistUrl?: string;
  /** Spotify id of that playlist, or absent. Kept for provenance/debugging. */
  playlistId?: string;
  savedAt: number;
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
  artistIdentity: ArtistIdentityRow[];
  artistReach: ArtistReachRow[];
}

export interface DjDb extends DBSchema {
  playlists: { key: string; value: PlaylistRow };
  tracks: { key: string; value: TrackRow };
  entries: { key: [string, number]; value: EntryRow };
  topItems: { key: string; value: TopItemsRow };
  plays: { key: string; value: PlayRow };
  features: { key: string; value: FeatureRow };
  artistIdentity: { key: string; value: ArtistIdentityRow };
  artistReach: { key: string; value: ArtistReachRow };
  mixes: { key: string; value: MixRow };
  meta: { key: string; value: MetaRow };
}
