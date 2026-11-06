import { describe, expect, it } from 'vitest';
import type { FeatureRow, TopItemsRow, TrackRow } from '../db/schema';
import type { Model } from './aggregate';
import { MIN_YEAR, parseYear, yearOf } from './year';

const NOW = Date.UTC(2026, 10, 7);

describe('parseYear', () => {
  it('keeps the year of a day, month or year date', () => {
    expect(parseYear('1993-05-17', NOW)).toBe(1993);
    expect(parseYear('1993-05', NOW)).toBe(1993);
    expect(parseYear('1993', NOW)).toBe(1993);
    expect(parseYear(' 1993 ', NOW)).toBe(1993);
    expect(parseYear('1993/05/17', NOW)).toBe(1993);
  });

  it('accepts whole numbers', () => {
    expect(parseYear(1971, NOW)).toBe(1971);
    expect(parseYear(1971.5, NOW)).toBeNull();
    expect(parseYear(Number.NaN, NOW)).toBeNull();
  });

  it('bounds the year to 1900..now + 1', () => {
    expect(parseYear(MIN_YEAR, NOW)).toBe(1900);
    expect(parseYear(1899, NOW)).toBeNull();
    expect(parseYear('0000', NOW)).toBeNull();
    expect(parseYear(2027, NOW)).toBe(2027);
    expect(parseYear('2028-01-01', NOW)).toBeNull();
  });

  it('drops junk', () => {
    for (const v of [
      undefined,
      null,
      '',
      'soon',
      '93',
      '19930',
      '1993x',
      {},
      [1993],
      true,
    ]) {
      expect(parseYear(v, NOW)).toBeNull();
    }
  });
});

function model(parts: {
  features?: FeatureRow[];
  tracks?: Partial<TrackRow>[];
  topItems?: TopItemsRow[];
}): Model {
  return {
    features: new Map((parts.features ?? []).map((f) => [f.trackId, f])),
    tracksByKey: new Map(
      (parts.tracks ?? []).map((t) => [t.key as string, t as TrackRow])
    ),
    topItems: new Map((parts.topItems ?? []).map((t) => [t.key, t])),
  } as unknown as Model;
}

const top = (albumYear?: number): TopItemsRow => ({
  key: 'tracks:short_term',
  period: 'short_term',
  fetchedAt: 1,
  type: 'tracks',
  items: [
    {
      rank: 1,
      id: 't1',
      name: 'N',
      artists: [],
      album: 'A',
      imageUrl: null,
      spotifyUrl: null,
      ...(albumYear === undefined ? {} : { albumYear }),
    },
  ],
});

describe('yearOf', () => {
  const feature = (year: number | null): FeatureRow => ({
    trackId: 't1',
    isrc: null,
    updatedAt: 1,
    releaseYear: { year, checkedAt: 1 },
  });

  it('prefers ReccoBeats, then the album year, then a Top item', () => {
    const all = model({
      features: [feature(1971)],
      tracks: [{ key: 't1', albumYear: 2007 }],
      topItems: [top(2010)],
    });
    expect(yearOf(all, 't1')).toBe(1971);
    const noRecco = model({
      features: [feature(null)],
      tracks: [{ key: 't1', albumYear: 2007 }],
      topItems: [top(2010)],
    });
    expect(yearOf(noRecco, 't1')).toBe(2007);
    expect(yearOf(model({ topItems: [top(2010)] }), 't1')).toBe(2010);
  });

  it('is null when no source dates the track', () => {
    expect(yearOf(model({}), 't1')).toBeNull();
    expect(
      yearOf(
        model({
          features: [feature(null)],
          tracks: [{ key: 't1' }],
          topItems: [top()],
        }),
        't1'
      )
    ).toBeNull();
    expect(yearOf(model({ topItems: [top(2010)] }), 'other')).toBeNull();
  });
});
