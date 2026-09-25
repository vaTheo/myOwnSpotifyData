# Like All Songs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Like all songs" button on the Playlist screen that saves every not-yet-liked Spotify song of the synced playlist to the owner's Liked Songs, after a check and a confirm with the exact count.

**Architecture:** A pure, unit-tested runner (`src/features/like/likePlaylist.ts`) drives `GET /me/library/contains` then `PUT /me/library` in batches of 40 through the existing queued Spotify client (which gains `put` and empty-body parsing). `state.ts` wires it to a `likeState` signal with a thin `startLikePlaylist`, and `Playlist.tsx` renders the button and its status lines inline.

**Tech Stack:** Preact + @preact/signals, TypeScript 6.0, Vitest (Node env), yarn classic.

**Spec:** `docs/superpowers/specs/2026-09-25-like-playlist-design.md`

## Global Constraints

- Only `user-library-read` and `user-library-modify` are added to `SCOPES`.
- Both library endpoints take at most **40** URIs per request, in the `uris` query parameter, comma-separated.
- Only URIs starting with `spotify:track:` are ever sent.
- Candidates come from the local synced entries; the feature makes **no** playlist read.
- Nothing runs on load; not part of `jobsBusy()`; never calls `loadFromDb()`; every failure inline on the Playlist screen, never a banner.
- Relative imports carry no extension; Prettier style (single quotes, semicolons, 80 cols).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A playlist holding only local files → no request at all, "No Spotify songs to like" plus the skipped count (Task 3 test `no Spotify songs`).
2. `contains` answering fewer booleans than sent, or a non-array → error, nothing written (Task 3 test `malformed answer`).
3. The same song twice in a playlist → sent once, not counted as skipped (Task 3 test `duplicates`).
4. A 5xx on the save call → retried like a GET, since saving is idempotent (Task 1 test `retries a 5xx`).
5. A write failing on the second batch → the error reports the 40 already liked (Task 3 test `write failure`).

---

### Task 1: `client.put` and empty-body responses

**Files:**

- Modify: `src/spotify/client.ts`
- Test: `src/spotify/client.test.ts`

**Interfaces:**

- Produces: `SpotifyClient.put<T = void>(path: string, query?: Query): Promise<T>`; any `request` success with an empty body resolves `undefined`.

- [ ] **Step 1: Write the failing tests** — append to `client.test.ts`:

```ts
describe('put', () => {
  function empty(status = 200): Response {
    return new Response(null, { status });
  }

  it('sends PUT with the query, no body and no content-type', async () => {
    const { client, fetchFn } = setup([() => empty()]);
    await expect(
      client.put('/me/library', { uris: 'spotify:track:a,spotify:track:b' })
    ).resolves.toBeUndefined();
    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://api.spotify.com/v1/me/library?uris=spotify%3Atrack%3Aa%2Cspotify%3Atrack%3Ab'
    );
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('PUT');
    expect(init.body).toBeUndefined();
    expect(
      (init.headers as Record<string, string>)['Content-Type']
    ).toBeUndefined();
    expect(authHeader(fetchFn, 0)).toBe('Bearer tok');
  });

  it('refreshes once on 401', async () => {
    const { client, fetchFn } = setup([() => json({}, 401), () => empty()]);
    await expect(client.put('/me/library')).resolves.toBeUndefined();
    expect(authHeader(fetchFn, 1)).toBe('Bearer fresh');
  });

  it('retries a 5xx, unlike POST (saving is idempotent)', async () => {
    const { client, fetchFn, sleep } = setup([
      () => json({}, 503),
      () => empty(),
    ]);
    await expect(client.put('/me/library')).resolves.toBeUndefined();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});

describe('empty success bodies', () => {
  it('resolves undefined for a GET answered 200 with no body', async () => {
    const { client } = setup([() => new Response(null, { status: 200 })]);
    await expect(client.get('/x')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `yarn test src/spotify/client.test.ts`
Expected: FAIL — `client.put is not a function`, and the GET test fails with a JSON `SyntaxError`.

- [ ] **Step 3: Implement** in `client.ts`:

Add to the `SpotifyClient` interface, after `post`:

```ts
  put<T = void>(path: string, query?: Query): Promise<T>;
```

Replace the comment above `const isPost` with:

```ts
    // POST is not idempotent: a retried create could make a second playlist the
    // app cannot detect, and a retried add would duplicate tracks. So on a 5xx
    // or a network error POST throws at once; only 401-refresh-once and a short
    // 429 (both pre-mutation) are retried. GET and PUT keep the 5xx/network
    // backoff: PUT /me/library saves a set, and saving it twice changes nothing.
```

Replace `if (res.ok) return (await res.json()) as T;` with:

```ts
      if (res.ok) {
        // PUT /me/library answers 200 with an empty body.
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }
```

Add after `post`:

```ts
  function put<T = void>(path: string, query?: Query): Promise<T> {
    return enqueue(() => request<T>(buildUrl(path, query), { method: 'PUT' }));
  }
```

and return `{ get, post, put, pages }`.

- [ ] **Step 4: Run tests and typecheck**

Run: `yarn test src/spotify/client.test.ts && yarn typecheck`
Expected: PASS. If typecheck flags a hand-built `SpotifyClient` object elsewhere, add a `put` to it.

- [ ] **Step 5: Commit**

```bash
git add src/spotify/client.ts src/spotify/client.test.ts
git commit -m "feat(spotify): client.put, retried like GET, and empty success bodies"
```

---

### Task 2: library scopes and `hasScope`

**Files:**

- Modify: `src/auth/session.ts`, `src/features/mix/spotifySearch.ts`
- Test: `src/auth/session.test.ts`

**Interfaces:**

- Produces: `hasScope(session: Session | null, scope: string): boolean` exported from `src/auth/session.ts`.

- [ ] **Step 1: Write the failing tests** — in `session.test.ts` change the literal scope assertion (around line 87) to:

```ts
    expect(url.searchParams.get('scope')).toBe(
      'user-top-read playlist-read-private playlist-modify-private user-library-read user-library-modify'
    );
```

and append (adding `hasScope` and `type Session` to the import from `./session`):

```ts
describe('hasScope', () => {
  const s = (scope: string): Session => ({
    accessToken: 'a',
    expiresAt: 0,
    refreshToken: 'r',
    scope,
  });
  it('matches a whole space-separated token', () => {
    expect(hasScope(s('a user-library-read b'), 'user-library-read')).toBe(
      true
    );
  });
  it('never matches a substring', () => {
    expect(hasScope(s('user-library-read-x'), 'user-library-read')).toBe(
      false
    );
  });
  it('is false without a session', () => {
    expect(hasScope(null, 'user-library-read')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `yarn test src/auth/session.test.ts`
Expected: FAIL — `hasScope` is not exported; the scope literal differs.

- [ ] **Step 3: Implement.** In `session.ts`:

```ts
export const SCOPES =
  'user-top-read playlist-read-private playlist-modify-private user-library-read user-library-modify';
```

After the `Session` interface:

```ts
/**
 * True when the granted scope carries `scope` as a whole token. Split on
 * space, never `String.includes`, so a scope that merely contains the name
 * (e.g. `playlist-modify-private-xyz`) can never satisfy it.
 */
export function hasScope(session: Session | null, scope: string): boolean {
  return session !== null && session.scope.split(' ').includes(scope);
}
```

In `spotifySearch.ts`, import `hasScope` (value) alongside `type Session`, and make the body of `canCreatePlaylists` `return hasScope(session, 'playlist-modify-private');`, keeping its doc comment's first sentence and pointing at `hasScope` for the whole-token rule.

- [ ] **Step 4: Run tests**

Run: `yarn test src/auth src/features/mix/spotifySearch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/session.ts src/auth/session.test.ts src/features/mix/spotifySearch.ts
git commit -m "feat(auth): request the two library scopes; hasScope whole-token check"
```

---

### Task 3: the like runner

**Files:**

- Create: `src/features/like/likePlaylist.ts`
- Modify: `src/model/state.ts` (add the `LikeState` type only)
- Test: `src/features/like/likePlaylist.test.ts`

**Interfaces:**

- Consumes: `SpotifyClient.get`/`put` (Task 1), `hasScope` (Task 2).
- Produces: `LIBRARY_BATCH = 40`; `canLikeTracks(session: Session | null): boolean`; `likeCandidates(model: Pick<Model, 'entriesByPlaylist' | 'tracksByKey'>, playlistId: string): { uris: string[]; skipped: number }`; `runLikePlaylist(deps: LikeDeps, input: LikeInput): Promise<void>`; `likeQuestion(toLike: number, total: number): string`; `likeSummary(s: { liked: number; already: number; skipped: number }): string`; `likeErrorText(s: { message: string; liked?: number; toLike?: number }): string`; and in `state.ts` the `LikeState` union.

- [ ] **Step 1: Add the `LikeState` type** to `state.ts`, just after `CreatePlaylistState` and before `createPlaylistState`:

```ts
/**
 * The Playlist screen's like-all-songs job (like-playlist spec §3). Every arm
 * but idle names its playlist so the lines never show on another one.
 * `liked`/`toLike` on `error` are set only when the write phase failed.
 */
export type LikeState =
  | { status: 'idle' }
  | { status: 'needScope'; playlistId: string }
  | { status: 'checking'; playlistId: string; done: number; total: number }
  | { status: 'liking'; playlistId: string; done: number; total: number }
  | {
      status: 'done';
      playlistId: string;
      liked: number;
      already: number;
      skipped: number;
    }
  | {
      status: 'error';
      playlistId: string;
      message: string;
      liked?: number;
      toLike?: number;
    };
```

- [ ] **Step 2: Write the failing tests** — `src/features/like/likePlaylist.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../../auth/session';
import type { EntryRow, TrackRow } from '../../db/schema';
import type { LikeState } from '../../model/state';
import type { Query, SpotifyClient } from '../../spotify/client';
import { ApiError } from '../../spotify/errors';
import {
  canLikeTracks,
  likeCandidates,
  likeErrorText,
  likeQuestion,
  likeSummary,
  runLikePlaylist,
} from './likePlaylist';

function track(key: string, uri: string): TrackRow {
  return {
    key,
    id: uri.startsWith('spotify:track:') ? key : null,
    uri,
    name: key,
    artists: [],
    album: '',
    durationMs: 0,
    isrc: null,
    spotifyUrl: null,
    isLocal: uri.startsWith('spotify:local:'),
  };
}
function entry(position: number, trackKey: string): EntryRow {
  return { playlistId: 'P', position, trackKey, addedAt: null };
}
function model(entries: EntryRow[], tracks: TrackRow[]) {
  return {
    entriesByPlaylist: new Map([['P', entries]]),
    tracksByKey: new Map(tracks.map((t) => [t.key, t])),
  };
}
const uri = (n: number) => `spotify:track:t${n}`;
const uris = (n: number) => Array.from({ length: n }, (_, i) => uri(i));

describe('canLikeTracks', () => {
  const s = (scope: string): Session => ({
    accessToken: 'a',
    expiresAt: 0,
    refreshToken: 'r',
    scope,
  });
  it('needs both library scopes', () => {
    expect(canLikeTracks(s('user-library-read user-library-modify'))).toBe(
      true
    );
    expect(canLikeTracks(s('user-library-modify'))).toBe(false);
    expect(canLikeTracks(s('user-library-read'))).toBe(false);
    expect(canLikeTracks(null)).toBe(false);
  });
});

describe('likeCandidates', () => {
  it('keeps playlist order and only spotify:track: URIs', () => {
    const m = model(
      [entry(2, 'b'), entry(0, 'a'), entry(1, 'loc'), entry(3, 'ep')],
      [
        track('a', 'spotify:track:a'),
        track('b', 'spotify:track:b'),
        track('loc', 'spotify:local:A:Al:T:100'),
        track('ep', 'spotify:episode:e'),
      ]
    );
    expect(likeCandidates(m, 'P')).toEqual({
      uris: ['spotify:track:a', 'spotify:track:b'],
      skipped: 2,
    });
  });

  it('duplicates: sends a song once and does not count it as skipped', () => {
    const m = model(
      [entry(0, 'a'), entry(1, 'a')],
      [track('a', 'spotify:track:a')]
    );
    expect(likeCandidates(m, 'P')).toEqual({
      uris: ['spotify:track:a'],
      skipped: 0,
    });
  });

  it('skips an entry whose track row is missing, and an unknown playlist', () => {
    const m = model([entry(0, 'gone')], []);
    expect(likeCandidates(m, 'P')).toEqual({ uris: [], skipped: 1 });
    expect(likeCandidates(m, 'nope')).toEqual({ uris: [], skipped: 0 });
  });
});

/** `saved` holds the URIs already liked; `putRejectOnCall` is 1-based. */
function setup(opts: {
  saved?: string[];
  getReject?: unknown;
  answer?: unknown;
  putRejectOnCall?: number;
  confirm?: boolean;
}) {
  const saved = new Set(opts.saved ?? []);
  const get = vi.fn(async (_path: string, query?: Query) => {
    if (opts.getReject) throw opts.getReject;
    if (opts.answer !== undefined) return opts.answer;
    return String(query?.uris)
      .split(',')
      .map((u) => saved.has(u));
  });
  let putCalls = 0;
  const put = vi.fn(async () => {
    putCalls += 1;
    if (putCalls === opts.putRejectOnCall)
      throw new ApiError(503, 'Spotify server error 503');
  });
  const confirm = vi.fn(() => opts.confirm ?? true);
  const states: LikeState[] = [];
  const deps = {
    client: { get, put } as unknown as Pick<SpotifyClient, 'get' | 'put'>,
    confirm,
    onState: (s: LikeState) => states.push(s),
  };
  return { deps, get, put, confirm, states, last: () => states.at(-1) };
}
const batchOf = (call: unknown[]) => String((call[1] as Query).uris);

describe('runLikePlaylist', () => {
  it('checks in batches of 40 and zips the answer by index', async () => {
    const t = setup({ saved: [uri(1), uri(41), uri(84)] });
    await runLikePlaylist(t.deps, { playlistId: 'P', uris: uris(85), skipped: 0 });
    expect(t.get.mock.calls.map((c) => batchOf(c).split(',').length)).toEqual([
      40, 40, 5,
    ]);
    expect(t.get.mock.calls[0][0]).toBe('/me/library/contains');
    expect(t.confirm).toHaveBeenCalledWith(82, 85);
    const sent = t.put.mock.calls.flatMap((c) =>
      batchOf(c as unknown[]).split(',')
    );
    expect(sent).toEqual(uris(85).filter((u) => ![uri(1), uri(41), uri(84)].includes(u)));
    expect(t.put.mock.calls.map((c) => batchOf(c as unknown[]).split(',').length)).toEqual([40, 40, 2]);
    expect((t.put.mock.calls[0] as unknown[])[0]).toBe('/me/library');
    expect(t.last()).toEqual({
      status: 'done',
      playlistId: 'P',
      liked: 82,
      already: 3,
      skipped: 0,
    });
  });

  it('reports progress for both phases', async () => {
    const t = setup({});
    await runLikePlaylist(t.deps, { playlistId: 'P', uris: uris(45), skipped: 1 });
    expect(t.states).toContainEqual({ status: 'checking', playlistId: 'P', done: 40, total: 45 });
    expect(t.states).toContainEqual({ status: 'liking', playlistId: 'P', done: 40, total: 45 });
  });

  it('all liked: no confirm and no write', async () => {
    const t = setup({ saved: uris(3) });
    await runLikePlaylist(t.deps, { playlistId: 'P', uris: uris(3), skipped: 2 });
    expect(t.confirm).not.toHaveBeenCalled();
    expect(t.put).not.toHaveBeenCalled();
    expect(t.last()).toEqual({ status: 'done', playlistId: 'P', liked: 0, already: 3, skipped: 2 });
  });

  it('no Spotify songs: no request at all', async () => {
    const t = setup({});
    await runLikePlaylist(t.deps, { playlistId: 'P', uris: [], skipped: 4 });
    expect(t.get).not.toHaveBeenCalled();
    expect(t.put).not.toHaveBeenCalled();
    expect(t.last()).toEqual({ status: 'done', playlistId: 'P', liked: 0, already: 0, skipped: 4 });
  });

  it('cancel writes nothing and returns to idle', async () => {
    const t = setup({ confirm: false });
    await runLikePlaylist(t.deps, { playlistId: 'P', uris: uris(2), skipped: 0 });
    expect(t.put).not.toHaveBeenCalled();
    expect(t.last()).toEqual({ status: 'idle' });
  });

  it('a check failure writes nothing', async () => {
    const t = setup({ getReject: new ApiError(403, 'Insufficient client scope') });
    await runLikePlaylist(t.deps, { playlistId: 'P', uris: uris(2), skipped: 0 });
    expect(t.put).not.toHaveBeenCalled();
    expect(t.last()).toEqual({
      status: 'error',
      playlistId: 'P',
      message: 'Could not check your Liked Songs: Insufficient client scope',
    });
  });

  it.each([
    ['a short array', [false]],
    ['a non-array', { saved: true }],
    ['non-booleans', [0, 1]],
  ])('malformed answer (%s) writes nothing', async (_label, answer) => {
    const t = setup({ answer });
    await runLikePlaylist(t.deps, { playlistId: 'P', uris: uris(2), skipped: 0 });
    expect(t.confirm).not.toHaveBeenCalled();
    expect(t.put).not.toHaveBeenCalled();
    expect(t.last()).toMatchObject({
      status: 'error',
      message: 'Could not check your Liked Songs: Spotify returned an unexpected answer',
    });
  });

  it('write failure reports how many were liked before it', async () => {
    const t = setup({ putRejectOnCall: 2 });
    await runLikePlaylist(t.deps, { playlistId: 'P', uris: uris(88), skipped: 0 });
    expect(t.last()).toEqual({
      status: 'error',
      playlistId: 'P',
      message: 'Spotify server error 503',
      liked: 40,
      toLike: 88,
    });
  });
});

describe('copy', () => {
  it('asks with the exact count', () => {
    expect(likeQuestion(88, 120)).toBe(
      "88 of 120 songs from your last sync aren't in your Liked Songs yet. Like them?"
    );
    expect(likeQuestion(1, 1)).toBe(
      "1 of 1 song from your last sync isn't in your Liked Songs yet. Like it?"
    );
  });

  it('summarises only the non-zero parts', () => {
    expect(likeSummary({ liked: 88, already: 32, skipped: 1 })).toBe(
      'Liked 88 songs · 32 were already liked · 1 local file skipped'
    );
    expect(likeSummary({ liked: 1, already: 0, skipped: 0 })).toBe('Liked 1 song');
    expect(likeSummary({ liked: 0, already: 120, skipped: 0 })).toBe(
      'All 120 songs are already in your Liked Songs'
    );
    expect(likeSummary({ liked: 0, already: 1, skipped: 0 })).toBe(
      'Your 1 song is already in your Liked Songs'
    );
    expect(likeSummary({ liked: 0, already: 0, skipped: 3 })).toBe(
      'No Spotify songs to like · 3 local files skipped'
    );
  });

  it('names the progress in a write-phase error', () => {
    expect(likeErrorText({ message: 'boom', liked: 40, toLike: 88 })).toBe(
      'Liked 40 of 88, then: boom'
    );
    expect(likeErrorText({ message: 'boom' })).toBe('boom');
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `yarn test src/features/like`
Expected: FAIL — module `./likePlaylist` not found.

- [ ] **Step 4: Implement** `src/features/like/likePlaylist.ts`:

```ts
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
    onState({ status: 'liking', playlistId, done: liked, total: toLike.length });
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
    parts.push(`All ${count(s.already, 'song')} are already in your Liked Songs`);
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
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `yarn test src/features/like && yarn typecheck && yarn lint`
Expected: PASS. Run `yarn prettier --write src/features/like` first if lines exceed 80 columns.

- [ ] **Step 6: Commit**

```bash
git add src/features/like src/model/state.ts
git commit -m "feat(like): check-confirm-like runner and its copy"
```

---

### Task 4: wire into state and the Playlist screen

**Files:**

- Modify: `src/model/state.ts`, `src/ui/Playlist.tsx`

**Interfaces:**

- Consumes: `LikeState`, `canLikeTracks`, `likeCandidates`, `runLikePlaylist`, `likeQuestion`, `likeSummary`, `likeErrorText` (Task 3).
- Produces: `likeState` signal and `startLikePlaylist(playlistId: string): Promise<void>` exported from `state.ts`.

No unit test (the wrapper imports the browser singletons, like every `start*`); verified live in Task 5.

- [ ] **Step 1: state.ts.** Import `canLikeTracks, likeCandidates, likeQuestion, runLikePlaylist` from `'../features/like/likePlaylist'`. After the `LikeState` type add:

```ts
export const likeState = signal<LikeState>({ status: 'idle' });
```

After `startCreatePlaylist` add:

```ts
/**
 * Likes every not-yet-liked song of a synced playlist (like-playlist spec).
 * Never on load: only from the Playlist screen's button. Not a jobsBusy() job
 * and no loadFromDb(): it writes no local store. Candidates come from the
 * synced entries, never a playlist read (the quota rule). Without both library
 * scopes it reveals the needScope prompt instead.
 */
export async function startLikePlaylist(playlistId: string): Promise<void> {
  const status = likeState.value.status;
  if (status === 'checking' || status === 'liking') return;
  const m = model.value;
  if (!m) return;
  if (!canLikeTracks(auth.session.value)) {
    likeState.value = { status: 'needScope', playlistId };
    return;
  }
  // Claim the running state synchronously so a second tap cannot double-run.
  likeState.value = {
    status: 'checking',
    playlistId,
    done: 0,
    total: 0,
  } as LikeState;
  await runLikePlaylist(
    {
      client: api,
      confirm: (toLike, total) => confirm(likeQuestion(toLike, total)),
      onState: (s) => {
        likeState.value = s;
      },
    },
    { playlistId, ...likeCandidates(m, playlistId) }
  );
}
```

In `disconnect`, after `createPlaylistState.value = { status: 'idle' };` add `likeState.value = { status: 'idle' };`.

- [ ] **Step 2: Playlist.tsx.** Add imports: `auth` from `'../auth/browser'`; `likeErrorText, likeSummary` from `'../features/like/likePlaylist'`; `likeState, startLikePlaylist` added to the `'../model/state'` import; `Progress` from `'./components/Progress'`. Add this component above `export function Playlist`:

```tsx
/**
 * Like-playlist spec §3: every line of the like job, shown only on the
 * playlist it belongs to. Every failure is printed here; no banner.
 */
function LikeStatus({ playlistId }: { playlistId: string }) {
  const s = likeState.value;
  if (s.status === 'idle' || s.playlistId !== playlistId) return null;
  switch (s.status) {
    case 'needScope':
      return (
        <>
          <p class="muted">
            This app cannot like songs yet — connect again to allow it. Your
            library stays on this phone.
          </p>
          <div class="actions">
            <button type="button" onClick={() => auth.logout()}>
              Connect again to allow likes
            </button>
          </div>
        </>
      );
    case 'checking':
      return (
        <Progress
          label="Checking your Liked Songs…"
          done={s.done}
          total={s.total}
          unit="songs"
        />
      );
    case 'liking':
      return (
        <Progress label="Liking…" done={s.done} total={s.total} unit="songs" />
      );
    case 'done':
      return <p class="muted">{likeSummary(s)}</p>;
    case 'error':
      return <p class="error">{likeErrorText(s)}</p>;
  }
}
```

In `Playlist`, next to `const busy = …` add:

```tsx
  const like = likeState.value;
  const liking = like.status === 'checking' || like.status === 'liking';
```

Inside the existing `<div class="actions">`, after the Sync button:

```tsx
        <button
          type="button"
          disabled={liking}
          onClick={() => void startLikePlaylist(id)}
        >
          {liking ? 'Liking…' : 'Like all songs'}
        </button>
```

and right after that `</div>`: `<LikeStatus playlistId={id} />`.

- [ ] **Step 3: Checks**

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/model/state.ts src/ui/Playlist.tsx
git commit -m "feat(like): Like all songs button and status on the Playlist screen"
```

---

### Task 5: docs, live check, deploy

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md.**
  - `spotify/` bullet: the client has `get`, `post` and `put`; `put<T>(path, query?)` shares the machinery and, unlike POST, **is** retried on a 5xx/network error, because `PUT /me/library` saves a set and is idempotent; a success with an empty body resolves `undefined`.
  - Architecture `features/` bullet: add `features/like/likePlaylist.ts` (`canLikeTracks`, `likeCandidates`, `runLikePlaylist`, the copy helpers) and `state.ts`'s `startLikePlaylist`.
  - The "Creating a playlist is the app's only write" bullet: now two writes — creating a playlist from a mix and liking a playlist's songs — both gated on a one-time re-login (`SCOPES` also carries `user-library-read user-library-modify`; `hasScope` is the whole-token check).
  - New conventions bullet: "Like all songs" (Playlist screen) — check (`GET /me/library/contains`) → `confirm()` with the exact count → `PUT /me/library`, 40 URIs per request, only `spotify:track:` URIs, candidates from the synced entries (never a playlist read), not in `jobsBusy()`, re-entry guarded on `likeState.status`, inline errors only, reset by `disconnect`.
  - After the "Three things ask before they destroy data" bullet add: the like confirm is a fourth `confirm()` but non-destructive — a bulk write the app cannot undo.
  - Specs list: add `docs/superpowers/specs/2026-09-25-like-playlist-design.md`.

- [ ] **Step 2: Full local checks**

Run: `yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all PASS.

- [ ] **Step 3: Live check.** `yarn dev`, open `http://127.0.0.1:5173/myOwnSpotifyData/`, confirm the app renders and a Playlist screen shows **Like all songs** beside the Sync button. With a session lacking the library scopes the tap shows the needScope prompt and makes no request; the authorize URL built by Connect carries both new scopes.

- [ ] **Step 4: Commit, merge, deploy**

```bash
git add CLAUDE.md
git commit -m "docs(like): like-all-songs in the architecture map and conventions"
git checkout main && git merge --ff-only feat/like-playlist && git push origin main feat/like-playlist
```

Then watch the CI run (`gh run watch`) until `deploy` is green, and open `https://vatheo.github.io/myOwnSpotifyData/` to confirm the new bundle is served.
