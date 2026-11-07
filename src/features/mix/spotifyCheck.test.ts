import { describe, expect, it, vi } from 'vitest';
import type { TracklistRow } from '../../db/schema';
import type { Query, SpotifyClient } from '../../spotify/client';
import { QuotaError } from '../../spotify/errors';
import {
  applyChecks,
  checkLine,
  checkedRow,
  rowsToCheck,
  runSpotifyCheck,
  storedUri,
} from './spotifyCheck';

function row(title: string, over: Partial<TracklistRow> = {}): TracklistRow {
  return {
    startSec: null,
    endSec: null,
    artist: 'Artist',
    title,
    label: null,
    source: 'manual',
    gap: false,
    detected: null,
    referenceCount: null,
    ...over,
  };
}

/** Answers a search whose query names one of `found` with that track. */
function client(found: string[], fail?: unknown) {
  const get = vi.fn(async (_path: string, query?: Query) => {
    if (fail) throw fail;
    const q = String(query?.q ?? '');
    const hit = found.find((t) => q.includes(t));
    if (!hit) return { tracks: { items: [] } };
    return {
      tracks: {
        items: [
          {
            uri: `spotify:track:${hit}id`,
            id: `${hit}id`,
            name: hit,
            artists: [{ id: null, name: 'Artist' }],
          },
        ],
      },
    };
  });
  return { get, client: { get } as unknown as Pick<SpotifyClient, 'get'> };
}

describe('rowsToCheck (T117)', () => {
  it('takes every named track not checked yet, candidates included; never a gap or an ID', () => {
    const a = row('One');
    const b = row('Two', { spotify: 'not-found', checkedAt: 1 });
    const c = row('Three', { origin: 'clue' });
    const gap = row('', { gap: true, artist: '' });
    const id = row('ID', { artist: 'ID' });
    expect(rowsToCheck([a, b, c, gap, id])).toEqual([a, c]);
  });
});

describe('checkedRow', () => {
  it('keeps the found track as its id and open.spotify.com link', () => {
    expect(checkedRow(row('One'), 'spotify:track:4uLU6hMC', 9)).toMatchObject({
      spotify: {
        id: '4uLU6hMC',
        url: 'https://open.spotify.com/track/4uLU6hMC',
      },
      checkedAt: 9,
    });
  });
  it('says not found when nothing confident came back', () => {
    expect(checkedRow(row('One'), null, 9)).toMatchObject({
      spotify: 'not-found',
      checkedAt: 9,
    });
  });
});

describe('storedUri', () => {
  it('is the found track, else null', () => {
    expect(
      storedUri(
        row('One', {
          spotify: { id: 'X', url: 'https://open.spotify.com/track/X' },
        })
      )
    ).toBe('spotify:track:X');
    expect(storedUri(row('One', { spotify: 'not-found' }))).toBeNull();
    expect(storedUri(row('One'))).toBeNull();
  });
});

describe('applyChecks', () => {
  it('replaces each checked row where it still stands, by identity', () => {
    const a = row('One');
    const b = row('Two');
    const edited = row('Edited');
    const done = new Map([
      [a, { ...a, spotify: 'not-found' as const, checkedAt: 1 }],
      [b, { ...b, spotify: 'not-found' as const, checkedAt: 1 }],
    ]);
    // `b` was edited meanwhile: its answer no longer applies.
    expect(applyChecks([a, edited], done)).toEqual([done.get(a), edited]);
  });
});

describe('checkLine', () => {
  it('reads "Checked 12 of 40"', () => {
    expect(checkLine(12, 40)).toBe('Checked 12 of 40');
  });
});

describe('runSpotifyCheck', () => {
  it('checks one row at a time, reporting each answer and the progress', async () => {
    const rows = [row('One'), row('Two')];
    const { client: c } = client(['One']);
    const seen: [string, string | undefined, number, number][] = [];
    const out = await runSpotifyCheck(
      {
        client: c,
        now: () => 7,
        shouldStop: () => false,
        onChecked: (before, after, done, total) => {
          seen.push([
            before.title,
            typeof after.spotify === 'string'
              ? after.spotify
              : after.spotify?.id,
            done,
            total,
          ]);
        },
      },
      rows
    );
    expect(out).toEqual({ status: 'done', done: 2, total: 2 });
    expect(seen).toEqual([
      ['One', 'Oneid', 1, 2],
      ['Two', 'not-found', 2, 2],
    ]);
  });

  it('stops between rows when asked', async () => {
    const rows = [row('One'), row('Two'), row('Three')];
    const { client: c, get } = client([]);
    let done = 0;
    const out = await runSpotifyCheck(
      {
        client: c,
        now: () => 7,
        shouldStop: () => done >= 1,
        onChecked: () => {
          done += 1;
        },
      },
      rows
    );
    expect(out).toEqual({ status: 'stopped', done: 1, total: 3 });
    // One row: three queries at most (field, plain; no ISRC here).
    expect(get.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('never throws: a failure ends the run with the error and what was done', async () => {
    const quota = new QuotaError(99);
    const { client: c } = client([], quota);
    const onChecked = vi.fn();
    const out = await runSpotifyCheck(
      { client: c, now: () => 7, shouldStop: () => false, onChecked },
      [row('One')]
    );
    expect(out).toEqual({ status: 'error', error: quota, done: 0, total: 1 });
    expect(onChecked).not.toHaveBeenCalled();
  });
});
