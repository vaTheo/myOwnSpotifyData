import { describe, expect, it } from 'vitest';
import { nextSort, sortRows, type SortState } from './sort';

interface Row {
  id: string;
  bpm: number | null;
  name: string;
}

const rows: Row[] = [
  { id: 'a', bpm: 128, name: 'Échos' },
  { id: 'b', bpm: null, name: 'beta' },
  { id: 'c', bpm: 122, name: 'Alpha' },
  { id: 'd', bpm: 128, name: 'delta' },
  { id: 'e', bpm: null, name: 'Charlie' },
];
const bpm = (r: Row) => r.bpm;
const name = (r: Row) => r.name;

describe('sortRows', () => {
  it('sorts numbers ascending and descending, missing values last both ways', () => {
    expect(sortRows(rows, bpm, 'asc').map((r) => r.id)).toEqual([
      'c',
      'a',
      'd',
      'b',
      'e',
    ]);
    expect(sortRows(rows, bpm, 'desc').map((r) => r.id)).toEqual([
      'a',
      'd',
      'c',
      'b',
      'e',
    ]);
  });

  it('is stable: equal values keep their order', () => {
    const ids = sortRows(rows, bpm, 'desc').map((r) => r.id);
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('d'));
  });

  it('compares text without case or accents', () => {
    expect(sortRows(rows, name, 'asc').map((r) => r.name)).toEqual([
      'Alpha',
      'beta',
      'Charlie',
      'delta',
      'Échos',
    ]);
  });

  it('never mutates its input', () => {
    const copy = [...rows];
    sortRows(rows, bpm, 'asc');
    expect(rows).toEqual(copy);
  });
});

describe('nextSort', () => {
  const columns = {
    rank: { firstDirection: 'asc' as const, rank: true },
    plays: { firstDirection: 'desc' as const },
    bpm: { firstDirection: 'asc' as const },
  };
  const initial: SortState = { columnId: null, direction: 'asc' };

  it('sorts by another column in its first direction', () => {
    expect(nextSort(initial, 'plays', columns.plays)).toEqual({
      columnId: 'plays',
      direction: 'desc',
    });
    expect(
      nextSort({ columnId: 'plays', direction: 'desc' }, 'bpm', columns.bpm)
    ).toEqual({ columnId: 'bpm', direction: 'asc' });
  });

  it('flips the direction on the current column', () => {
    expect(
      nextSort({ columnId: 'bpm', direction: 'asc' }, 'bpm', columns.bpm)
    ).toEqual({ columnId: 'bpm', direction: 'desc' });
    expect(
      nextSort({ columnId: 'bpm', direction: 'desc' }, 'bpm', columns.bpm)
    ).toEqual({ columnId: 'bpm', direction: 'asc' });
  });

  it('restores the screen’s own ranking on the rank column', () => {
    expect(
      nextSort({ columnId: 'bpm', direction: 'desc' }, 'rank', columns.rank)
    ).toEqual({ columnId: null, direction: 'asc' });
  });
});
