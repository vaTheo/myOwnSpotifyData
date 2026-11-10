import { describe, expect, it } from 'vitest';
import type { TracklistRow } from '../../db/schema';
import { oneRowPerSong } from './oneRowPerSong';

function row(over: Partial<TracklistRow> = {}): TracklistRow {
  const artist = over.artist ?? 'Artist';
  const title = over.title ?? 'Song';
  return {
    startSec: 0,
    endSec: null,
    label: null,
    source: 'tracklistify',
    gap: false,
    referenceCount: null,
    confidence: null,
    isrc: null,
    shazamUrl: null,
    ...over,
    artist,
    title,
    detected: over.detected ?? { artist, title },
  };
}

function gap(startSec: number): TracklistRow {
  return row({ artist: 'ID', title: 'ID', gap: true, startSec });
}

describe('oneRowPerSong', () => {
  it('keeps one row for a song heard twice, at its earliest time', () => {
    const out = oneRowPerSong([
      row({ startSec: 2470, label: 'late' }),
      row({ startSec: 750, label: 'early' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].startSec).toBe(750);
    expect(out[0].label).toBe('early');
  });

  it('merges copies that differ by case, accents and a mix marker', () => {
    const out = oneRowPerSong([
      row({ artist: 'Café Del Mar', title: 'Song', startSec: 100 }),
      row({ artist: 'cafe del mar', title: 'SONG (Original Mix)', startSec: 200 }),
      row({ artist: 'CAFÉ DEL MAR', title: 'Song - Extended Mix', startSec: 300 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].startSec).toBe(100);
  });

  it('keeps two songs with the same title by different artists', () => {
    const out = oneRowPerSong([
      row({ artist: 'One', startSec: 10 }),
      row({ artist: 'Two', startSec: 20 }),
    ]);
    expect(out.map((r) => r.artist)).toEqual(['One', 'Two']);
  });

  it('sums the clips of the copies', () => {
    const out = oneRowPerSong([
      row({ startSec: 10, hits: 3 }),
      row({ startSec: 20, hits: 2 }),
    ]);
    expect(out[0].hits).toBe(5);
  });

  it('sums only defined clips, and leaves hits absent when no copy has one', () => {
    const some = oneRowPerSong([row({ startSec: 10 }), row({ startSec: 20, hits: 2 })]);
    expect(some[0].hits).toBe(2);
    const none = oneRowPerSong([row({ startSec: 10 }), row({ startSec: 20 })]);
    expect('hits' in none[0]).toBe(false);
  });

  it('keeps the best defined confidence', () => {
    const out = oneRowPerSong([
      row({ startSec: 10, confidence: 60 }),
      row({ startSec: 20, confidence: null }),
      row({ startSec: 30, confidence: 92.5 }),
      row({ startSec: 40 }),
    ]);
    expect(out[0].confidence).toBe(92.5);
    const none = oneRowPerSong([
      row({ startSec: 10, confidence: null }),
      row({ startSec: 20, confidence: null }),
    ]);
    expect(none[0].confidence).toBeNull();
  });

  it('puts a copy without a time after a timed one', () => {
    const out = oneRowPerSong([
      row({ startSec: null, label: 'untimed' }),
      row({ startSec: 900, label: 'timed' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('timed');
  });

  it('keeps the first in input order when no copy has a time', () => {
    const out = oneRowPerSong([
      row({ startSec: null, label: 'first' }),
      row({ startSec: null, label: 'second' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('first');
  });

  it('keeps the first in input order on a tie of times', () => {
    const out = oneRowPerSong([
      row({ startSec: 60, label: 'first' }),
      row({ startSec: 60, label: 'second' }),
    ]);
    expect(out[0].label).toBe('first');
  });

  it('passes gap rows unchanged and never merges them', () => {
    const g1 = gap(100);
    const g2 = gap(500);
    const out = oneRowPerSong([g1, row({ startSec: 200 }), g2]);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(g1);
    expect(out[2]).toBe(g2);
  });

  it('never merges unidentified rows', () => {
    const out = oneRowPerSong([
      row({ artist: 'ID', title: 'ID', startSec: 10 }),
      row({ artist: 'ID', title: 'ID', startSec: 20 }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('keeps the input order of the kept rows', () => {
    const out = oneRowPerSong([
      row({ artist: 'B', startSec: 500 }),
      row({ artist: 'A', startSec: 300 }),
      row({ artist: 'B', startSec: 100 }),
      row({ artist: 'C', startSec: 50 }),
    ]);
    expect(out.map((r) => `${r.artist}@${r.startSec}`)).toEqual([
      'A@300',
      'B@100',
      'C@50',
    ]);
  });

  it('merges three copies into one', () => {
    const out = oneRowPerSong([
      row({ startSec: 300, hits: 1, confidence: 50 }),
      row({ startSec: 100, hits: 2, confidence: 70 }),
      row({ startSec: 200, hits: 4, confidence: 90 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startSec: 100, hits: 7, confidence: 90 });
  });

  it('keeps the earliest copy without clips and sums a later copy\'s', () => {
    const out = oneRowPerSong([
      row({ startSec: 10, label: 'kept' }),
      row({ startSec: 20, hits: 4 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startSec: 10, label: 'kept', hits: 4 });
  });

  it('keeps a heard copy over an earlier clue copy, at its own time', () => {
    const out = oneRowPerSong([
      row({ startSec: 100, origin: 'clue', confidence: 99 }),
      row({ startSec: 900, hits: 2, confidence: 80, isrc: 'GBAAA0000001' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      startSec: 900,
      hits: 2,
      confidence: 80,
      isrc: 'GBAAA0000001',
    });
    expect(out[0].origin).toBeUndefined();
  });

  it('keeps a heard copy over an earlier TrackId.net copy', () => {
    const out = oneRowPerSong([
      row({ startSec: 100, origin: 'trackid', confidence: 99 }),
      row({ startSec: 900, hits: 3, confidence: 70, speedPercent: 4 }),
      row({ startSec: 1200, hits: 1, confidence: 75 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      startSec: 900,
      hits: 4,
      confidence: 75,
      speedPercent: 4,
    });
    expect(out[0].origin).toBeUndefined();
  });

  it('drops a later TrackId.net copy of a heard song', () => {
    const out = oneRowPerSong([
      row({ startSec: 100, hits: 2, confidence: 60 }),
      row({ startSec: 900, origin: 'trackid', confidence: 99 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startSec: 100, hits: 2, confidence: 60 });
    expect(out[0].origin).toBeUndefined();
  });

  it('collapses TrackId.net copies to the earliest, with no clips', () => {
    const out = oneRowPerSong([
      row({ startSec: 900, origin: 'trackid', label: 'late' }),
      row({ startSec: 100, origin: 'trackid', label: 'early' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startSec: 100, label: 'early', origin: 'trackid' });
    expect('hits' in out[0]).toBe(false);
  });

  it('collapses clue copies to the earliest, with no clips', () => {
    const out = oneRowPerSong([
      row({ startSec: null, origin: 'clue', label: 'untimed' }),
      row({ startSec: 300, origin: 'clue', label: 'timed' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startSec: 300, label: 'timed', origin: 'clue' });
    expect('hits' in out[0]).toBe(false);
  });

  it('leaves rows without copies untouched', () => {
    const only = row({ startSec: 10, hits: 1, confidence: 80 });
    expect(oneRowPerSong([only])[0]).toBe(only);
  });
});
