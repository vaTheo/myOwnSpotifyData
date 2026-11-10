import type { TracklistRow } from '../../db/schema';
import { nameKey } from '../../model/normalize';
import { stripMixMarkers } from '../rekordbox-match';
import { isIdentified } from './spotifySearch';

/** Earlier time first, no time last; equal times keep the input order. */
function earlier(a: TracklistRow, b: TracklistRow): boolean {
  if (b.startSec === null) return a.startSec !== null;
  return a.startSec !== null && a.startSec < b.startSec;
}

/** Heard by the scan: not a clue nor a TrackId.net span (`trackExtras`
 *  gives those no clip count). */
function heard(row: TracklistRow): boolean {
  return row.origin !== 'clue' && row.origin !== 'trackid';
}

/**
 * Spec 018: one row per song in an incoming result (worker or hand import).
 * Identified rows with the same `nameKey(artist, stripMixMarkers(title))`
 * (the key the dig links group by) collapse to the copy with the earliest
 * time; a heard copy outranks a not-heard one (`origin` 'clue' or
 * 'trackid'), whose copies are then dropped. The kept row keeps every field
 * of its own except `hits`, the sum of the ranked copies' (absent when none
 * has one), and `confidence`, the best of their numbers. Gaps and unidentified rows pass unchanged. The kept rows
 * stay in input order. Rows already in a mix never pass through here.
 */
export function oneRowPerSong(rows: readonly TracklistRow[]): TracklistRow[] {
  const groups = new Map<string, TracklistRow[]>();
  for (const row of rows) {
    if (!isIdentified(row)) continue;
    const key = nameKey(row.artist, stripMixMarkers(row.title));
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const replaced = new Map<TracklistRow, TracklistRow | null>();
  for (const copies of groups.values()) {
    if (copies.length < 2) continue;
    // A heard copy outranks a not-heard one: only the heard copies count
    // when there is one; else the not-heard copies collapse among themselves.
    const heardCopies = copies.filter(heard);
    const ranked = heardCopies.length > 0 ? heardCopies : copies;
    const first = ranked.reduce((best, r) => (earlier(r, best) ? r : best));
    const hits = ranked.filter((r) => typeof r.hits === 'number');
    const confidences = ranked
      .map((r) => r.confidence)
      .filter((c): c is number => typeof c === 'number');
    const merged: TracklistRow = {
      ...first,
      ...(hits.length > 0
        ? { hits: hits.reduce((sum, r) => sum + (r.hits ?? 0), 0) }
        : {}),
      ...(confidences.length > 0 ? { confidence: Math.max(...confidences) } : {}),
    };
    for (const r of copies) replaced.set(r, r === first ? merged : null);
  }
  const out: TracklistRow[] = [];
  for (const row of rows) {
    const next = replaced.has(row) ? replaced.get(row) : row;
    if (next) out.push(next);
  }
  return out;
}
