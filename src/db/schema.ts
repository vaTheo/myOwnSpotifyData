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
  /** Round 006 fix: set once the playlist was downloaded with album release
   *  dates; a playlist without it is downloaded again even if unchanged. */
  withYears?: true;
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
  /** Round 005: the year of `album.release_date` as the playlist sync
   *  downloaded it; absent before that round or when Spotify had none. */
  albumYear?: number;
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
  /** Round 005: the year of the album's release date; absent when unknown. */
  albumYear?: number;
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
  /** Round 005: ReccoBeats' own track id (the album lookup needs it). */
  rid?: string;
}

/** Round 005: the earliest album release year ReccoBeats lists for a track;
 *  `year: null` = asked, none found (asked again after the not-found TTL). */
export interface ReleaseYearValue {
  year: number | null;
  checkedAt: number;
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
  /** Round 005: original release year from ReccoBeats' album list. */
  releaseYear?: ReleaseYearValue;
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
export type MixRowSource =
  'trackid' | 'description' | 'pasted' | 'manual' | 'tracklistify';

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
  /** Tracklistify's 0-100 match confidence, or absent/null for every other
   *  source and for rows saved before this field existed. Display only —
   *  no threshold filters on it. */
  confidence?: number | null;
  /** ISRC from Tracklistify's metadata, or absent/null. Lets
   *  spotifySearch.ts try an exact-recording Search query first. */
  isrc?: string | null;
  /** Tracklistify's `https://www.shazam.com/…` page for the identified track,
   *  or absent/null. Shown beside a track Spotify did not find. */
  shazamUrl?: string | null;
  /** Round 003: how a worker row was found when not on the first listen —
   *  'replay' (second pass, at `speedPercent`), 'clue' (a candidate named by a
   *  comment, a chapter or the description, never heard). Absent otherwise. */
  origin?: 'replay' | 'clue';
  /** Round 004: how many 12 s clips matched this heard row (first and
   *  second pass); its best score is `confidence`. Absent for candidates
   *  and rows from before. */
  hits?: number;
  /** Second-pass speed correction in percent (+4, −4, or 0). */
  speedPercent?: number;
  /** Round 005: release year (whole year, 1900..now+1) or absent. */
  year?: number;
  /** Where `year` came from: Shazam, a catalogue by ISRC (worker), or the
   *  album of the track Create playlist matched. */
  yearFrom?: 'shazam' | 'catalogue' | 'spotify';
  /** The clue a candidate came from. */
  clue?: Clue;
  /** Gap rows from the worker: the clues placed around this gap. */
  clues?: Clue[];
  /** Spec 003 T118: the owner validated the track. Absent or false: To
   *  review. A later worker result keeps it (T125). */
  validated?: boolean;
  /** Spec 003 T117: what Check on Spotify found for this row, or absent
   *  when never checked. An edit of the artist or title clears it. */
  spotify?: SpotifyCheck;
  /** When Check on Spotify answered for this row, epoch ms. */
  checkedAt?: number;
}

/** Check on Spotify's answer for one row: the track, or none found. */
export type SpotifyCheck = { id: string; url: string } | 'not-found';

/** A scan track the owner removed, so a later result does not bring it
 *  back (spec 003 T125, owner's D1). */
export interface RemovedTrack {
  artist: string;
  title: string;
  isrc: string | null;
}

/** What the worker said about its run (spec 003 T124, owner's D3), from
 *  the result's `mix_info`. Every part is optional. */
export interface MixRun {
  /** The second listen: places replayed, tracks found, why it stopped. */
  secondPass?: { places: number; found: number; stopped: string | null };
  /** The scan resumed an earlier one, keeping this many clips. */
  resumed?: { probesKept: number };
  /** The scan stopped before the end: where (hh:mm:ss) and why. */
  stoppedEarly?: { at: string; reason: string };
  /** The worker's warnings, such as "refuses often". */
  warnings?: string[];
}

/** A description line, chapter or comment the worker read (round 003).
 *  Third-party text: always rendered as plain text. */
export interface Clue {
  /** Seconds into the set, or null for a set-wide line. */
  atSec: number | null;
  author: string;
  text: string;
  kind: 'comment' | 'chapter' | 'description';
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
    /** True for a mix whose working list came from a Tracklistify import.
     *  Absent (not false) on every row saved before this feature and on
     *  every SoundCloud-origin mix. */
    tracklistify?: boolean;
    /** True once at least one row came from the worker on the owner's
     *  computer (specs/002-mix-analysis-worker). Absent before that round. */
    worker?: boolean;
  };
  /** The one working list the owner curated, in play order. */
  rows: TracklistRow[];
  /** external_urls.spotify of the playlist last created for this mix, or absent. */
  playlistUrl?: string;
  /** Spotify id of that playlist, or absent. Kept for provenance/debugging. */
  playlistId?: string;
  /** The last identify request whose rows were merged here, or absent. */
  identifyJobId?: string;
  /** That request's `finished_at`, epoch ms, or absent. */
  identifiedAt?: number;
  /** Round 003: set-wide clues from the worker (a tracklist without times in
   *  the description or a comment), shown once above the tracklist. */
  clues?: Clue[];
  /** The last worker result's run (T124); replaced with each result. */
  run?: MixRun;
  /** Scan tracks the owner removed, oldest first, at most 500 (T125). */
  removed?: RemovedTrack[];
  savedAt: number;
}

export interface MetaRow {
  name: string;
  value: unknown;
}

/** What this device last saw on the server, per dataset (server sync, ADR-08). */
export const SERVER_STAMPS_META = 'serverStamps';
export type ServerStamps = Partial<
  Record<
    'library' | 'history' | 'features' | 'reach',
    { fetchedAt: number; generation: number; rows: number }
  >
>;
/** Datasets changed locally and not yet pushed; cleared after a successful push. */
export const SERVER_PENDING_META = 'serverPending';
export type ServerPending = Partial<
  Record<'library' | 'history' | 'features' | 'reach' | 'mixes', true>
>;
/** The last successful push or pull, shown in Settings. */
export const SERVER_LAST_SYNC_META = 'serverLastSync';
/**
 * The identify requests this device last saw on the server, per canonical
 * link, newest first, 20 at most (worker round, FR-003). Written by the pull;
 * deleted on server sign-out and on Remove server data.
 */
export const MIX_JOBS_META = 'mixJobs';
export interface MixJobView {
  id: string;
  status: 'queued' | 'claimed' | 'done' | 'failed';
  createdAt: number;
  claimedBy: string | null;
  claimedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  appliedAt: number | null;
  /** Local only: the result failed the safety check and was not merged. */
  rejected?: true;
  /** Round 004: the worker's last progress on a running request. */
  progress?: {
    step: string;
    done: number | null;
    total: number | null;
    percent: number | null;
    minutesLeft: number | null;
    pausedUntil: number | null;
    warning: string | null;
    at: number | null;
  } | null;
  /** Round 004: queue order (Move to top raises it). */
  priority?: number;
  /** Round 004: when Stop was asked, epoch ms, or null. */
  stopRequestedAt?: number | null;
}
export type MixJobs = Record<string, MixJobView[]>;
/** Mixes deleted here and not yet pushed as tombstones (server sync, US2). */
export const MIX_DELETED_META = 'mixDeleted';
export interface MixDeletedEntry {
  url: string;
  deletedAt: number;
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
