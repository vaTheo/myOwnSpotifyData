import type { FeatureRow, FeatureValue } from '../db/schema';
import type { Model } from './aggregate';

export type { FeatureRow, FeatureValue, RekordboxValue } from '../db/schema';

/** What a row resolves to; `source` names the winner of the two. */
export interface ResolvedFeature {
  bpm: number | null;
  key: number | null;
  major: boolean | null;
  source: 'rekordbox' | 'reccobeats';
}

/** The ReccoBeats value of a row, or null when it is absent or a miss. */
export function reccobeatsValue(row: FeatureRow): FeatureValue | null {
  const value = row.reccobeats;
  if (!value || 'notFound' in value) return null;
  return value;
}

/**
 * Rekordbox wins per field, ReccoBeats fills the rest. The key and its mode
 * move together: a mode without a pitch class renders no pill. A row with
 * neither a BPM nor a key resolves to null, which is also what the Settings
 * coverage line counts.
 */
export function resolveFeature(
  row: FeatureRow | undefined
): ResolvedFeature | null {
  if (!row) return null;
  const rb = row.rekordbox ?? null;
  const recco = reccobeatsValue(row);
  const bpm = rb?.bpm ?? recco?.bpm ?? null;
  const keyed = rb && rb.key !== null ? rb : recco;
  const key = keyed?.key ?? null;
  const major = keyed?.major ?? null;
  if (bpm === null && key === null) return null;
  return {
    bpm,
    key,
    major,
    source:
      rb && (rb.bpm !== null || rb.key !== null) ? 'rekordbox' : 'reccobeats',
  };
}

export function featureFor(
  model: Model,
  trackId: string
): ResolvedFeature | null {
  return resolveFeature(model.features.get(trackId));
}
