import { describe, expect, it } from 'vitest';
import type { PlayRow } from '../db/schema';
import {
  CLASSIC_MIN_PLAYS_PER_YEAR,
  CLASSIC_MIN_YEARS,
  FINISH_MIN_OUTCOMES,
  GEM_WINDOWS,
  MIN_GEM_PLAYS,
  MIN_ROTATION_PLAYS,
  PAGE_SIZE,
  ROTATION_WINDOWS,
  byYear,
  classics,
  finishRate,
  forgottenGems,
  gemCutoff,
  hasMonthData,
  heavyRotation,
  lastMonths,
  monthKey,
  periodMonths,
  rateBand,
  yearsWithPlays,
} from './crate';

/** Mid-month, noon UTC: the same calendar month in every time zone. */
const NOW = new Date('2026-09-15T12:00:00Z');

/** `plays` mirrors the importer's invariant `sum(months) === plays`. */
function row(
  trackId: string,
  months: Record<string, number> | undefined,
  over: Partial<PlayRow> = {}
): PlayRow {
  const plays = Object.values(months ?? {}).reduce((sum, n) => sum + n, 0);
  const base: PlayRow = {
    trackId,
    plays,
    msPlayed: plays * 200_000,
    firstTs: '2016-06-15T12:00:00Z',
    lastTs: '2026-09-15T12:00:00Z',
    trackName: `Song ${trackId}`,
    artistName: 'Daft Punk',
  };
  return months === undefined
    ? { ...base, ...over }
    : { ...base, months, ...over };
}

/** Gems care only about lifetime plays and the last play; the month is filler. */
function gem(trackId: string, plays: number, lastTs: string): PlayRow {
  return row(trackId, { '2019-06': plays }, { lastTs });
}

function outcome(
  trackId: string,
  plays: number,
  counts: { finished: number; skipped: number; attempts: number }
): PlayRow {
  return row(trackId, { '2026-08': plays }, counts);
}

describe('thresholds', () => {
  it('pins the numbers the captions and chip rows quote', () => {
    expect(ROTATION_WINDOWS).toEqual([1, 3, 6]);
    expect(GEM_WINDOWS).toEqual([6, 12, 24]);
    expect([MIN_ROTATION_PLAYS, MIN_GEM_PLAYS]).toEqual([3, 10]);
    expect([CLASSIC_MIN_PLAYS_PER_YEAR, CLASSIC_MIN_YEARS]).toEqual([3, 3]);
    expect(FINISH_MIN_OUTCOMES).toBe(10);
    expect(PAGE_SIZE).toBe(100);
  });
});

describe('monthKey and lastMonths', () => {
  it('pads the month and ends the window with now', () => {
    expect(monthKey(NOW)).toBe('2026-09');
    expect(lastMonths(NOW, 1)).toEqual(['2026-09']);
    expect(lastMonths(NOW, 3)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(lastMonths(NOW, 6)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('crosses the year boundary, oldest first', () => {
    const january = new Date('2026-01-15T12:00:00Z');
    expect(lastMonths(january, 3)).toEqual(['2025-11', '2025-12', '2026-01']);
    expect(lastMonths(new Date('2026-02-15T12:00:00Z'), 6)).toEqual([
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });
});

describe('periodMonths', () => {
  it('takes Winter from December of the previous year', () => {
    expect(periodMonths(2022, 'winter')).toEqual([
      '2021-12',
      '2022-01',
      '2022-02',
    ]);
  });

  it('lists the other seasons, a single month and the whole year', () => {
    expect(periodMonths(2022, 'spring')).toEqual([
      '2022-03',
      '2022-04',
      '2022-05',
    ]);
    expect(periodMonths(2022, 'summer')).toEqual([
      '2022-06',
      '2022-07',
      '2022-08',
    ]);
    expect(periodMonths(2022, 'autumn')).toEqual([
      '2022-09',
      '2022-10',
      '2022-11',
    ]);
    expect(periodMonths(2022, 6)).toEqual(['2022-06']);
    const all = periodMonths(2022, 'all');
    expect(all).toHaveLength(12);
    expect([all[0], all[11]]).toEqual(['2022-01', '2022-12']);
  });
});

describe('yearsWithPlays', () => {
  it('lists years ascending and ignores rows without months', () => {
    const rows = [
      row('a', { '2019-03': 2, '2016-11': 1 }),
      row('b', { '2019-05': 4, '2022-01': 0 }),
      row('c', undefined, { plays: 99 }),
    ];
    expect(yearsWithPlays(rows)).toEqual([2016, 2019]);
    expect(hasMonthData(rows[0])).toBe(true);
    expect(hasMonthData(rows[2])).toBe(false);
  });
});

const rotation = [
  row('hot', { '2024-01': 14, '2026-07': 9, '2026-08': 12, '2026-09': 6 }),
  row('fresh', { '2026-09': 5 }),
  row('edge', { '2026-08': 3 }),
  row('thin', { '2026-09': 2 }),
  row('old', { '2026-06': 40 }),
  row('nomonths', undefined, { plays: 500 }),
];

describe('heavyRotation', () => {
  it('keeps three or more plays in the window, most played first', () => {
    expect(
      heavyRotation(rotation, NOW, 3).map((i) => [i.row.trackId, i.windowPlays])
    ).toEqual([
      ['hot', 27],
      ['fresh', 5],
      ['edge', 3],
    ]);
  });

  it('flags a track whose every play falls inside the window', () => {
    expect(
      heavyRotation(rotation, NOW, 3).map((i) => [i.row.trackId, i.isNew])
    ).toEqual([
      ['hot', false],
      ['fresh', true],
      ['edge', true],
    ]);
  });

  it('widens to six months and ties on lifetime plays then name', () => {
    expect(heavyRotation(rotation, NOW, 6).map((i) => i.row.trackId)).toEqual([
      'old',
      'hot',
      'fresh',
      'edge',
    ]);
    const ties = [
      row('t1', { '2026-08': 4 }, { trackName: 'Beta' }),
      row('t2', { '2026-08': 4 }, { trackName: 'Alpha' }),
      row('t3', { '2020-01': 30, '2026-08': 4 }, { trackName: 'Zulu' }),
    ];
    expect(heavyRotation(ties, NOW, 3).map((i) => i.row.trackName)).toEqual([
      'Zulu',
      'Alpha',
      'Beta',
    ]);
  });
});

const gems = [
  gem('gem', 214, '2023-02-19T12:00:00Z'),
  gem('recent', 80, '2026-08-15T12:00:00Z'),
  gem('thin', 9, '2019-06-15T12:00:00Z'),
  gem('exact', 10, '2019-06-15T12:00:00Z'),
  gem('edgeIn', 12, '2026-03-14T12:00:00Z'),
  gem('edgeOut', 13, '2026-03-16T12:00:00Z'),
  row('nomonths', undefined, { plays: 500, lastTs: '2016-01-15T12:00:00Z' }),
];

describe('forgottenGems', () => {
  it('needs ten plays and nothing since the cutoff, most played first', () => {
    const items = forgottenGems(gems, NOW, 12);
    expect(items.map((i) => i.row.trackId)).toEqual(['gem', 'exact']);
    expect(items[0].lastPlayed.toISOString()).toBe('2023-02-19T12:00:00.000Z');
  });

  it('cuts to the day at six months', () => {
    expect(forgottenGems(gems, NOW, 6).map((i) => i.row.trackId)).toEqual([
      'gem',
      'edgeIn',
      'exact',
    ]);
  });

  it('clamps the cutoff to the end of a shorter month', () => {
    const cutoff = gemCutoff(new Date(2026, 7, 31, 12), 6);
    expect([cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate()]).toEqual(
      [2026, 1, 28]
    );
    const year = gemCutoff(NOW, 12);
    expect([year.getFullYear(), year.getMonth()]).toEqual([2025, 8]);
  });
});

const classicRows = [
  row('classic', {
    '2020-01': 30,
    '2016-05': 8,
    '2018-07': 3,
    '2017-03': 11,
    '2019-02': 2,
  }),
  row('twoYears', { '2016-05': 20, '2017-05': 20 }),
  row('thinYears', { '2016-05': 2, '2017-05': 2, '2018-05': 2, '2019-05': 2 }),
  row('steady', { '2021-01': 3, '2022-01': 3, '2023-01': 3 }),
  row('heavy', { '2021-01': 60, '2022-01': 3, '2023-01': 3 }),
  row('nomonths', undefined, { plays: 900 }),
];

describe('classics', () => {
  it('needs three years of three plays and sorts by years then plays', () => {
    expect(
      classics(classicRows, 'years').map((i) => [i.row.trackId, i.yearsActive])
    ).toEqual([
      ['classic', 4],
      ['heavy', 3],
      ['steady', 3],
    ]);
  });

  it('sorts by plays then years and folds months into ordered years', () => {
    const items = classics(classicRows, 'plays');
    expect(items.map((i) => [i.row.trackId, i.row.plays])).toEqual([
      ['heavy', 66],
      ['classic', 54],
      ['steady', 9],
    ]);
    expect([...items[1].perYear]).toEqual([
      [2016, 8],
      [2017, 11],
      [2018, 3],
      [2019, 2],
      [2020, 30],
    ]);
  });
});

const yearRows = [
  row('a', {
    '2021-12': 4,
    '2022-01': 6,
    '2022-03': 20,
    '2022-07': 5,
    '2026-08': 3,
  }),
  row('b', { '2022-02': 8, '2022-03': 20, '2023-05': 2 }),
  row('c', { '2022-03': 1 }),
  row('nomonths', undefined, { plays: 77 }),
];

describe('byYear', () => {
  it('sums the year and drops tracks with no plays in it', () => {
    const result = byYear(yearRows, 2022, 'all');
    expect(
      result.items.map((i) => [i.row.trackId, i.selectionPlays, i.yearPlays])
    ).toEqual([
      ['a', 31, 31],
      ['b', 28, 28],
      ['c', 1, 1],
    ]);
    expect([result.plays, result.tracks]).toEqual([60, 3]);
  });

  it('keeps the year total when Winter reaches into the previous year', () => {
    const result = byYear(yearRows, 2022, 'winter');
    expect(
      result.items.map((i) => [i.row.trackId, i.selectionPlays, i.yearPlays])
    ).toEqual([
      ['a', 10, 31],
      ['b', 8, 28],
    ]);
    expect([result.plays, result.tracks]).toEqual([18, 2]);
  });

  it('drills into one month and ties on lifetime plays', () => {
    const result = byYear(yearRows, 2022, 3);
    expect(result.items.map((i) => i.row.trackId)).toEqual(['a', 'b', 'c']);
    expect([result.plays, result.tracks]).toEqual([41, 3]);
  });

  it('returns an empty result for a month with no plays', () => {
    expect(byYear(yearRows, 2022, 5)).toEqual({
      items: [],
      plays: 0,
      tracks: 0,
    });
  });
});

const finishRows = [
  outcome('loyal', 300, { finished: 312, skipped: 12, attempts: 331 }),
  outcome('mixed', 20, { finished: 10, skipped: 10, attempts: 25 }),
  outcome('tieA', 5, { finished: 5, skipped: 5, attempts: 10 }),
  // Short records only: `plays: 0` with an empty `months`, still counted.
  row('bail', {}, { finished: 2, skipped: 14, attempts: 20 }),
  outcome('rare', 30, { finished: 5, skipped: 4, attempts: 12 }),
  row('nomonths', undefined, { plays: 60, finished: 50, skipped: 50 }),
];

describe('finishRate', () => {
  it('needs ten clear outcomes and ranks Finished by rate then plays', () => {
    const items = finishRate(finishRows, 'finished');
    expect(items.map((i) => i.row.trackId)).toEqual([
      'loyal',
      'mixed',
      'tieA',
      'bail',
    ]);
    expect(items[0].outcomes).toBe(324);
    expect(items[0].unclear).toBe(7);
    expect(items[0].rate).toBeCloseTo(0.963, 3);
  });

  it('ranks Skipped by rate ascending then outcomes, keeping short rows', () => {
    const items = finishRate(finishRows, 'skipped');
    expect(items.map((i) => i.row.trackId)).toEqual([
      'bail',
      'mixed',
      'tieA',
      'loyal',
    ]);
    expect(items[0].row.plays).toBe(0);
    expect([items[0].rate, items[0].outcomes, items[0].unclear]).toEqual([
      0.125, 16, 4,
    ]);
  });

  it('bands the rate for the badge colour', () => {
    expect([rateBand(1), rateBand(0.65)]).toEqual(['high', 'high']);
    expect([rateBand(0.6499), rateBand(0.35)]).toEqual(['mid', 'mid']);
    expect([rateBand(0.3499), rateBand(0)]).toEqual(['low', 'low']);
  });
});
