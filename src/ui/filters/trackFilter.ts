import { keyRelation, type KeySig } from '../../model/keys';
import { normalize } from '../../model/normalize';
import { decadeOf } from '../../model/year';

/**
 * The filters of one track table (spec 003, data-model §4, research D12).
 * Held in a session signal per table, never in the address.
 */
export interface TrackFilter {
  /** Free text, matched through `normalize` (case, accents). */
  text: string;
  bpmMin: number | null;
  bpmMax: number | null;
  key: KeySig | null;
  /** Also keep the keys Match calls compatible with `key`. */
  compatible: boolean;
  /** The first year of the decade kept (1990 = the 90s), or null (round 005). */
  decade: number | null;
}

export const EMPTY_FILTER: TrackFilter = {
  text: '',
  bpmMin: null,
  bpmMax: null,
  key: null,
  compatible: false,
  decade: null,
};

/** What a filter reads of a row: `resolveFeature`'s BPM, key and mode. */
export interface FilterFeature {
  bpm: number | null;
  key: number | null;
  major: boolean | null;
}

/** The BPM fields' error, or null: a range whose ends are crossed. */
export function filterError(filter: TrackFilter): string | null {
  const { bpmMin, bpmMax } = filter;
  return bpmMin !== null && bpmMax !== null && bpmMin > bpmMax
    ? 'Min is above max'
    : null;
}

/** A BPM, key or decade criterion is set: what "Clear filters" resets. */
export function hasCriteria(filter: TrackFilter): boolean {
  return (
    filter.bpmMin !== null ||
    filter.bpmMax !== null ||
    filter.key !== null ||
    filter.decade !== null
  );
}

/**
 * The filter as it applies to a table whose rows are dated in `decades`:
 * a decade absent from them (kept from another playlist or period) is
 * ignored, so it never empties a table that offers no chip to clear it
 * (`effectiveYearView`'s rule). The same object when nothing is ignored.
 */
export function forDecades(
  filter: TrackFilter,
  decades: readonly number[]
): TrackFilter {
  return filter.decade !== null && !decades.includes(filter.decade)
    ? { ...filter, decade: null }
    : filter;
}

/** Anything narrows the table, the text included ("Showing N of M"). */
export function isFiltering(filter: TrackFilter): boolean {
  return hasCriteria(filter) || normalize(filter.text) !== '';
}

/** "Clear filters": everything but the text, which keeps its own clear. */
export function clearCriteria(filter: TrackFilter): TrackFilter {
  return { ...EMPTY_FILTER, text: filter.text };
}

/**
 * The rows that pass every set criterion, in their order (FR-052). A row
 * without BPM fails a BPM criterion, a row without a key or a mode fails a
 * key criterion. Compatible means `keyRelation(seed, key) !== 'none'`, the
 * relations Match uses (FR-049). A crossed BPM range filters nothing by BPM.
 * The text applies only where the table says what a row's text is; the
 * decade only where it says what a row's year is, and an undated row fails
 * it (round 005).
 */
export function filterTracks<Row>(
  rows: readonly Row[],
  featureOf: (row: Row) => FilterFeature | null,
  filter: TrackFilter,
  textOf?: (row: Row) => string,
  yearOf?: (row: Row) => number | null
): Row[] {
  const text = textOf ? normalize(filter.text) : '';
  const bpm = filterError(filter) === null;
  const min = bpm ? filter.bpmMin : null;
  const max = bpm ? filter.bpmMax : null;
  const seed = filter.key;
  const decade = yearOf ? filter.decade : null;
  if (
    text === '' &&
    min === null &&
    max === null &&
    seed === null &&
    decade === null
  ) {
    return [...rows];
  }
  return rows.filter((row) => {
    if (decade !== null) {
      const year = yearOf!(row);
      if (year === null || decadeOf(year) !== decade) return false;
    }
    if (min !== null || max !== null || seed !== null) {
      const f = featureOf(row);
      if (min !== null || max !== null) {
        if (f?.bpm == null) return false;
        if (min !== null && f.bpm < min) return false;
        if (max !== null && f.bpm > max) return false;
      }
      if (seed !== null) {
        if (f?.key == null || f.major == null) return false;
        const candidate = { key: f.key, major: f.major };
        const relation = keyRelation(seed, candidate);
        if (filter.compatible ? relation === 'none' : relation !== 'same') {
          return false;
        }
      }
    }
    return text === '' || normalize(textOf!(row)).includes(text);
  });
}
