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

  it('accepts a title that differs only in spaces or hyphens', () => {
    const leary = row({ artist: 'Dr. Timothy Leary', title: 'Freakout' });
    const hit = track({
      name: 'Freak-Out',
      artists: [{ id: 'a1', name: 'Dr. Timothy Leary' }],
    });
    expect(pickMatch(leary, [hit])).toBe(hit);
  });

  it('ignores spacing for equality only, never for the prefix rule', () => {
    const leary = row({ artist: 'Dr. Timothy Leary', title: 'Freakout' });
    const longer = track({
      name: 'Freak Out Tonight',
      artists: [{ id: 'a1', name: 'Dr. Timothy Leary' }],
    });
    expect(pickMatch(leary, [longer])).toBeNull();
  });

  it('still rejects a spacing-equal title by the wrong artist', () => {
    const leary = row({ artist: 'Dr. Timothy Leary', title: 'Freakout' });
    const wrong = track({
      name: 'Freak-Out',
      artists: [{ id: 'a2', name: 'Chic' }],
    });
    expect(pickMatch(leary, [wrong])).toBeNull();
  });

  it('prefers an exact title anywhere in the results over an earlier prefix match', () => {
    const one = row({ title: 'One' });
    const longer = track({
      id: 'p',
      uri: 'spotify:track:p',
      name: 'One More Time',
    });
    const others = Array.from({ length: 6 }, (_, i) =>
      track({
        id: `o${i}`,
        uri: `spotify:track:o${i}`,
        name: 'One',
        artists: [{ id: 'x', name: 'Someone Else' }],
      })
    );
    const exact = track({ id: 'e', uri: 'spotify:track:e', name: 'One' });
    expect(pickMatch(one, [longer, ...others, exact])).toBe(exact);
  });

  it('falls back to the first prefix match when no exact title exists', () => {
    const remix = track({ name: 'Losing It (Ted Remix)' });
    const other = track({
      id: 't2',
      uri: 'spotify:track:t2',
      name: 'Losing It (Other Remix)',
    });
    expect(pickMatch(row(), [remix, other])).toBe(remix);
  });

  it('needs a word boundary for a prefix: "Go" never takes "Gold"', () => {
    const go = row({ artist: 'Gemini', title: 'Go' });
    const gold = track({
      name: 'Gold',
      artists: [{ id: 'a1', name: 'Gemini' }],
    });
    expect(pickMatch(go, [gold])).toBeNull();
  });

  it('matches artists by whole words, never inside a word', () => {
    const stay = row({ artist: 'Alex Kassian', title: 'Stay' });
    const byX = track({ name: 'Stay', artists: [{ id: 'x', name: 'X' }] });
    expect(pickMatch(stay, [byX])).toBeNull();
    const byFish = track({
      artists: [{ id: 'f', name: 'Fish' }],
    });
    expect(pickMatch(row(), [byFish])).toBeNull();
    const byLonger = track({
      artists: [{ id: 'g', name: 'Fisherman' }],
    });
    expect(pickMatch(row(), [byLonger])).toBeNull();
  });

  it('still accepts an artist credited with extra whole words', () => {
    const leary = row({ artist: 'Timothy Leary', title: 'Freak-Out' });
    const dr = track({
      name: 'Freak-Out',
      artists: [{ id: 'l', name: 'Dr. Timothy Leary' }],
    });
    expect(pickMatch(leary, [dr])).toBe(dr);
  });

  it('rejects wrong tracks ranked anywhere in a ten-result page', () => {
    const go = row({ artist: 'Gemini', title: 'Go' });
    const wrong = Array.from({ length: 10 }, (_, i) =>
      track({
        id: `w${i}`,
        uri: `spotify:track:w${i}`,
        name: i % 2 ? 'Gold' : 'Go',
        artists: [{ id: 'x', name: i % 2 ? 'Gemini' : 'Geminiano' }],
      })
    );
    expect(pickMatch(go, wrong)).toBeNull();
  });

  it('never merges digit runs when ignoring spaces', () => {
    const part = row({ title: 'Part 1 2' });
    const twelve = track({ name: 'Part 12' });
    expect(pickMatch(part, [twelve])).toBeNull();
  });

  it('prefers the original over an equally exact "(Mixed)" compilation copy', () => {
    const mixed = track({
      id: 'm',
      uri: 'spotify:track:m',
      name: 'Losing It (Mixed)',
    });
    const original = track({
      id: 'o',
      uri: 'spotify:track:o',
      name: 'Losing It (Original Mix)',
    });
    expect(pickMatch(row(), [mixed, original])).toBe(original);
    expect(pickMatch(row(), [mixed])).toBe(mixed);
  });

  it('never matches a row whose title is only a mix marker', () => {
    const marker = row({ title: '(Mixed)' });
    const blank = track({ name: '(Original Mix)' });
    const any = track({ id: 't2', uri: 'spotify:track:t2' });
    expect(pickMatch(marker, [blank, any])).toBeNull();
  });

  it('spots a "(Mixed)" copy even when a feat. credit follows the marker', () => {
    const mixed = track({
      id: 'm',
      uri: 'spotify:track:m',
      name: 'Losing It - Mixed (feat. X)',
    });
    const plain = track({ id: 'p', uri: 'spotify:track:p' });
    expect(pickMatch(row(), [mixed, plain])).toBe(plain);
  });

  it('takes a longer title only when the extra words are a version tail', () => {
    const one = row({ title: 'One' });
    const song = track({ name: 'One More Time' });
    expect(pickMatch(one, [song])).toBeNull();
    const dashed = track({ name: 'One - Ted Remix' });
    expect(pickMatch(one, [dashed])).toBe(dashed);
    const bracketed = track({ name: 'One [Ted Remix]' });
    expect(pickMatch(one, [bracketed])).toBe(bracketed);
  });

  it('accepts a version tail after the remix the row asks for', () => {
    const remixRow = row({ title: 'Losing It (Ted Remix)' });
    const extended = track({ name: 'Losing It (Ted Remix) - Extended' });
    expect(pickMatch(remixRow, [extended])).toBe(extended);
  });

  it('rejects a one-word credit that is only part of the row artist', () => {
    const cases: [string, string][] = [
      ['Four Tet', 'Four'],
      ['Kerri Chandler', 'Chandler'],
      ['De La Soul', 'La'],
      ['Malcolm X', 'X'],
      ['DJ W!ld', 'W'],
      ['Four', 'Four Tet'],
      ['X', 'Malcolm X'],
    ];
    for (const [rowArtist, credit] of cases) {
      const r = row({ artist: rowArtist, title: 'Intro' });
      const t = track({ name: 'Intro', artists: [{ id: 'c', name: credit }] });
      expect(pickMatch(r, [t]), `${rowArtist} vs ${credit}`).toBeNull();
    }
  });

  it('accepts the same artist behind a prefix word, a tag or a vs credit', () => {
    const cases: [string, string][] = [
      ['Fisher', 'FISHER (OZ)'],
      ['DJ Koze', 'Koze'],
      ['Koze', 'DJ Koze'],
      ['Chemical Brothers', 'The Chemical Brothers'],
      ['The Chemical Brothers', 'Chemical Brothers'],
      ['Timothy Leary', 'Dr. Timothy Leary'],
      ['Mr Oizo', 'Mr. Oizo'],
      ['Artist A vs Artist B', 'Artist A'],
      ['Artist A b2b Artist B', 'Artist A'],
    ];
    for (const [rowArtist, credit] of cases) {
      const r = row({ artist: rowArtist, title: 'Intro' });
      const t = track({ name: 'Intro', artists: [{ id: 'c', name: credit }] });
      expect(pickMatch(r, [t]), `${rowArtist} vs ${credit}`).toBe(t);
    }
  });

  it('matches an artist whose own name holds "&" or ","', () => {
    const cases: [string, string, string][] = [
      ['Above & Beyond', 'Sun & Moon', 'Above & Beyond'],
      ['Chase & Status', 'Blind Faith', 'Chase & Status'],
      ['Kraak & Smaak', 'Squeeze Me', 'Kraak & Smaak'],
      ['Dimitri Vegas & Like Mike', 'Tremor', 'Dimitri Vegas & Like Mike'],
      ['Earth, Wind & Fire', 'September', 'Earth, Wind & Fire'],
      ['Tyler, The Creator', 'See You Again', 'Tyler, The Creator'],
      ['Above & Beyond feat. Zoë Johnston', 'Sun & Moon', 'Above & Beyond'],
      ['Man Vs Machine', 'Intro', 'Man Vs Machine'],
    ];
    for (const [rowArtist, title, credit] of cases) {
      const r = row({ artist: rowArtist, title });
      const t = track({ name: title, artists: [{ id: 'c', name: credit }] });
      expect(pickMatch(r, [t]), rowArtist).toBe(t);
    }
  });

  it('keeps a one-letter name whole: "Mr. G" is not "G"', () => {
    const r = row({ artist: 'Mr. G', title: 'Intro' });
    const t = track({ name: 'Intro', artists: [{ id: 'g', name: 'G' }] });
    expect(pickMatch(r, [t])).toBeNull();
  });

  it('never takes another part or a reprise as a version', () => {
    for (const name of ['One (Part 2)', 'One - Pt. 2', 'One (Reprise)']) {
      expect(
        pickMatch(row({ title: 'One' }), [track({ name })]),
        name
      ).toBeNull();
    }
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
      limit: 10,
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
      limit: 10,
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

  function tracklistifyRow(over: Partial<TracklistRow> = {}): TracklistRow {
    return row({
      source: 'tracklistify',
      detected: { artist: 'Fisher', title: 'Losing It' },
      isrc: 'DECH62001634',
      confidence: 90,
      ...over,
    });
  }

  it('tries an isrc query first when the row carries one', async () => {
    const hit = track();
    const { client, get } = mockClient([hit]);
    const m = await searchTrack(client, tracklistifyRow());
    expect(m.uri).toBe('spotify:track:t1');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][1]).toEqual({
      q: 'isrc:DECH62001634',
      type: 'track',
      limit: 10,
    });
  });

  it('falls through to the field and plain queries when the isrc hit fails pickMatch', async () => {
    const wrongArtist = track({
      artists: [{ id: 'a2', name: 'Someone Else' }],
    });
    const hit = track();
    const { client, get } = mockClient([wrongArtist], [hit]);
    const m = await searchTrack(client, tracklistifyRow());
    expect(m.uri).toBe('spotify:track:t1');
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[0][1]).toMatchObject({ q: 'isrc:DECH62001634' });
    expect(get.mock.calls[1][1]).toMatchObject({
      q: 'artist:"Fisher" track:"Losing It"',
    });
  });

  it('does not use the isrc once the row has been edited away from what Tracklistify detected', async () => {
    // editTracklistRow flips source to 'manual' as soon as artist/title
    // differ from `detected` — the isrc/confidence are for the ORIGINAL
    // identification and must not outlive it (a corrected row must not have
    // its correction silently overridden by the stale isrc).
    const hit = track();
    const { client, get } = mockClient([hit]);
    const editedRow = tracklistifyRow({ source: 'manual' });
    await searchTrack(client, editedRow);
    expect(get.mock.calls[0][1]).toMatchObject({
      q: 'artist:"Fisher" track:"Losing It"',
    });
  });
});
