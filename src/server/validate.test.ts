import { describe, expect, it } from 'vitest';
import {
  validateJobRow,
  validateMix,
  validateRow,
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
    expect(validateJobRow(full)).toEqual(full);
    const queued = {
      ...full,
      status: 'queued',
      claimed_by: null,
      claimed_at: null,
      finished_at: null,
    };
    expect(validateJobRow(queued)).toEqual(queued);
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
