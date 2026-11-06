import { describe, expect, it } from 'vitest';
import type { PlayRow } from '../../db/schema';
import {
  barHeights,
  heatLevel,
  meterBand,
  monthKeys,
  monthSeries,
  periodTotal,
  seriesLabel,
  yearMonthTotals,
  yearSpan,
} from './series';

// Mid-month instants, so the local month is the same in every time zone.
const RANGE = { first: '2025-11-15T12:00:00Z', last: '2026-02-14T12:00:00Z' };

function row(months: Record<string, number> | undefined): PlayRow {
  return {
    trackId: 't',
    plays: 0,
    msPlayed: 0,
    firstTs: '2025-01-01T00:00:00Z',
    lastTs: '2026-01-01T00:00:00Z',
    trackName: null,
    artistName: null,
    months,
  };
}

describe('monthKeys', () => {
  it('lists every month from the first to the last, across a new year', () => {
    expect(monthKeys('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('is empty when the last month is before the first', () => {
    expect(monthKeys('2026-02', '2025-11')).toEqual([]);
  });
});

describe('monthSeries', () => {
  it('value is null for a month outside the imported history range (drawn as a gap), and 0 for a month inside it with no plays', () => {
    const series = monthSeries(
      { '2025-11': 3, '2026-02': 5 },
      ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'],
      RANGE
    );
    expect(series).toEqual([
      { key: '2025-10', value: null },
      { key: '2025-11', value: 3 },
      { key: '2025-12', value: 0 },
      { key: '2026-01', value: 0 },
      { key: '2026-02', value: 5 },
      { key: '2026-03', value: null },
    ]);
  });

  it('accepts a range given as month keys', () => {
    const series = monthSeries({}, ['2025-10', '2025-11'], {
      first: '2025-11',
      last: '2025-11',
    });
    expect(series.map((p) => p.value)).toEqual([null, 0]);
  });

  it('treats every month as inside the history when there is no range', () => {
    const series = monthSeries(undefined, ['2025-10', '2025-11'], null);
    expect(series.map((p) => p.value)).toEqual([0, 0]);
  });
});

describe('barHeights', () => {
  it("scales to the series' own peak, keeps a minimum of 1 px for any value above 0, and gives 0 for 0", () => {
    const series = [
      { key: '2026-01', value: 200 },
      { key: '2026-02', value: 100 },
      { key: '2026-03', value: 1 },
      { key: '2026-04', value: 0 },
      { key: '2026-05', value: null },
    ];
    expect(barHeights(series, 40)).toEqual([40, 20, 1, 0, null]);
  });

  it('gives 0 for every month of a series without plays', () => {
    expect(
      barHeights(
        [
          { key: '2026-01', value: 0 },
          { key: '2026-02', value: null },
        ],
        40
      )
    ).toEqual([0, null]);
  });
});

describe('heatLevel', () => {
  it("0 for no plays, and 1–4 for quartiles of the owner's busiest month", () => {
    expect(heatLevel(0, 100)).toBe(0);
    expect(heatLevel(1, 100)).toBe(1);
    expect(heatLevel(25, 100)).toBe(1);
    expect(heatLevel(26, 100)).toBe(2);
    expect(heatLevel(50, 100)).toBe(2);
    expect(heatLevel(75, 100)).toBe(3);
    expect(heatLevel(76, 100)).toBe(4);
    expect(heatLevel(100, 100)).toBe(4);
  });

  it('0 for a missing month or a history without plays', () => {
    expect(heatLevel(null, 100)).toBe(0);
    expect(heatLevel(0, 0)).toBe(0);
  });
});

describe('meterBand', () => {
  it('reads the band off the percentage with the Finish rate thresholds', () => {
    expect(meterBand(65)).toBe('high');
    expect(meterBand(64)).toBe('mid');
    expect(meterBand(35)).toBe('mid');
    expect(meterBand(34)).toBe('low');
  });
});

describe('yearSpan', () => {
  it('runs from the import range, gaps included', () => {
    expect(
      yearSpan(
        [row({ '2024-05': 1 })],
        { first: '2021-06-15T12:00:00Z', last: '2024-06-15T12:00:00Z' },
        2030
      )
    ).toEqual([2021, 2022, 2023, 2024]);
  });

  it('falls back to the years played, then to the fallback year', () => {
    expect(yearSpan([row({ '2022-05': 1, '2024-01': 2 })], null, 2030)).toEqual(
      [2022, 2023, 2024]
    );
    expect(yearSpan([], null, 2030)).toEqual([2030]);
  });
});

describe('yearMonthTotals', () => {
  it("twelve totals and the year's total per year, over the span spanYears uses", () => {
    const rows = [
      row({ '2025-11': 3, '2025-12': 1, '2026-01': 4 }),
      row({ '2025-12': 2, '2026-02': 5 }),
      row(undefined),
    ];
    const totals = yearMonthTotals(rows, RANGE, 2030);
    expect(totals.map((t) => t.year)).toEqual([2025, 2026]);
    expect(totals[0].months).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      3,
      3,
    ]);
    expect(totals[0].total).toBe(6);
    expect(totals[1].months.slice(0, 3)).toEqual([4, 5, null]);
    expect(totals[1].months).toHaveLength(12);
    expect(totals[1].total).toBe(9);
    expect(totals[1].max).toBe(5);
  });

  it('keeps every month when there is no range', () => {
    const totals = yearMonthTotals([row({ '2024-03': 2 })], null, 2030);
    expect(totals).toHaveLength(1);
    expect(totals[0].months[0]).toBe(0);
    expect(totals[0].months[2]).toBe(2);
  });
});

describe('periodTotal', () => {
  const totals = yearMonthTotals(
    [row({ '2025-11': 3, '2025-12': 1, '2026-01': 4, '2026-02': 5 })],
    RANGE,
    2030
  );

  it('sums a month, the year, and a season, Winter including the previous December', () => {
    expect(periodTotal(totals, 2026, 1)).toBe(4);
    expect(periodTotal(totals, 2026, 'all')).toBe(9);
    expect(periodTotal(totals, 2026, 'winter')).toBe(10);
    expect(periodTotal(totals, 2025, 'autumn')).toBe(3);
  });

  it('gives 0 for a period outside the span', () => {
    expect(periodTotal(totals, 2019, 'summer')).toBe(0);
  });
});

describe('seriesLabel', () => {
  it('lists the months without a year when the series stays in one year', () => {
    expect(
      seriesLabel('Plays per month', [
        { key: '2026-06', value: 4 },
        { key: '2026-07', value: 0 },
        { key: '2026-08', value: null },
      ])
    ).toBe('Plays per month: Jun 4, Jul 0, Aug not in the history');
  });

  it('names the year when the series crosses one', () => {
    expect(
      seriesLabel('Plays per month', [
        { key: '2025-12', value: 1 },
        { key: '2026-01', value: 12 },
      ])
    ).toBe('Plays per month: Dec 2025 1, Jan 2026 12');
  });
});
