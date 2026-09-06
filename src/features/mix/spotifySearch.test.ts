import { describe, expect, it } from 'vitest';
import type { Session } from '../../auth/session';
import type { TracklistRow } from '../../db/schema';
import type { ApiTrack } from '../../spotify/types';
import { canCreatePlaylists, isIdentified, pickMatch } from './spotifySearch';

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

  it('returns the first passing item when several pass', () => {
    const first = track({ id: 'f1', uri: 'spotify:track:f1' });
    const second = track({ id: 'f2', uri: 'spotify:track:f2' });
    expect(pickMatch(row(), [first, second])).toBe(first);
  });
});
