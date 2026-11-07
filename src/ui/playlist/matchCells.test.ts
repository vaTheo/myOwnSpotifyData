import { describe, expect, it } from 'vitest';
import type { ResolvedFeature } from '../../model/features';
import type { MatchResult } from '../../model/match';
import { deltaLabel, matchCells } from './matchCells';

const TOL = 6;

/** C major is 8B, A minor is 8A, G major is 9B, F major is 7B. */
function f(
  bpm: number | null,
  key: number | null,
  major: boolean | null
): ResolvedFeature {
  return { bpm, key, major, source: 'rekordbox' };
}

function match(over: Partial<MatchResult>): MatchResult {
  return {
    id: '1',
    feature: f(126, 0, true),
    relation: 'same',
    deltaPct: 0,
    ...over,
  };
}

describe('deltaLabel', () => {
  it('signs the percentage and never prints a signed zero', () => {
    expect(deltaLabel(1.64)).toBe('+1.6%');
    expect(deltaLabel(-2)).toBe('−2.0%');
    expect(deltaLabel(0.01)).toBe('±0.0%');
  });
});

describe('matchCells', () => {
  const seed = f(126, 0, true);

  it('shows nothing outside Match or before a seed', () => {
    expect(matchCells(null, match({}), TOL)).toEqual({
      relation: null,
      delta: null,
      noData: false,
    });
    expect(matchCells(seed, null, TOL)).toEqual({
      relation: null,
      delta: null,
      noData: false,
    });
  });

  it('marks a track no source knows as no data, alone', () => {
    expect(matchCells(seed, match({ feature: null }), TOL)).toEqual({
      relation: null,
      delta: null,
      noData: true,
    });
  });

  it('gives the relation and the delta in tolerance', () => {
    expect(
      matchCells(seed, match({ relation: 'relative', deltaPct: 1.6 }), TOL)
    ).toEqual({ relation: 'relative', delta: '+1.6%', noData: false });
    expect(matchCells(seed, match({ relation: 'same' }), TOL).relation).toBe(
      'same key'
    );
    expect(matchCells(seed, match({ relation: 'boost' }), TOL).relation).toBe(
      'boost'
    );
  });

  it('keeps the delta and drops the relation out of tolerance', () => {
    expect(
      matchCells(seed, match({ relation: 'same', deltaPct: -6.5 }), TOL)
    ).toEqual({ relation: null, delta: '−6.5%', noData: false });
  });

  it('keeps the relation and shows no percentage without a BPM', () => {
    expect(
      matchCells(seed, match({ relation: 'same', deltaPct: null }), TOL)
    ).toEqual({ relation: 'same key', delta: null, noData: false });
  });

  it('reads the side of an adjacent key from the Camelot numbers', () => {
    // 8B → 9B is +1, 8B → 7B is −1.
    expect(
      matchCells(
        seed,
        match({ feature: f(126, 7, true), relation: 'adjacent' }),
        TOL
      ).relation
    ).toBe('+1');
    expect(
      matchCells(
        seed,
        match({ feature: f(126, 5, true), relation: 'adjacent' }),
        TOL
      ).relation
    ).toBe('−1');
  });

  it('wraps 12 to 1 as +1', () => {
    // E major is 12B, B major is 1B.
    expect(
      matchCells(
        f(126, 4, true),
        match({ feature: f(126, 11, true), relation: 'adjacent' }),
        TOL
      ).relation
    ).toBe('+1');
  });

  it('shows no relation for none', () => {
    expect(matchCells(seed, match({ relation: 'none' }), TOL).relation).toBe(
      null
    );
  });
});
