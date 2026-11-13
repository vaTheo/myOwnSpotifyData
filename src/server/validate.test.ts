import { describe, expect, it } from 'vitest';
import {
  validateJobRow,
  validateMix,
  validateRow,
  validateSharedReachFact,
  validateSharedTrackFact,
  validateSummary,
} from './validate';

const track = {
  key: 't1',
  id: 't1',
  uri: 'spotify:track:t1',
  name: 'A',
  artists: [{ id: 'a1', name: 'Artist' }],
  album: 'B',
  durationMs: 1000,
  isrc: null,
  spotifyUrl: 'https://open.spotify.com/track/t1',
  isLocal: false,
};

const mixRow = {
  url: 'https://soundcloud.com/x/y',
  title: 'T',
  author: null,
  playerSrc: 'https://w.soundcloud.com/player/?url=x',
  slug: null,
  sources: { trackid: false, description: false, pasted: true, linkOut: null },
  rows: [
    {
      startSec: 1,
      endSec: null,
      artist: 'A',
      title: 'B',
      label: null,
      source: 'pasted',
      gap: false,
      detected: null,
      referenceCount: null,
      shazamUrl: 'https://www.shazam.com/track/1',
    },
  ],
  savedAt: 5,
};

describe('validateRow', () => {
  it('accepts a well-formed track and keeps unknown extra fields', () => {
    const res = validateRow('tracks', { ...track, futureField: 'kept' });
    expect(res.ok).toBe(true);
    if (res.ok)
      expect((res.row as { futureField?: string }).futureField).toBe('kept');
  });

  it('rejects a javascript: spotifyUrl and any non-Spotify link host', () => {
    expect(
      validateRow('tracks', { ...track, spotifyUrl: 'javascript:alert(1)' }).ok
    ).toBe(false);
    expect(
      validateRow('tracks', { ...track, spotifyUrl: 'https://evil.example/t' })
        .ok
    ).toBe(false);
    expect(validateRow('tracks', { ...track, spotifyUrl: null }).ok).toBe(true);
  });

  it('rejects an empty key, a non-object, and a non-finite number', () => {
    expect(validateRow('tracks', { ...track, key: '' }).ok).toBe(false);
    expect(validateRow('tracks', 'nope').ok).toBe(false);
    expect(
      validateRow('tracks', { ...track, durationMs: Number.POSITIVE_INFINITY })
        .ok
    ).toBe(false);
    expect(
      validateRow('plays', {
        trackId: 't',
        plays: 'many',
        msPlayed: 1,
        firstTs: 'x',
        lastTs: 'y',
        trackName: null,
        artistName: null,
      }).ok
    ).toBe(false);
    expect(
      validateRow('plays', {
        trackId: 't',
        plays: 3,
        msPlayed: 1,
        firstTs: 'x',
        lastTs: 'y',
        trackName: null,
        artistName: null,
      }).ok
    ).toBe(true);
  });

  it('entries need a playlistId and a finite position', () => {
    expect(
      validateRow('entries', {
        playlistId: 'p',
        position: 0,
        trackKey: 't',
        addedAt: null,
      }).ok
    ).toBe(true);
    expect(
      validateRow('entries', {
        playlistId: '',
        position: 0,
        trackKey: 't',
        addedAt: null,
      }).ok
    ).toBe(false);
    expect(
      validateRow('entries', {
        playlistId: 'p',
        position: Number.NaN,
        trackKey: 't',
        addedAt: null,
      }).ok
    ).toBe(false);
  });

  it('playlists and top items need https image and Spotify links or null', () => {
    const playlist = {
      id: 'p',
      name: 'P',
      snapshotId: 's',
      itemCount: 1,
      imageUrl: null,
      spotifyUrl: null,
      syncedAt: 1,
    };
    expect(validateRow('playlists', playlist).ok).toBe(true);
    expect(
      validateRow('playlists', { ...playlist, imageUrl: 'http://i.scdn.co/x' })
        .ok
    ).toBe(false);
    expect(
      validateRow('playlists', { ...playlist, imageUrl: 'https://i.scdn.co/x' })
        .ok
    ).toBe(true);
    const top = {
      key: 'tracks:short_term',
      type: 'tracks',
      period: 'short_term',
      fetchedAt: 1,
      items: [
        {
          rank: 1,
          id: 'x',
          name: 'n',
          artists: [],
          album: 'a',
          imageUrl: null,
          spotifyUrl: 'javascript:x',
        },
      ],
    };
    expect(validateRow('topItems', top).ok).toBe(false);
  });

  it('a reach row needs an https sourceUrl; features and identity need their ids', () => {
    const reach = {
      key: 'a|deezer',
      artistId: 'a',
      source: 'deezer',
      status: 'ok',
      value: 5,
      fetchedAt: 1,
      retryAfter: null,
      sourceUrl: 'https://api.deezer.com/artist/1',
    };
    expect(validateRow('artistReach', reach).ok).toBe(true);
    expect(
      validateRow('artistReach', {
        ...reach,
        sourceUrl: 'http://api.deezer.com/artist/1',
      }).ok
    ).toBe(false);
    expect(validateRow('artistReach', { ...reach, value: 'five' }).ok).toBe(
      false
    );
    expect(
      validateRow('features', { trackId: 't', isrc: null, updatedAt: 1 }).ok
    ).toBe(true);
    expect(
      validateRow('features', { trackId: 't', isrc: null, updatedAt: 'now' }).ok
    ).toBe(false);
    expect(validateRow('artistIdentity', { artistId: '' }).ok).toBe(false);
  });
});

describe('validateMix', () => {
  it('accepts a mix with a SoundCloud player or no player', () => {
    expect(validateMix(mixRow).ok).toBe(true);
    expect(validateMix({ ...mixRow, playerSrc: null }).ok).toBe(true);
  });

  it('rejects a foreign iframe src, an http link-out, a non-https shazam url, a javascript: playlist url', () => {
    expect(
      validateMix({
        ...mixRow,
        playerSrc: 'https://evil.example/player/?url=x',
      }).ok
    ).toBe(false);
    expect(
      validateMix({
        ...mixRow,
        sources: { ...mixRow.sources, linkOut: 'http://x.example/' },
      }).ok
    ).toBe(false);
    expect(
      validateMix({
        ...mixRow,
        rows: [{ ...mixRow.rows[0], shazamUrl: 'ftp://x' }],
      }).ok
    ).toBe(false);
    expect(
      validateMix({ ...mixRow, playlistUrl: 'javascript:alert(1)' }).ok
    ).toBe(false);
    expect(
      validateMix({
        ...mixRow,
        playlistUrl: 'https://open.spotify.com/playlist/1',
      }).ok
    ).toBe(true);
  });

  it('rejects a missing url, a non-array rows, a non-finite savedAt or startSec', () => {
    expect(validateMix({ ...mixRow, url: '' }).ok).toBe(false);
    expect(validateMix({ ...mixRow, rows: 'x' }).ok).toBe(false);
    expect(validateMix({ ...mixRow, savedAt: 'yesterday' }).ok).toBe(false);
    expect(
      validateMix({
        ...mixRow,
        rows: [{ ...mixRow.rows[0], startSec: Number.NaN }],
      }).ok
    ).toBe(false);
  });
});

describe('validateSummary', () => {
  it('history needs version 2 and a finite importedAt; reach needs version 1 and ranAt', () => {
    expect(validateSummary('history', { version: 2, importedAt: 1 })).toBe(
      true
    );
    expect(validateSummary('history', { importedAt: 1 })).toBe(false);
    expect(validateSummary('history', { version: 2, importedAt: 'x' })).toBe(
      false
    );
    expect(validateSummary('reach', { version: 1, ranAt: 1 })).toBe(true);
    expect(validateSummary('reach', { version: 2, ranAt: 1 })).toBe(false);
  });

  it('features accepts null or a rekordbox summary; library accepts only nothing', () => {
    expect(validateSummary('features', null)).toBe(true);
    expect(validateSummary('features', { importedAt: 1 })).toBe(true);
    expect(validateSummary('features', { importedAt: 'x' })).toBe(false);
    expect(validateSummary('library', null)).toBe(true);
    expect(validateSummary('library', { anything: 1 })).toBe(false);
  });
});

describe('validateJobRow (worker round)', () => {
  const full = {
    id: '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
    payload: { url: 'https://soundcloud.com/x/y' },
    status: 'done',
    claimed_by: 'laptop',
    claimed_at: '2026-11-06T09:40:00.000Z',
    finished_at: '2026-11-06T10:05:00.000Z',
    error: null,
    created_at: '2026-11-06T09:12:00.000Z',
    applied_at: null,
  };
  it('accepts a full row and a row with nulls', () => {
    const defaults = { progress: null, priority: 0, stop_requested_at: null };
    expect(validateJobRow(full)).toEqual({ ...full, ...defaults });
    const queued = {
      ...full,
      status: 'queued',
      claimed_by: null,
      claimed_at: null,
      finished_at: null,
    };
    expect(validateJobRow(queued)).toEqual({ ...queued, ...defaults });
    expect(
      validateJobRow({
        ...full,
        status: 'failed',
        error: 'No track identified',
      })?.error
    ).toBe('No track identified');
  });
  it('rejects a non-uuid id, a fifth status, long strings, bad dates, a bad payload, a non-object', () => {
    expect(validateJobRow({ ...full, id: 'nope' })).toBeNull();
    expect(validateJobRow({ ...full, status: 'running' })).toBeNull();
    expect(validateJobRow({ ...full, claimed_by: 'x'.repeat(201) })).toBeNull();
    expect(validateJobRow({ ...full, error: 'x'.repeat(201) })).toBeNull();
    expect(validateJobRow({ ...full, created_at: 'yesterday' })).toBeNull();
    expect(validateJobRow({ ...full, claimed_at: 12 })).toBeNull();
    expect(
      validateJobRow({ ...full, payload: { url: 'http://x.y/z' } })
    ).toBeNull();
    expect(validateJobRow({ ...full, payload: {} })).toBeNull();
    expect(validateJobRow(null)).toBeNull();
    expect(validateJobRow('row')).toBeNull();
  });
  it('keeps claimed_by and error at exactly 200 characters', () => {
    expect(
      validateJobRow({ ...full, claimed_by: 'x'.repeat(200) })
    ).not.toBeNull();
  });
});

describe('validateMix — round 003 fields', () => {
  const clue = { atSec: 610, author: 'x', text: 'ID?', kind: 'comment' };
  it('accepts replays, candidates, gap clues and set-wide clues', () => {
    expect(
      validateMix({
        ...mixRow,
        rows: [
          { ...mixRow.rows[0], origin: 'replay', speedPercent: -4 },
          { ...mixRow.rows[0], origin: 'clue', clue: { ...clue, atSec: null } },
          { ...mixRow.rows[0], gap: true, clues: [clue] },
        ],
        clues: [{ ...clue, kind: 'description', atSec: null }],
      }).ok
    ).toBe(true);
  });
  it('rejects a bad origin, speed, clue kind, over-long text and too many clues', () => {
    const r0 = mixRow.rows[0];
    for (const bad of [
      { ...mixRow, rows: [{ ...r0, origin: 'guess' }] },
      { ...mixRow, rows: [{ ...r0, speedPercent: Number.NaN }] },
      { ...mixRow, rows: [{ ...r0, clue: { ...clue, kind: 'html' } }] },
      {
        ...mixRow,
        rows: [{ ...r0, clues: [{ ...clue, text: 'x'.repeat(1001) }] }],
      },
      { ...mixRow, rows: [{ ...r0, clues: Array(31).fill(clue) }] },
      { ...mixRow, clues: [{ ...clue, author: 3 }] },
    ]) {
      expect(validateMix(bad).ok).toBe(false);
    }
  });
});

describe('validateMix — round 004 hits', () => {
  it('accepts a whole count from 1, refuses anything else', () => {
    const r0 = mixRow.rows[0];
    expect(validateMix({ ...mixRow, rows: [{ ...r0, hits: 3 }] }).ok).toBe(
      true
    );
    for (const hits of [0, 1.5, -1, '2', Number.NaN]) {
      expect(validateMix({ ...mixRow, rows: [{ ...r0, hits }] }).ok).toBe(
        false
      );
    }
  });
});

describe('validateMix — spec 029 level, speed and candidates', () => {
  const r0 = mixRow.rows[0];
  it('accepts the three fields, their edges and an unknown level word', () => {
    for (const extra of [
      { evidence: 'solid', mixSpeed: -7.7, candidates: 1 },
      { evidence: 'x'.repeat(32), mixSpeed: 50, candidates: 1000 },
      { evidence: 'maybe', mixSpeed: -50 },
      { mixSpeed: 0 },
      { candidates: 12 },
    ]) {
      const res = validateMix({ ...mixRow, rows: [{ ...r0, ...extra }] });
      expect(res.ok && res.row.rows[0]).toMatchObject(extra);
    }
  });
  it('refuses each field out of bounds with its reason', () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ evidence: '' }, 'mixes.row.evidence'],
      [{ evidence: 'x'.repeat(33) }, 'mixes.row.evidence'],
      [{ evidence: 4 }, 'mixes.row.evidence'],
      [{ evidence: null }, 'mixes.row.evidence'],
      [{ mixSpeed: 50.1 }, 'mixes.row.mixSpeed'],
      [{ mixSpeed: -50.1 }, 'mixes.row.mixSpeed'],
      [{ mixSpeed: Number.NaN }, 'mixes.row.mixSpeed'],
      [{ mixSpeed: Number.POSITIVE_INFINITY }, 'mixes.row.mixSpeed'],
      [{ mixSpeed: '-7.7' }, 'mixes.row.mixSpeed'],
      [{ candidates: 0 }, 'mixes.row.candidates'],
      [{ candidates: 1001 }, 'mixes.row.candidates'],
      [{ candidates: 2.5 }, 'mixes.row.candidates'],
      [{ candidates: '3' }, 'mixes.row.candidates'],
    ];
    for (const [extra, reason] of cases) {
      expect(validateMix({ ...mixRow, rows: [{ ...r0, ...extra }] })).toEqual({
        ok: false,
        reason,
      });
    }
  });
});

describe('validateMix — the run (T124)', () => {
  const run = {
    secondPass: { places: 41, found: 3, stopped: null },
    resumed: { probesKept: 120 },
    stoppedEarly: { at: '01:12:00', reason: 'rate limited' },
    warnings: ['refuses often'],
  };
  it('accepts a whole run, a partial one and none', () => {
    expect(validateMix({ ...mixRow, run }).ok).toBe(true);
    expect(validateMix({ ...mixRow, run: { warnings: ['x'] } }).ok).toBe(true);
    expect(
      validateMix({
        ...mixRow,
        run: { secondPass: { places: 1, found: 0, stopped: 'no answer' } },
      }).ok
    ).toBe(true);
  });
  it('refuses a malformed run', () => {
    for (const bad of [
      'yes',
      [],
      { ...run, secondPass: { places: -1, found: 0, stopped: null } },
      { ...run, secondPass: { places: 1, found: 0.5, stopped: null } },
      { ...run, secondPass: { places: 1, found: 0, stopped: 3 } },
      { ...run, resumed: { probesKept: '120' } },
      { ...run, stoppedEarly: { at: 'soon', reason: 'by you' } },
      { ...run, stoppedEarly: { at: '01:12:00', reason: 'x'.repeat(201) } },
      { ...run, warnings: 'refuses often' },
      { ...run, warnings: [3] },
      { ...run, warnings: Array(11).fill('w') },
    ]) {
      expect(validateMix({ ...mixRow, run: bad }).ok).toBe(false);
    }
  });
});

describe('validateMix — the review (T117, T118, T125)', () => {
  const r0 = mixRow.rows[0];
  const found = {
    id: '4uLU6hMCjMI75M1A2tKUQC',
    url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
  };
  it('accepts validated, checked and removed fields', () => {
    expect(
      validateMix({
        ...mixRow,
        rows: [
          { ...r0, validated: true, spotify: found, checkedAt: 5 },
          { ...r0, validated: false, spotify: 'not-found', checkedAt: 6 },
        ],
        removed: [
          { artist: 'A', title: 'B', isrc: null },
          { artist: 'C', title: 'D', isrc: 'GBAAA0000001' },
        ],
      }).ok
    ).toBe(true);
  });
  it('accepts spotifyBy only as owner beside a found track (round 012)', () => {
    expect(
      validateMix({
        ...mixRow,
        rows: [{ ...r0, spotify: found, spotifyBy: 'owner', checkedAt: 5 }],
      }).ok
    ).toBe(true);
    for (const row of [
      { ...r0, spotify: found, spotifyBy: 'check' },
      { ...r0, spotify: found, spotifyBy: true },
      { ...r0, spotify: 'not-found', spotifyBy: 'owner' },
      { ...r0, spotifyBy: 'owner' },
    ]) {
      const res = validateMix({ ...mixRow, rows: [row] });
      expect(res).toEqual({ ok: false, reason: 'mixes.row.spotifyBy' });
    }
  });
  it('refuses a malformed review field', () => {
    for (const row of [
      { ...r0, validated: 'yes' },
      { ...r0, spotify: 'found' },
      { ...r0, spotify: { ...found, url: 'javascript:alert(1)' } },
      { ...r0, spotify: { ...found, url: 'https://evil.example/track/x' } },
      { ...r0, spotify: { ...found, id: 'a/b' } },
      { ...r0, spotify: { url: found.url } },
      { ...r0, checkedAt: Number.NaN },
    ]) {
      expect(validateMix({ ...mixRow, rows: [row] }).ok).toBe(false);
    }
    for (const removed of [
      'x',
      [{ artist: 'A', title: 'B' }],
      [{ artist: 'A', title: 3, isrc: null }],
      Array(501).fill({ artist: 'A', title: 'B', isrc: null }),
    ]) {
      expect(validateMix({ ...mixRow, removed }).ok).toBe(false);
    }
  });
});

describe('validateJobRow — round 004 columns', () => {
  const base = {
    id: '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
    payload: { url: 'https://soundcloud.com/a/b' },
    status: 'claimed',
    claimed_by: 'laptop',
    claimed_at: '2026-11-06T20:00:00Z',
    finished_at: null,
    error: null,
    created_at: '2026-11-06T19:00:00Z',
    applied_at: null,
  };
  it('keeps a well-formed progress, priority and stop', () => {
    const progress = {
      step: 'first',
      done: 1,
      total: 2,
      percent: 50,
      minutes_left: 3,
      paused_until: null,
      warning: null,
      at: '2026-11-06T20:01:00Z',
    };
    const row = validateJobRow({
      ...base,
      progress,
      priority: 3,
      stop_requested_at: '2026-11-06T20:02:00Z',
    });
    expect(row).toMatchObject({
      progress,
      priority: 3,
      stop_requested_at: '2026-11-06T20:02:00Z',
    });
  });
  it('drops a malformed progress without refusing the row', () => {
    for (const progress of [
      { step: 7 },
      { step: 'first', done: 'x' },
      { step: 'first', warning: 'w'.repeat(300) },
      { step: 'first', paused_until: 'soon' },
    ]) {
      expect(validateJobRow({ ...base, progress })?.progress).toBeNull();
    }
  });
});

describe('round 005 years: a bad year is dropped, the row kept', () => {
  it('keeps a valid albumYear on a track and drops an invalid one', () => {
    const good = validateRow('tracks', { ...track, albumYear: 1993 });
    expect(good).toEqual({ ok: true, row: { ...track, albumYear: 1993 } });
    for (const albumYear of [0, 1899, 3000, 1993.5, '1993', null]) {
      const res = validateRow('tracks', { ...track, albumYear });
      expect(res).toEqual({ ok: true, row: track });
    }
  });

  it('drops only the bad albumYear of a top item', () => {
    const item = { rank: 1, id: 'x', imageUrl: null, spotifyUrl: null };
    const res = validateRow('topItems', {
      key: 'tracks:short_term',
      fetchedAt: 1,
      items: [
        { ...item, albumYear: 2001 },
        { ...item, id: 'y', albumYear: 'nope' },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const items = (res.row as unknown as { items: Record<string, unknown>[] })
      .items;
    expect(items[0].albumYear).toBe(2001);
    expect('albumYear' in items[1]).toBe(false);
    expect(items[1].id).toBe('y');
  });

  it('keeps a valid releaseYear and rid on a feature row, drops bad ones', () => {
    const value = { bpm: 120, key: 1, major: true, energy: null, fetchedAt: 1 };
    const row = {
      trackId: 't1',
      isrc: null,
      updatedAt: 1,
      reccobeats: { ...value, rid: 'abc-uuid' },
      releaseYear: { year: 1971, checkedAt: 5 },
    };
    expect(validateRow('features', row)).toEqual({ ok: true, row });
    expect(
      validateRow('features', {
        ...row,
        releaseYear: { year: null, checkedAt: 5 },
      }).ok
    ).toBe(true);
    for (const releaseYear of [
      { year: 0, checkedAt: 5 },
      { year: 1971 },
      { year: '1971', checkedAt: 5 },
      1971,
    ]) {
      const res = validateRow('features', { ...row, releaseYear });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect('releaseYear' in res.row).toBe(false);
        expect(res.row.reccobeats).toEqual({ ...value, rid: 'abc-uuid' });
      }
    }
    for (const rid of [3, '', 'x'.repeat(101)]) {
      const res = validateRow('features', {
        ...row,
        reccobeats: { ...value, rid },
      });
      expect(res).toEqual({ ok: true, row: { ...row, reccobeats: value } });
    }
  });

  it('keeps a mix row year and source, drops a bad one without refusing the mix', () => {
    const r0 = mixRow.rows[0];
    const ok = validateMix({
      ...mixRow,
      rows: [{ ...r0, year: 1993, yearFrom: 'shazam' }],
    });
    expect(ok.ok && ok.row.rows[0]).toMatchObject({
      year: 1993,
      yearFrom: 'shazam',
    });
    const res = validateMix({
      ...mixRow,
      rows: [
        { ...r0, year: 0, yearFrom: 'guess' },
        { ...r0, year: 2010, yearFrom: 'spotify' },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect('year' in res.row.rows[0]).toBe(false);
    expect('yearFrom' in res.row.rows[0]).toBe(false);
    expect(res.row.rows[0].title).toBe('B');
    expect(res.row.rows[1]).toMatchObject({ year: 2010, yearFrom: 'spotify' });
  });
});

describe('validateSharedTrackFact', () => {
  const ID = '0123456789abcdefghijAB';
  const asked = new Set([ID]);
  const row = (over: Record<string, unknown> = {}) => ({
    track_id: ID,
    bpm: 128.5,
    key: 5,
    major: false,
    ...over,
  });

  it('accepts bpm with key and major, bpm only, key only', () => {
    expect(validateSharedTrackFact(row(), asked)).toEqual({
      ok: true,
      row: { trackId: ID, bpm: 128.5, key: 5, major: false },
    });
    expect(
      validateSharedTrackFact(row({ key: null, major: null }), asked).ok
    ).toBe(true);
    expect(
      validateSharedTrackFact(row({ bpm: null, major: null }), asked).ok
    ).toBe(true);
  });

  it('refuses a bpm outside 30..300 or not a number', () => {
    for (const bpm of [0, 29.9, 300.1, NaN, Infinity, '120'])
      expect(validateSharedTrackFact(row({ bpm }), asked).ok, String(bpm)).toBe(
        false
      );
    expect(validateSharedTrackFact(row({ bpm: 30 }), asked).ok).toBe(true);
    expect(validateSharedTrackFact(row({ bpm: 300 }), asked).ok).toBe(true);
  });

  it('refuses a key outside 0..11 or fractional', () => {
    for (const key of [12, -1, 5.5])
      expect(validateSharedTrackFact(row({ key }), asked).ok, String(key)).toBe(
        false
      );
  });

  it('refuses major without key, and both null', () => {
    expect(validateSharedTrackFact(row({ key: null }), asked).ok).toBe(false);
    expect(
      validateSharedTrackFact(row({ bpm: null, key: null, major: null }), asked)
        .ok
    ).toBe(false);
  });

  it('refuses an id that is not 22 base-62 or not asked', () => {
    for (const track_id of ['short', `${ID}x`, 'a'.repeat(21) + '-', 5, null])
      expect(validateSharedTrackFact(row({ track_id }), asked).ok).toBe(false);
    expect(validateSharedTrackFact(row(), new Set(['x'])).ok).toBe(false);
    expect(validateSharedTrackFact(null, asked).ok).toBe(false);
  });
});

describe('validateSharedReachFact', () => {
  const ID = '0123456789abcdefghijAB';
  const asked = new Set([ID]);
  const NOW = Date.parse('2026-11-08T12:00:00Z');
  const row = (over: Record<string, unknown> = {}) => ({
    artist_id: ID,
    source: 'deezer',
    measured_on: '2026-11-01',
    value: 1234,
    ...over,
  });

  it('accepts a row and gives the day as epoch ms at 00:00 UTC', () => {
    expect(validateSharedReachFact(row(), asked, NOW)).toEqual({
      ok: true,
      row: {
        artistId: ID,
        source: 'deezer',
        value: 1234,
        measuredAt: Date.parse('2026-11-01T00:00:00Z'),
      },
    });
    expect(
      validateSharedReachFact(
        row({ source: 'listenbrainz', value: 0, measured_on: '2026-11-08' }),
        asked,
        NOW
      ).ok
    ).toBe(true);
  });

  it('refuses a bad value', () => {
    for (const value of [-1, 1.5, 10000000001, NaN, null, '5'])
      expect(
        validateSharedReachFact(row({ value }), asked, NOW).ok,
        String(value)
      ).toBe(false);
    expect(
      validateSharedReachFact(row({ value: 10000000000 }), asked, NOW).ok
    ).toBe(true);
  });

  it('refuses a future or malformed date, a bad source, an unasked id', () => {
    for (const measured_on of [
      '2026-11-09',
      '2027-11-08',
      'x',
      '2026-13-40',
      5,
    ])
      expect(
        validateSharedReachFact(row({ measured_on }), asked, NOW).ok,
        String(measured_on)
      ).toBe(false);
    expect(
      validateSharedReachFact(row({ source: 'wikipedia' }), asked, NOW).ok
    ).toBe(false);
    expect(
      validateSharedReachFact(row({ artist_id: 'nope' }), asked, NOW).ok
    ).toBe(false);
    expect(validateSharedReachFact(row(), new Set(['y']), NOW).ok).toBe(false);
  });
});

describe('validateMix — round 016 TrackId.net rows', () => {
  const r0 = mixRow.rows[0];
  const trackid = {
    slug: 'a-mix',
    spanStart: 616,
    spanEnd: 857,
    references: 31,
  };
  const t = { ...r0, origin: 'trackid', trackid };
  const ok = (row: object) => validateMix({ ...mixRow, rows: [row] }).ok;
  it('accepts a trackid row and each Shazam check', () => {
    expect(ok(t)).toBe(true);
    expect(ok({ ...t, trackid: { ...trackid, references: undefined } })).toBe(
      true
    );
    for (const outcome of ['agrees', 'no_match', 'not_asked'])
      expect(ok({ ...t, shazamCheck: { outcome } })).toBe(true);
    expect(
      ok({
        ...t,
        shazamCheck: {
          outcome: 'differs',
          artist: 'A',
          title: 'T',
          confidence: 0.7,
        },
      })
    ).toBe(true);
    expect(ok({ ...r0, origin: 'clue' })).toBe(true);
  });
  it('refuses bad bounds, a stray object and an unknown outcome', () => {
    const bad = (over: object) =>
      ok({ ...t, trackid: { ...trackid, ...over } });
    expect(bad({ spanStart: 900 })).toBe(false);
    expect(bad({ spanStart: -1 })).toBe(false);
    expect(bad({ spanEnd: Number.POSITIVE_INFINITY })).toBe(false);
    expect(bad({ spanEnd: 100001 })).toBe(false);
    expect(bad({ slug: 'x'.repeat(201) })).toBe(false);
    expect(bad({ slug: 3 })).toBe(false);
    expect(bad({ references: 1.5 })).toBe(false);
    expect(bad({ references: -1 })).toBe(false);
    expect(ok({ ...r0, trackid })).toBe(false);
    expect(ok({ ...r0, origin: 'replay', trackid })).toBe(false);
    expect(ok({ ...r0, shazamCheck: { outcome: 'agrees' } })).toBe(false);
    expect(ok({ ...t, shazamCheck: { outcome: 'maybe' } })).toBe(false);
    expect(ok({ ...t, shazamCheck: { outcome: 'agrees', artist: 'A' } })).toBe(
      false
    );
    expect(
      ok({ ...t, shazamCheck: { outcome: 'no_match', confidence: 0.5 } })
    ).toBe(false);
    const d = { outcome: 'differs', artist: 'A', title: 'T' };
    expect(ok({ ...t, shazamCheck: { ...d, confidence: 1.1 } })).toBe(false);
    expect(ok({ ...t, shazamCheck: { ...d, title: 'x'.repeat(201) } })).toBe(
      false
    );
  });
});
