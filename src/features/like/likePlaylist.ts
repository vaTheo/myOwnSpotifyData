import { hasScope, type Session } from '../../auth/session';
import type { Model } from '../../model/aggregate';
// Type-only import: erased under verbatimModuleSyntax, so this file never
// evaluates state.ts (and its auth/browser localStorage) under Vitest. It
// MUST stay `import type`.
import type { LikeState } from '../../model/state';
import type { SpotifyClient } from '../../spotify/client';
import { describeError } from '../../util/errors';

/** Spotify's cap on both `/me/library` endpoints. */
export const LIBRARY_BATCH = 40;

const UNEXPECTED = 'Spotify returned an unexpected answer';

/** Checking needs the read scope, saving the modify scope. */
export function canLikeTracks(session: Session | null): boolean {
  return (
    hasScope(session, 'user-library-read') &&
    hasScope(session, 'user-library-modify')
  );
}

export interface LikeCandidates {
  /** Distinct `spotify:track:` URIs, in playlist order. */
  uris: string[];
  /** Entries left out: local files, non-track items, missing track rows. */
  skipped: number;
}

/**
 * The songs of a synced playlist that can be liked. Only `spotify:track:` URIs:
 * `/me/library` also saves episodes, albums and playlists, and one of those
 * would land somewhere other than Liked Songs. A repeat is sent once and is
 * not counted as skipped.
 */
export function likeCandidates(
  model: Pick<Model, 'entriesByPlaylist' | 'tracksByKey'>,
  playlistId: string
): LikeCandidates {
  const entries = [...(model.entriesByPlaylist.get(playlistId) ?? [])].sort(
    (a, b) => a.position - b.position
  );
  const seen = new Set<string>();
  const uris: string[] = [];
  let skipped = 0;
  for (const entry of entries) {
    const uri = model.tracksByKey.get(entry.trackKey)?.uri;
    if (!uri || !uri.startsWith('spotify:track:')) {
      skipped += 1;
      continue;
    }
    if (seen.has(uri)) continue;
    seen.add(uri);
    uris.push(uri);
  }
  return { uris, skipped };
}

export interface LikeDeps {
  client: Pick<SpotifyClient, 'get' | 'put'>;
  /** Asked once, with the real count, before anything is written. */
  confirm: (toLike: number, total: number) => boolean;
  onState: (s: LikeState) => void;
}

export interface LikeInput {
  playlistId: string;
  uris: string[];
  skipped: number;
}

function isAnswer(value: unknown, length: number): value is boolean[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((v) => typeof v === 'boolean')
  );
}

/**
 * Checks which songs are already liked, asks, then likes the rest, 40 per
 * request in playlist order. Never throws: every failure ends in an `error`
 * state. A malformed check answer stops the run rather than guessing, since a
 * wrong zip would skip or re-save the wrong songs.
 */
export async function runLikePlaylist(
  deps: LikeDeps,
  input: LikeInput
): Promise<void> {
  const { client, confirm, onState } = deps;
  const { playlistId, uris, skipped } = input;
  const total = uris.length;

  // 1. Check, in batches; `contains` answers booleans in the order sent.
  const toLike: string[] = [];
  onState({ status: 'checking', playlistId, done: 0, total });
  for (let i = 0; i < total; i += LIBRARY_BATCH) {
    const batch = uris.slice(i, i + LIBRARY_BATCH);
    let answer: unknown;
    try {
      answer = await client.get<unknown>('/me/library/contains', {
        uris: batch.join(','),
      });
    } catch (err) {
      onState({
        status: 'error',
        playlistId,
        message: `Could not check your Liked Songs: ${describeError(err)}`,
      });
      return;
    }
    if (!isAnswer(answer, batch.length)) {
      onState({
        status: 'error',
        playlistId,
        message: `Could not check your Liked Songs: ${UNEXPECTED}`,
      });
      return;
    }
    answer.forEach((saved, j) => {
      if (!saved) toLike.push(batch[j]);
    });
    onState({ status: 'checking', playlistId, done: i + batch.length, total });
  }

  // 2. Nothing to do, or the owner says no: nothing is written.
  const already = total - toLike.length;
  if (toLike.length === 0) {
    onState({ status: 'done', playlistId, liked: 0, already, skipped });
    return;
  }
  if (!confirm(toLike.length, total)) {
    onState({ status: 'idle' });
    return;
  }

  // 3. Like, in batches, in playlist order.
  let liked = 0;
  onState({ status: 'liking', playlistId, done: 0, total: toLike.length });
  for (let i = 0; i < toLike.length; i += LIBRARY_BATCH) {
    const batch = toLike.slice(i, i + LIBRARY_BATCH);
    try {
      await client.put('/me/library', { uris: batch.join(',') });
    } catch (err) {
      onState({
        status: 'error',
        playlistId,
        message: describeError(err),
        liked,
        toLike: toLike.length,
      });
      return;
    }
    liked += batch.length;
    onState({
      status: 'liking',
      playlistId,
      done: liked,
      total: toLike.length,
    });
  }
  onState({ status: 'done', playlistId, liked, already, skipped });
}

function count(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}

/** The confirm text; `total` is the distinct Spotify songs checked. */
export function likeQuestion(toLike: number, total: number): string {
  const one = toLike === 1;
  return `${toLike.toLocaleString()} of ${count(total, 'song')} from your last sync ${one ? "isn't" : "aren't"} in your Liked Songs yet. Like ${one ? 'it' : 'them'}?`;
}

/** The done line, each part only when it is not zero. */
export function likeSummary(s: {
  liked: number;
  already: number;
  skipped: number;
}): string {
  const parts: string[] = [];
  if (s.liked > 0) {
    parts.push(`Liked ${count(s.liked, 'song')}`);
    if (s.already > 0)
      parts.push(
        `${s.already.toLocaleString()} ${s.already === 1 ? 'was' : 'were'} already liked`
      );
  } else if (s.already === 1) {
    parts.push('Your 1 song is already in your Liked Songs');
  } else if (s.already > 0) {
    parts.push(
      `All ${count(s.already, 'song')} are already in your Liked Songs`
    );
  } else {
    parts.push('No Spotify songs to like');
  }
  if (s.skipped > 0) parts.push(`${count(s.skipped, 'local file')} skipped`);
  return parts.join(' · ');
}

/** A write-phase error names how far it got. */
export function likeErrorText(s: {
  message: string;
  liked?: number;
  toLike?: number;
}): string {
  if (s.liked === undefined || s.toLike === undefined) return s.message;
  return `Liked ${s.liked.toLocaleString()} of ${s.toLike.toLocaleString()}, then: ${s.message}`;
}
