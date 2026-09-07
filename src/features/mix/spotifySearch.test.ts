import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../../auth/session';
import type { TracklistRow } from '../../db/schema';
import type { Query, SpotifyClient } from '../../spotify/client';
import type { ApiTrack } from '../../spotify/types';
import {
  canCreatePlaylists,
  isIdentified,
  pickMatch,
  searchTrack,
} from './spotifySearch';

function session(scope: string): Session {
  return {
    accessToken: 'at',
    expiresAt: 0,
    refreshToken: 'rt',
    scope,
  };
}

describe('canCreatePlaylists', () => {
  it('is true when the scope carries the exact modify token', () => {
    expect(
      canCreatePlaylists(
        session('user-top-read playlist-read-private playlist-modify-private')
      )
    ).toBe(true);
  });

  it('is false for a session without the modify scope', () => {
    expect(
      canCreatePlaylists(session('user-top-read playlist-read-private'))
    ).toBe(false);
  });

  it('is false for an empty scope', () => {
    expect(canCreatePlaylists(session(''))).toBe(false);
  });

  it('is false for a null session', () => {
    expect(canCreatePlaylists(null)).toBe(false);
  });

  it('rejects a scope that merely contains the substring', () => {
    expect(
      canCreatePlaylists(session('user-top-read playlist-modify-private-xyz'))
    ).toBe(false);
  });
});

function row(over: Partial<TracklistRow> = {}): TracklistRow {
  return {
    startSec: null,
    endSec: null,
    artist: 'Fisher',
    title: 'Losing It',
    label: null,
    source: 'trackid',
    gap: false,
    detected: null,
    referenceCount: null,
    ...over,
  };
}

function track(over: Partial<ApiTrack> = {}): ApiTrack {
  return {
    id: 't1',
    uri: 'spotify:track:t1',
    name: 'Losing It',
    duration_ms: 1000,
    artists: [{ id: 'a1', name: 'Fisher' }],
    ...over,
  };
}

describe('isIdentified', () => {
  it('is true for a real artist and title', () => {
    expect(isIdentified(row())).toBe(true);
  });

  it('is false for a gap row', () => {
    expect(isIdentified(row({ gap: true }))).toBe(false);
  });

  it('is false for ID / unknown / empty / ? placeholders', () => {
    expect(isIdentified(row({ artist: 'ID', title: 'ID' }))).toBe(false);
    expect(isIdentified(row({ artist: 'Fisher', title: 'unknown' }))).toBe(
      false
    );
    expect(isIdentified(row({ artist: '', title: 'Losing It' }))).toBe(false);
    // normalize narrows '?' to '', so a '?' row is inert too.
    expect(isIdentified(row({ artist: '?', title: '?' }))).toBe(false);
  });
});

describe('pickMatch', () => {
  it('returns the first item that passes artist and title (exact hit)', () => {
    const hit = track();
    expect(pickMatch(row(), [hit])).toBe(hit);
  });

  it('rejects when no artist across all artists[] matches', () => {
    const wrong = track({ artists: [{ id: 'a2', name: 'Someone Else' }] });
    expect(pickMatch(row(), [wrong])).toBeNull();
  });

  it('accepts a collab where the credited artist is not at [0]', () => {
    const credited = row({ artist: 'Salomo', title: 'Voltage' });
    const collab = track({
      name: 'Voltage',
      artists: [
        { id: 'a1', name: 'Adriatique' },
        { id: 'a2', name: 'Salomo' },
      ],
    });
    expect(pickMatch(credited, [collab])).toBe(collab);
  });

  it('accepts a remix result by prefix and rejects a bare-title result for a remix row', () => {
    const remixRow = row({ title: 'Losing It (Ted Remix)' });
    const remix = track({ name: 'Losing It (Ted Remix)' });
    const bare = track({
      id: 't2',
      uri: 'spotify:track:t2',
      name: 'Losing It',
    });
    expect(pickMatch(remixRow, [remix])).toBe(remix);
    // A row asking for the remix must NOT accept the bare original.
    expect(pickMatch(remixRow, [bare])).toBeNull();
  });

  it('accepts a remix result for a bare row (prefix in the other direction)', () => {
    const remix = track({ name: 'Losing It (Ted Remix)' });
    expect(pickMatch(row(), [remix])).toBe(remix);
  });

  it('returns null for zero items', () => {
    expect(pickMatch(row(), [])).toBeNull();
  });

  it('skips a local or episode result even when the text matches', () => {
    const local = track({ id: null, uri: 'spotify:local:x', is_local: true });
    const episode = track({ uri: 'spotify:episode:e1' });
    expect(pickMatch(row(), [local])).toBeNull();
    expect(pickMatch(row(), [episode])).toBeNull();
  });

  it('rejects a same-title wrong-artist result when the row primary artist normalises to empty', () => {
    // "?, Fisher" passes isIdentified (normalize keeps "fisher") but its
    // primaryArtist is "?" which normalises to '' — the artist gate must NOT
    // be disabled by that empty; a track by someone else is never accepted.
    const oddRow = row({ artist: '?, Fisher' });
    const wrongArtist = track({
      artists: [{ id: 'x', name: 'Some One Else' }],
    });
    expect(pickMatch(oddRow, [wrongArtist])).toBeNull();
  });

  it('returns the first passing item when several pass', () => {
    const first = track({ id: 'f1', uri: 'spotify:track:f1' });
    const second = track({ id: 'f2', uri: 'spotify:track:f2' });
    expect(pickMatch(row(), [first, second])).toBe(first);
  });
});

function mockClient(...batches: ApiTrack[][]) {
  const queue = [...batches];
  const get = vi.fn<(path: string, query?: Query) => Promise<unknown>>(
    async () => ({ tracks: { items: queue.shift() ?? [] } })
  );
  return { client: { get } as unknown as Pick<SpotifyClient, 'get'>, get };
}

describe('searchTrack', () => {
  it('returns the field-query hit and does not run the plain fallback', async () => {
    const hit = track();
    const { client, get } = mockClient([hit]);
    const m = await searchTrack(client, row());
    expect(m).toEqual({
      row: row(),
      uri: 'spotify:track:t1',
      matchedName: 'Losing It',
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toBe('/search');
    expect(get.mock.calls[0][1]).toEqual({
      q: 'artist:"Fisher" track:"Losing It"',
      type: 'track',
      limit: 5,
    });
  });

  it('falls back to the plain query when the field query is empty', async () => {
    const hit = track();
    const { client, get } = mockClient([], [hit]);
    const m = await searchTrack(client, row());
    expect(m.uri).toBe('spotify:track:t1');
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1][1]).toEqual({
      q: 'Fisher Losing It',
      type: 'track',
      limit: 5,
    });
  });

  it('is unmatched when both queries return zero results', async () => {
    const { client, get } = mockClient([], []);
    const m = await searchTrack(client, row());
    expect(m).toEqual({ row: row(), uri: null, matchedName: null });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('is unmatched when the artist is wrong across both queries', async () => {
    const wrong = track({ artists: [{ id: 'a2', name: 'Someone Else' }] });
    const { client, get } = mockClient([wrong], [wrong]);
    const m = await searchTrack(client, row());
    expect(m.uri).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('strips embedded quotes from the field-query values', async () => {
    const { client, get } = mockClient([]);
    await searchTrack(client, row({ artist: 'A"B', title: 'C"D' }));
    expect(get.mock.calls[0][1]).toMatchObject({
      q: 'artist:"AB" track:"CD"',
    });
  });

  it('does not search a gap or inert row (zero fetches)', async () => {
    const { client: gapClient, get: gapGet } = mockClient([track()]);
    expect(await searchTrack(gapClient, row({ gap: true }))).toEqual({
      row: row({ gap: true }),
      uri: null,
      matchedName: null,
    });
    expect(gapGet).not.toHaveBeenCalled();

    const { client: idClient, get: idGet } = mockClient([track()]);
    expect(
      (await searchTrack(idClient, row({ artist: 'ID', title: 'ID' }))).uri
    ).toBeNull();
    expect(idGet).not.toHaveBeenCalled();
  });

  it('skips a local top result and takes a real track lower down', async () => {
    const local = track({ id: null, uri: 'spotify:local:x', is_local: true });
    const real = track({ id: 't9', uri: 'spotify:track:t9' });
    const { client, get } = mockClient([local, real]);
    const m = await searchTrack(client, row());
    expect(m.uri).toBe('spotify:track:t9');
    expect(get).toHaveBeenCalledTimes(1);
  });
});
