import type { MixRow, TracklistRow } from '../../db/schema';
// Type-only import: erased under verbatimModuleSyntax, so this file never
// evaluates state.ts (and its auth/browser localStorage) under Vitest. It
// MUST stay `import type`.
import type { CreatePlaylistState, UnmatchedRow } from '../../model/state';
import type { SpotifyClient } from '../../spotify/client';
import type { ApiPlaylist } from '../../spotify/types';
import { QuotaError } from '../../spotify/errors';
import { describeError } from '../../util/errors';
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
}

/** Which tracks Create playlist adds (spec 003 §12, owner's D6). */
export type CreateChoice = 'validated' | 'all';

/**
 * The rows Create playlist adds, in set order (T119, T126, owner's D6).
 * **Validated only**: validated tracks, a candidate included once validated.
 * **All tracks**: every track still in the list (a removed one is gone from
 * it), candidates included. Gap and "ID" rows never. Only the working list
 * decides: the filter chips and the Sort never change it.
 */
export function tracksToAdd(
  rows: readonly TracklistRow[],
  choice: CreateChoice
): TracklistRow[] {
  return rows.filter(
    (r) => isIdentified(r) && (choice === 'all' || r.validated === true)
  );
}

/** Validated only once any track is validated, else All tracks. */
export function defaultChoice(rows: readonly TracklistRow[]): CreateChoice {
  return rows.some((r) => !r.gap && r.validated === true) ? 'validated' : 'all';
}

function quotaOf(err: unknown): { quotaUntil?: number } {
  return err instanceof QuotaError ? { quotaUntil: err.retryAt } : {};
}

const ADD_BATCH = 100;

/**
 * Resolves every identified row via Search, creates a private playlist, then
 * adds the matched URIs in <=100 batches preserving order. Never throws: every
 * failure ends in an `error` onState (a partial add failure still surfaces the
 * created playlist's url and the count added so far). Returns the id/url so the
 * wrapper can persist them onto the mix.
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
  const uris: string[] = [];
  const unmatched: UnmatchedRow[] = [];
  onState({ status: 'resolving', done: 0, total });
  let done = 0;
  for (const row of identified) {
    // Check on Spotify already found it (T117): no search again.
    const stored = storedUri(row);
    if (stored !== null) {
      uris.push(stored);
      onState({ status: 'resolving', done: ++done, total });
      continue;
    }
    let match: RowMatch;
    try {
      match = await searchTrack(client, row);
    } catch (err) {
      onState({ status: 'error', message: describeError(err) });
      return { playlistId: null, url: null, ...quotaOf(err) };
    }
    if (match.uri !== null) uris.push(match.uri);
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
    return { playlistId: null, url: null, ...quotaOf(err) };
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
        return { playlistId, url, ...quotaOf(err) };
      }
      added += batch.length;
    }
  }

  // 4. Done.
  onState({ status: 'done', name, url, added: uris.length, total, unmatched });
  return { playlistId, url };
}

/**
 * The mix Create playlist saves when it ends (S13 N1). A copy the owner
 * saved after the tap wins whole (validates, edits, removed tracks): Create
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
