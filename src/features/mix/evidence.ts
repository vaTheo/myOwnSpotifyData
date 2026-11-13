// Spec 029: the evidence level of a heard row, its rank, and the three
// fields read from a worker row. Pure: no fetch, no state.
import type { TracklistRow } from '../../db/schema';

export type EvidenceLevel = 'solid' | 'once' | 'out_of_step' | 'candidates';

/** Best first. */
export const LEVELS: readonly EvidenceLevel[] = [
  'solid',
  'once',
  'out_of_step',
  'candidates',
];

const FLAGGED: readonly EvidenceLevel[] = ['out_of_step', 'candidates'];

/** The row's level, or null for an absent or unknown word. */
export function evidenceLevel(row: TracklistRow): EvidenceLevel | null {
  const word = row.evidence;
  return typeof word === 'string' && (LEVELS as readonly string[]).includes(word)
    ? (word as EvidenceLevel)
    : null;
}

/** solid 4 … candidates 1; 0 without a known level. */
export function evidenceRank(row: TracklistRow): number {
  const level = evidenceLevel(row);
  return level === null ? 0 : LEVELS.length - LEVELS.indexOf(level);
}

/** out_of_step and candidates. */
export function isFlagged(row: TracklistRow): boolean {
  const level = evidenceLevel(row);
  return level !== null && FLAGGED.includes(level);
}

/** The first row with the best rank; null when no row has a known level. */
export function bestEvidence(rows: readonly TracklistRow[]): TracklistRow | null {
  let best: TracklistRow | null = null;
  let bestRank = 0;
  for (const r of rows) {
    const rank = evidenceRank(r);
    if (rank > bestRank) {
      best = r;
      bestRank = rank;
    }
  }
  return best;
}

/** The three fields of a worker row that pass their bounds; a bad one is left out. */
export function evidenceExtras(
  track: Record<string, unknown>,
): Pick<TracklistRow, 'evidence' | 'mixSpeed' | 'candidates'> {
  const out: Pick<TracklistRow, 'evidence' | 'mixSpeed' | 'candidates'> = {};
  const { evidence, mix_speed_percent: speed, candidates } = track;
  if (typeof evidence === 'string' && evidence.length > 0 && evidence.length <= 32) {
    out.evidence = evidence;
  }
  if (typeof speed === 'number' && Number.isFinite(speed) && speed >= -50 && speed <= 50) {
    out.mixSpeed = speed;
  }
  if (
    typeof candidates === 'number' &&
    Number.isInteger(candidates) &&
    candidates >= 1 &&
    candidates <= 1000
  ) {
    out.candidates = candidates;
  }
  return out;
}
