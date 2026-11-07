import { describe, expect, it } from 'vitest';
import { parseKeyText } from '../../model/keys';
import {
  EMPTY_FILTER,
  clearCriteria,
  filterError,
  filterTracks,
  hasCriteria,
  isFiltering,
  type FilterFeature,
  type TrackFilter,
} from './trackFilter';

interface Row {
  id: string;
  title: string;
  feature: FilterFeature | null;
}

const A8 = parseKeyText('8A')!;

function row(
  id: string,
  bpm: number | null,
  key: string | null,
  title = id
): Row {
  const sig = key ? parseKeyText(key) : null;
  return {
    id,
    title,
    feature:
      bpm === null && sig === null
        ? null
        : { bpm, key: sig?.key ?? null, major: sig?.major ?? null },
  };
}

const ROWS: Row[] = [
  row('a', 124, '8A', 'Café del Mar'),
  row('b', 126, '9A', 'Night Drive'),
  row('c', 128, '8B', 'Signal'),
  row('d', 130, '8A', 'Orbit'),
  row('e', null, '8A', 'No tempo'),
  row('f', 125, null, 'No key'),
  row('g', 127, '3A', 'Far away'),
  row('h', null, null, 'Nothing known'),
  row('i', 126, '10A', 'Boost'),
  row('j', 126, '6A', 'Two down'),
];

const ids = (rows: Row[]) => rows.map((r) => r.id);
const run = (filter: Partial<TrackFilter>) =>
  ids(
    filterTracks(
      ROWS,
      (r) => r.feature,
      { ...EMPTY_FILTER, ...filter },
      (r) => r.title
    )
  );

describe('filterTracks (data-model §4)', () => {
  it('keeps every row, in order, when nothing is set', () => {
    expect(run({})).toEqual(ids(ROWS));
  });

  it('keeps a row only if every set criterion holds', () => {
    expect(run({ bpmMin: 124, bpmMax: 128, key: A8 })).toEqual(['a']);
    expect(
      run({ bpmMin: 124, bpmMax: 128, key: A8, compatible: true })
    ).toEqual(['a', 'b', 'c', 'i']);
  });

  it('takes the BPM range inclusively, either end alone', () => {
    expect(run({ bpmMin: 126, bpmMax: 128 })).toEqual([
      'b',
      'c',
      'g',
      'i',
      'j',
    ]);
    expect(run({ bpmMin: 128 })).toEqual(['c', 'd']);
    expect(run({ bpmMax: 124 })).toEqual(['a']);
  });

  it('fails a BPM criterion for a row without BPM', () => {
    expect(run({ bpmMin: 0 })).not.toContain('e');
    expect(run({ bpmMin: 0 })).not.toContain('h');
  });

  it('fails a key criterion for a row without a key or without a mode', () => {
    const noMode: Row = {
      id: 'm',
      title: 'm',
      feature: { bpm: 124, key: 9, major: null },
    };
    const kept = filterTracks(
      [...ROWS, noMode],
      (r) => r.feature,
      { ...EMPTY_FILTER, key: A8, compatible: true },
      (r) => r.title
    );
    expect(ids(kept)).not.toContain('f');
    expect(ids(kept)).not.toContain('h');
    expect(ids(kept)).not.toContain('m');
  });

  it('means keyRelation(seed, key) !== "none" by compatible', () => {
    // 8A: same 8A, relative 8B, adjacent 7A and 9A, boost 10A; 6A is two
    // steps down and 3A is far away.
    expect(run({ key: A8, compatible: true })).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'i',
    ]);
    expect(run({ key: A8 })).toEqual(['a', 'd', 'e']);
  });

  it('shows bpmMin > bpmMax as an error and filters nothing by BPM', () => {
    const filter = { ...EMPTY_FILTER, bpmMin: 130, bpmMax: 120 };
    expect(filterError(filter)).toBe('Min is above max');
    expect(run({ bpmMin: 130, bpmMax: 120 })).toEqual(ids(ROWS));
    // The other criteria still hold.
    expect(run({ bpmMin: 130, bpmMax: 120, key: A8 })).toEqual(['a', 'd', 'e']);
    expect(filterError({ ...EMPTY_FILTER, bpmMin: 120, bpmMax: 120 })).toBe(
      null
    );
  });

  it('matches the text through normalize: case, accents, punctuation', () => {
    expect(run({ text: 'cafe' })).toEqual(['a']);
    expect(run({ text: 'NIGHT-drive' })).toEqual(['b']);
    expect(run({ text: '  ' })).toEqual(ids(ROWS));
  });

  it('ignores the text when the table gives no text of a row', () => {
    const kept = filterTracks(ROWS, (r) => r.feature, {
      ...EMPTY_FILTER,
      text: 'zzz',
    });
    expect(kept).toHaveLength(ROWS.length);
  });
});

describe('the filter state', () => {
  it('tells criteria (what Clear filters resets) from the text', () => {
    expect(hasCriteria(EMPTY_FILTER)).toBe(false);
    expect(hasCriteria({ ...EMPTY_FILTER, text: 'x' })).toBe(false);
    expect(hasCriteria({ ...EMPTY_FILTER, bpmMax: 120 })).toBe(true);
    expect(hasCriteria({ ...EMPTY_FILTER, key: A8 })).toBe(true);
    expect(isFiltering({ ...EMPTY_FILTER, text: 'x' })).toBe(true);
    expect(isFiltering({ ...EMPTY_FILTER, text: ' ' })).toBe(false);
  });

  it('clears everything but the text', () => {
    expect(
      clearCriteria({
        text: 'kia',
        bpmMin: 1,
        bpmMax: 2,
        key: A8,
        compatible: true,
      })
    ).toEqual({ ...EMPTY_FILTER, text: 'kia' });
  });
});
