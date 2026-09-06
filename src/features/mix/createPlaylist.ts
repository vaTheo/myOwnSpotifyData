import type { TracklistRow } from '../../db/schema';
// Type-only import: erased under verbatimModuleSyntax, so this file never
// evaluates state.ts (and its auth/browser localStorage) under Vitest. It
// MUST stay `import type`.
import type { CreatePlaylistState, UnmatchedRow } from '../../model/state';
import type { SpotifyClient } from '../../spotify/client';
import type { ApiPlaylist } from '../../spotify/types';
import { describeError } from '../../util/errors';
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
    let match: RowMatch;
    try {
      match = await searchTrack(client, row);
    } catch (err) {
      onState({ status: 'error', message: describeError(err) });
      return { playlistId: null, url: null };
    }
    if (match.uri !== null) uris.push(match.uri);
    else unmatched.push({ artist: row.artist, title: row.title });
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
    return { playlistId: null, url: null };
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
        onState({ status: 'error', message: describeError(err), url, added });
        return { playlistId, url };
      }
      added += batch.length;
    }
  }

  // 4. Done.
  onState({ status: 'done', name, url, added: uris.length, total, unmatched });
  return { playlistId, url };
}
