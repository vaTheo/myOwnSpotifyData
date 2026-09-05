import type { ResolvedFeature } from './features';
import { bpmDeltaPct, keyRelation, type KeyRelation } from './keys';

export interface MatchCandidate {
  id: string;
  feature: ResolvedFeature | null;
}

export interface MatchResult {
  id: string;
  feature: ResolvedFeature | null;
  /** null when either side has no key. */
  relation: KeyRelation | null;
  /** null when either side has no BPM. */
  deltaPct: number | null;
}

const RELATION_RANK: Record<KeyRelation, number> = {
  same: 0,
  relative: 1,
  adjacent: 2,
  boost: 3,
  none: 4,
};

function relationOf(
  seed: ResolvedFeature,
  feature: ResolvedFeature
): KeyRelation | null {
  if (seed.key === null || seed.major === null) return null;
  if (feature.key === null || feature.major === null) return null;
  return keyRelation(
    { key: seed.key, major: seed.major },
    { key: feature.key, major: feature.major }
  );
}

/** An unknown relation ranks with 'none' but is still reported as null. */
function rankOf(result: MatchResult): number {
  return result.relation === null
    ? RELATION_RANK.none
    : RELATION_RANK[result.relation];
}

/** Smallest gap first; a candidate with no BPM has no gap and goes last. */
function byDelta(a: MatchResult, b: MatchResult): number {
  if (a.deltaPct === null || b.deltaPct === null) {
    return (a.deltaPct === null ? 1 : 0) - (b.deltaPct === null ? 1 : 0);
  }
  return Math.abs(a.deltaPct) - Math.abs(b.deltaPct);
}

/**
 * Candidates that mix with `seed`: those within ±tolerancePct BPM by key
 * relation then by |ΔBPM%|, then the rest with a feature by |ΔBPM%|, then the
 * ones with no feature in their original order. Half and double time are not
 * folded in (spec §2).
 *
 * A seed with no BPM has no tolerance to apply, so every candidate with a
 * feature ranks by key relation alone — the mirror of a seed with no key,
 * which ranks by |ΔBPM%| alone.
 */
export function rankMatches(
  seed: ResolvedFeature,
  candidates: MatchCandidate[],
  tolerancePct = 6
): MatchResult[] {
  const near: MatchResult[] = [];
  const far: MatchResult[] = [];
  const unknown: MatchResult[] = [];
  for (const candidate of candidates) {
    const feature = candidate.feature;
    if (!feature) {
      unknown.push({ ...candidate, relation: null, deltaPct: null });
      continue;
    }
    const deltaPct =
      seed.bpm !== null && feature.bpm !== null
        ? bpmDeltaPct(seed.bpm, feature.bpm)
        : null;
    const result: MatchResult = {
      id: candidate.id,
      feature,
      relation: relationOf(seed, feature),
      deltaPct,
    };
    const inTolerance =
      seed.bpm === null
        ? true
        : deltaPct !== null && Math.abs(deltaPct) <= tolerancePct;
    if (inTolerance) {
      near.push(result);
    } else {
      far.push(result);
    }
  }
  near.sort((a, b) => rankOf(a) - rankOf(b) || byDelta(a, b));
  far.sort(byDelta);
  return [...near, ...far, ...unknown];
}
