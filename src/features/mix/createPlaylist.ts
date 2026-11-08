import type { MixRow, TracklistRow } from '../../db/schema';
// Type-only import: erased under verbatimModuleSyntax, so this file never
// evaluates state.ts (and its auth/browser localStorage) under Vitest. It
// MUST stay `import type`.
import type { CreatePlaylistState, UnmatchedRow } from '../../model/state';
import type { SpotifyClient } from '../../spotify/client';
import type { ApiPlaylist } from '../../spotify/types';
import { QuotaError } from '../../spotify/errors';
import { describeError } from '../../util/errors';
import { sameTrack } from './keepReview';
import { keepStoredAnswers, storedUri } from './spotifyCheck';
import { isIdentified, searchTrack, type RowMatch } from './spotifySearch';

export interface CreatePlaylistDeps {
  client: Pick<SpotifyClient, 'get' | 'post'>;
  onState: (s: CreatePlaylistState) => void;
}

export interface CreatePlaylistInput {
  /** Trimmed, non-empty playlist name (the wrapper builds it). */
  name: string;
  description: string;
  /** The mix's working list, in play order. */
  rows: TracklistRow[];
}

export interface CreatePlaylistOutcome {
  /** Non-null once the playlist exists, so the wrapper can persist it. */
  playlistId: string | null;
  url: string | null;
  /** Set when Spotify answered with its quota lock-out (epoch ms it
   *  lapses), so the wrapper remembers it app-wide before the error
   *  becomes text (S08d). */
  quotaUntil?: number;
  /** Round 005: the year each undated row took from its match, kept even
   *  when a later step failed. Keyed on the input row object. */
  years: Map<TracklistRow, number>;
  /** The input rows with those years applied (`yearFrom: 'spotify'`). */
  rows: TracklistRow[];
}

/**
 * The rows Create playlist adds, in set order (T119, T126, round 010): every
 * identified track still in the list (Delete is how one is left out),
 * candidates included. Gap and "ID" rows never. `validated` is never read:
 * every track is kept. Only the working list decides: the filter chips and
 * the Sort never change it.
 */
export function tracksToAdd(rows: readonly TracklistRow[]): TracklistRow[] {
  return rows.filter(isIdentified);
}

function quotaOf(err: unknown): { quotaUntil?: number } {
  return err instanceof QuotaError ? { quotaUntil: err.retryAt } : {};
}

/**
 * `rows` with the learned years set on the rows that carry none. Matched by
 * object identity, so a row edited since (a new object) is left alone; an
 * unchanged row keeps its identity.
 */
export function applyYears(
  rows: TracklistRow[],
  years: Map<TracklistRow, number>
): TracklistRow[] {
  if (years.size === 0) return rows;
  return rows.map((row) => {
    const year = years.get(row);
    return year === undefined || typeof row.year === 'number'
      ? row
      : { ...row, year, yearFrom: 'spotify' as const };
  });
}

/**
 * `applyYears` on another copy of the rows (S13b M2): a row of `rows` that
 * carries no year takes the year of a searched row naming the same track
 * (`sameTrack` on artist and title only: an ISRC kept from a rejected
 * identification never decides). For the copy the owner saved, or the open
 * rows, during the run (a row whose label was edited is a new object). A row now naming
 * another track, or already dated, is left alone.
 */
export function applyYearsByTrack(
  rows: TracklistRow[],
  years: Map<TracklistRow, number>
): TracklistRow[] {
  if (years.size === 0) return rows;
  const learned = [...years];
  let changed = false;
  const out = rows.map((row) => {
    if (row.gap || typeof row.year === 'number') return row;
    const hit = learned.find(([searched]) =>
      sameTrack(
        { artist: searched.artist, title: searched.title },
        { artist: row.artist, title: row.title }
      )
    );
    if (hit === undefined) return row;
    changed = true;
    return { ...row, year: hit[1], yearFrom: 'spotify' as const };
  });
  return changed ? out : rows;
}

const ADD_BATCH = 100;

/**
 * Resolves every identified row via Search, creates a private playlist, then
 * adds the matched URIs in <=100 batches preserving order. Never throws: every
 * failure ends in an `error` onState (a partial add failure still surfaces the
 * created playlist's url and the count added so far). Returns the id/url so the
 * wrapper can persist them onto the mix, and the years the matches taught,
 * on every exit path (round 005).
 */
export async function runCreatePlaylist(
  deps: CreatePlaylistDeps,
  input: CreatePlaylistInput
): Promise<CreatePlaylistOutcome> {
  const { client, onState } = deps;
  const { name, description, rows } = input;

  // 1. Resolve identified rows in order; inert rows are skipped silently.
  const identified = rows.filter(isIdentified);
  const total = identified.length;
  // Round 011: each track once, at its first place in the set (two rows can
  // name the same track, say a hand link pasted on a second row).
  const uris: string[] = [];
  const seen = new Set<string>();
  const pushUri = (uri: string) => {
    if (seen.has(uri)) return;
    seen.add(uri);
    uris.push(uri);
  };
  const unmatched: UnmatchedRow[] = [];
  const years = new Map<TracklistRow, number>();
  const outcome = (
    playlistId: string | null,
    url: string | null,
    err?: unknown
  ): CreatePlaylistOutcome => ({
    playlistId,
    url,
    ...quotaOf(err),
    years,
    rows: applyYears(rows, years),
  });
  onState({ status: 'resolving', done: 0, total });
  let done = 0;
  for (const row of identified) {
    // Check on Spotify already found it (T117): no search again.
    const stored = storedUri(row);
    if (stored !== null) {
      pushUri(stored);
      onState({ status: 'resolving', done: ++done, total });
      continue;
    }
    let match: RowMatch;
    try {
      match = await searchTrack(client, row);
    } catch (err) {
      onState({ status: 'error', message: describeError(err) });
      return outcome(null, null, err);
    }
    // A dated row keeps its year (Shazam's or a catalogue's).
    if (match.year !== null && typeof row.year !== 'number')
      years.set(row, match.year);
    if (match.uri !== null) pushUri(match.uri);
    else
      unmatched.push({
        artist: row.artist,
        title: row.title,
        startSec: row.startSec,
        // An edited row names a different track from the one Shazam heard.
        shazamUrl:
          row.source === 'tracklistify' ? (row.shazamUrl ?? null) : null,
      });
    onState({ status: 'resolving', done: ++done, total });
  }

  // 2. Create the private playlist.
  onState({ status: 'creating' });
  let playlist: ApiPlaylist;
  try {
    playlist = await client.post<ApiPlaylist>('/me/playlists', {
      name,
      public: false,
      description,
    });
  } catch (err) {
    onState({ status: 'error', message: describeError(err) });
    return outcome(null, null, err);
  }
  const playlistId = playlist.id;
  const url = playlist.external_urls?.spotify ?? null;

  // 3. Add the matched URIs in <=100 batches, in order. An empty match set
  // still leaves the private playlist created (the owner asked for it).
  let added = 0;
  if (uris.length > 0) {
    onState({ status: 'adding' });
    for (let i = 0; i < uris.length; i += ADD_BATCH) {
      const batch = uris.slice(i, i + ADD_BATCH);
      try {
        await client.post(`/playlists/${playlistId}/items`, { uris: batch });
      } catch (err) {
        // The playlist exists: surface its link and the count added so far,
        // never swallowed. The wrapper still persists the link (returns url).
        onState({
          status: 'error',
          message: describeError(err),
          url,
          added,
          total,
        });
        return outcome(playlistId, url, err);
      }
      added += batch.length;
    }
  }

  // 4. Done.
  onState({ status: 'done', name, url, added: uris.length, total, unmatched });
  return outcome(playlistId, url);
}

/**
 * The mix Create playlist saves when it ends (S13 N1). A copy the owner
 * saved after the tap wins whole (edits, removed tracks): Create
 * adds only its playlist. Otherwise the rows of the tap, with the check
 * answers already stored put back (`keepStoredAnswers`).
 */
export function rowAfterCreate(
  tapped: MixRow,
  stored: MixRow | undefined,
  tapAt: number,
  playlist: { playlistUrl?: string; playlistId: string },
  now: number
): MixRow {
  if (stored !== undefined && stored.savedAt >= tapAt) {
    return { ...stored, ...playlist, savedAt: now };
  }
  return {
    ...tapped,
    rows: keepStoredAnswers(tapped.rows, stored?.rows ?? []),
    ...playlist,
    savedAt: now,
  };
}
