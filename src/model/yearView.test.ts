import { describe, expect, it } from 'vitest';
import {
  applyYearView,
  decadesPresent,
  effectiveYearView,
  NO_YEAR_VIEW,
} from './yearView';

interface Song {
  name: string;
  year: number | null;
}
const songs: Song[] = [
  { name: 'a', year: 2019 },
  { name: 'b', year: 1993 },
  { name: 'c', year: null },
  { name: 'd', year: 1987 },
  { name: 'e', year: 1993 },
  { name: 'f', year: 1999 },
  { name: 'g', year: 2000 },
];
const yearOf = (s: Song) => s.year;
const names = (list: Song[]) => list.map((s) => s.name).join('');

describe('applyYearView', () => {
  it('keeps the input order and every item when off', () => {
    const out = applyYearView(songs, yearOf, NO_YEAR_VIEW);
    expect(names(out)).toBe('abcdefg');
    expect(out).not.toBe(songs);
  });
  it('sorts oldest first, undated last, ties in input order', () => {
    expect(
      names(applyYearView(songs, yearOf, { sortByYear: true, decade: null }))
    ).toBe('dbefgac');
  });
  it('keeps one decade, its first and last years included', () => {
    expect(
      names(applyYearView(songs, yearOf, { sortByYear: false, decade: 1990 }))
    ).toBe('bef');
    expect(
      names(applyYearView(songs, yearOf, { sortByYear: true, decade: 2000 }))
    ).toBe('g');
    expect(
      applyYearView(songs, yearOf, { sortByYear: false, decade: 1970 })
    ).toEqual([]);
  });
  it('does not mutate the input', () => {
    const copy = [...songs];
    applyYearView(songs, yearOf, { sortByYear: true, decade: null });
    expect(songs).toEqual(copy);
  });
});

describe('decadesPresent', () => {
  it('lists the decades dated items fall in, ascending', () => {
    expect(decadesPresent(songs, yearOf)).toEqual([1980, 1990, 2000, 2010]);
  });
  it('is empty when nothing is dated', () => {
    expect(decadesPresent([{ name: 'x', year: null }], yearOf)).toEqual([]);
  });
});

describe('effectiveYearView', () => {
  it('is off when nothing is dated', () => {
    expect(effectiveYearView({ sortByYear: true, decade: 1990 }, [])).toEqual(
      NO_YEAR_VIEW
    );
  });
  it('drops a decade the list does not hold and keeps the sort', () => {
    expect(
      effectiveYearView({ sortByYear: true, decade: 1970 }, [1990, 2000])
    ).toEqual({ sortByYear: true, decade: null });
  });
  it('keeps a decade the list holds', () => {
    const view = { sortByYear: false, decade: 1990 };
    expect(effectiveYearView(view, [1990])).toBe(view);
  });
});
