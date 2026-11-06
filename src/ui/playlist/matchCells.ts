import type { ResolvedFeature } from '../../model/features';
import { camelotNumber } from '../../model/keys';
import type { MatchResult } from '../../model/match';

/** '+1.6%', '−2.0%'; an exact tie reads '±0.0%' and not a signed zero. */
export function deltaLabel(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±';
  return `${sign}${Math.abs(rounded).toFixed(1)}%`;
}

/** 1..12, or null when the source gave a BPM but no key. */
function wheelNumber(f: ResolvedFeature): number | null {
  if (f.key === null || f.major === null) return null;
  return camelotNumber(f.key, f.major);
}

/**
 * `keyRelation` reports `adjacent`; which side of the wheel that is shows
 * only in the Camelot numbers, so the direction is decided here. 12A → 1A
 * counts as `+1`, the same wrap `keyRelation` itself applies.
 */
function relationLabel(
  seed: ResolvedFeature,
  feature: ResolvedFeature,
  relation: MatchResult['relation']
): string | null {
  if (relation === 'same') return 'same key';
  if (relation === 'relative') return 'relative';
  if (relation === 'boost') return 'boost';
  if (relation !== 'adjacent') return null;
  const from = wheelNumber(seed);
  const to = wheelNumber(feature);
  if (from === null || to === null) return null;
  return (from % 12) + 1 === to ? '+1' : '−1';
}

export interface MatchCells {
  relation: string | null;
  delta: string | null;
  /** A track no source knows: the "no data" flag, alone. */
  noData: boolean;
}

/**
 * The Relation and ΔBPM cells of a Match row (spec 001 §5, kept by spec 003
 * §8). A row out of tolerance keeps its ΔBPM and loses the relation; a row
 * with no ΔBPM at all keeps its relation and shows no percentage. The
 * tolerance is the one handed to `rankMatches`, so the list and the cells
 * never disagree about what "in tolerance" means.
 */
export function matchCells(
  seed: ResolvedFeature | null,
  match: MatchResult | null,
  tolerancePct: number
): MatchCells {
  if (!seed || !match) return { relation: null, delta: null, noData: false };
  if (!match.feature) return { relation: null, delta: null, noData: true };
  const far =
    match.deltaPct !== null && Math.abs(match.deltaPct) > tolerancePct;
  return {
    relation: far ? null : relationLabel(seed, match.feature, match.relation),
    delta: match.deltaPct === null ? null : deltaLabel(match.deltaPct),
    noData: false,
  };
}
