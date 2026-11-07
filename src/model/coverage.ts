/**
 * The Audio data coverage (spec §5), pure so the Settings card and the
 * Overview (spec 003, US8) count with one function and it is unit tested.
 */
import { candidateIds } from '../features/lookup';
import type { Model } from './aggregate';
import { resolveFeature } from './features';

export interface Coverage {
  total: number;
  covered: number;
  reccobeats: number;
  rekordbox: number;
}

/** A source value counts only once it carries a BPM or a key. */
function hasValue(v: { bpm: number | null; key: number | null }): boolean {
  return v.bpm !== null || v.key !== null;
}

let memoModel: Model | null = null;
let memoValue: Coverage | null = null;

/**
 * Spec §5's coverage line. `total` is every candidate id — §3's universe,
 * not the ids a lookup would still fetch, which would shrink to zero as the
 * lookup succeeds — and `covered` counts the ids that resolve to at least a
 * BPM or a key. The two source counts overlap on purpose: a track with both
 * a Rekordbox and a ReccoBeats value is counted in both, which is why they
 * can add up to more than `covered`.
 */
export function coverage(m: Model): Coverage {
  // Memoised on the model identity, as `reachCoverage` is: Settings and the
  // Overview read it on every render, progress ticks included.
  if (memoModel === m && memoValue) return memoValue;
  memoValue = count(m);
  memoModel = m;
  return memoValue;
}

function count(m: Model): Coverage {
  const candidates = candidateIds(m);
  let covered = 0;
  let reccobeats = 0;
  let rekordbox = 0;
  for (const candidate of candidates) {
    const row = m.features.get(candidate.id);
    if (!row) continue;
    // resolveFeature is already null unless a BPM or a key survived, which
    // is spec §5's counting rule word for word.
    if (resolveFeature(row)) covered++;
    if (row.rekordbox && hasValue(row.rekordbox)) rekordbox++;
    const recco = row.reccobeats;
    // A notFound marker is a checked id, not a value.
    if (recco && !('notFound' in recco) && hasValue(recco)) reccobeats++;
  }
  return { total: candidates.length, covered, reccobeats, rekordbox };
}
