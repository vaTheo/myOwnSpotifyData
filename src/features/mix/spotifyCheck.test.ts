import { describe, expect, it, vi } from 'vitest';
import type { TracklistRow } from '../../db/schema';
import type { Query, SpotifyClient } from '../../spotify/client';
import { QuotaError } from '../../spotify/errors';
import {
  answerFor,
  applyAnswers,
  checkLine,
  checkedRow,
  keepStoredAnswers,
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

describe('applyAnswers (fix round 1)', () => {
  const found = (index: number, title: string) =>
    answerFor(index, row(title), 'spotify:track:X' + index, 9);
  const missed = (index: number, title: string) =>
    answerFor(index, row(title), null, 9);

  it('puts each answer on the row at its place', () => {
    const out = applyAnswers([row('One'), row('Two')], [missed(1, 'Two')]);
    expect(out[0].spotify).toBeUndefined();
    expect(out[1]).toMatchObject({ spotify: 'not-found', checkedAt: 9 });
  });

  it('keeps the answer of a row validated during the check (a new object)', () => {
    const rows = [row('One'), row('Two')];
    const validated = [rows[0], { ...rows[1], validated: true }];
    const out = applyAnswers(validated, [found(1, 'Two')]);
    expect(out[1]).toMatchObject({
      validated: true,
      spotify: { id: 'X1', url: 'https://open.spotify.com/track/X1' },
    });
  });

  it('keeps the answers on a list reloaded during the check (copies of every row)', () => {
    const rows = [row('One'), row('Two')];
    const reloaded = rows.map((r) => ({ ...r }));
    const out = applyAnswers(reloaded, [found(0, 'One'), missed(1, 'Two')]);
    expect(out.map((r) => r.spotify)).toEqual([
      { id: 'X0', url: 'https://open.spotify.com/track/X0' },
      'not-found',
    ]);
  });

  it('follows a row moved up by a deletion above it', () => {
    const out = applyAnswers([row('Two')], [missed(1, 'Two')]);
    expect(out[0].spotify).toBe('not-found');
  });

  it('drops the answer of a row edited or deleted during the check', () => {
    const edited = [row('One'), row('Two (my edit)')];
    expect(applyAnswers(edited, [missed(1, 'Two')])).toEqual(edited);
    const deleted = [row('One')];
    expect(applyAnswers(deleted, [missed(1, 'Two')])).toEqual(deleted);
  });

  it('gives one row one answer, never guessing between two same tracks', () => {
    const twice = [row('Same'), row('Other'), row('Same')];
    // Both answers find their own place.
    const out = applyAnswers(twice, [missed(0, 'Same'), found(2, 'Same')]);
    expect(out[0].spotify).toBe('not-found');
    expect(typeof out[2].spotify).toBe('object');
    // Places gone and two candidates left: dropped, not guessed.
    const moved = [row('Same'), row('Same')];
    expect(applyAnswers(moved, [missed(5, 'Same')])).toEqual(moved);
  });
});

describe('keepStoredAnswers (S13 B3)', () => {
  const checked = (title: string, id: string | null) =>
    checkedRow(row(title), id === null ? null : `spotify:track:${id}`, 5);

  it('puts a stored answer on the same unchecked row', () => {
    const out = keepStoredAnswers(
      [row('One'), row('Two')],
      [row('One'), checked('Two', 'B')]
    );
    expect(out[0].spotify).toBeUndefined();
    expect(out[1]).toMatchObject({
      spotify: { id: 'B', url: 'https://open.spotify.com/track/B' },
      checkedAt: 5,
    });
  });

  it('never replaces an answer the row already holds', () => {
    const mine = checkedRow(row('One'), 'spotify:track:A', 9);
    const out = keepStoredAnswers([mine], [checked('One', null)]);
    expect(out[0]).toMatchObject({ spotify: { id: 'A' }, checkedAt: 9 });
  });

  it('drops a stored answer whose row now reads another track', () => {
    const out = keepStoredAnswers([row('Edited')], [checked('One', 'A')]);
    expect(out[0].spotify).toBeUndefined();
  });

  it('follows a row moved up by a deletion', () => {
    const out = keepStoredAnswers(
      [row('Two')],
      [row('One'), checked('Two', 'B')]
    );
    expect(out[0]).toMatchObject({ spotify: { id: 'B' } });
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
        onChecked: (answer, done, total) => {
          seen.push([
            answer.title,
            typeof answer.spotify === 'string'
              ? answer.spotify
              : answer.spotify.id,
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
