import { describe, expect, it } from 'vitest';
import type { ResolvedFeature } from './features';
import { parseKeyText } from './keys';
import { rankMatches } from './match';

function feat(bpm: number | null, key: string | null): ResolvedFeature {
  const sig = key === null ? null : parseKeyText(key)!;
  return {
    bpm,
    key: sig?.key ?? null,
    major: sig?.major ?? null,
    source: 'reccobeats',
  };
}

const ids = (results: { id: string }[]) => results.map((r) => r.id);

describe('rankMatches', () => {
  it('ranks the in-tolerance candidates by key relation, then by |ΔBPM%|', () => {
    const seed = feat(100, '8A');
    const results = rankMatches(seed, [
      { id: 'none', feature: feat(104, '3A') },
      { id: 'boost', feature: feat(103, '10A') },
      { id: 'adjacent', feature: feat(105, '9A') },
      { id: 'relative', feature: feat(102, '8B') },
      { id: 'same-edge', feature: feat(106, '8A') },
      { id: 'same-near', feature: feat(99, '8A') },
      { id: 'out', feature: feat(110, '8A') },
      { id: 'nodata', feature: null },
    ]);
    expect(ids(results)).toEqual([
      'same-near',
      'same-edge',
      'relative',
      'adjacent',
      'boost',
      'none',
      'out',
      'nodata',
    ]);
    expect(results[0]).toEqual({
      id: 'same-near',
      feature: feat(99, '8A'),
      relation: 'same',
      deltaPct: -1,
    });
    expect(results[6]).toEqual({
      id: 'out',
      feature: feat(110, '8A'),
      relation: 'same',
      deltaPct: 10,
    });
    expect(results[7]).toEqual({
      id: 'nodata',
      feature: null,
      relation: null,
      deltaPct: null,
    });
  });

  it('holds the tolerance at ±6% by default and takes the parameter otherwise', () => {
    const seed = feat(100, '8A');
    const candidates = [
      { id: 'edge', feature: feat(106, '3A') },
      { id: 'wide', feature: feat(112.5, '8A') },
    ];
    expect(ids(rankMatches(seed, candidates))).toEqual(['edge', 'wide']);
    expect(ids(rankMatches(seed, candidates, 12.5))).toEqual(['wide', 'edge']);
  });

  it('keeps the candidates without a feature last, in their original order', () => {
    const results = rankMatches(feat(120, '8A'), [
      { id: 'n1', feature: null },
      { id: 'hit', feature: feat(121, '8A') },
      { id: 'n2', feature: null },
    ]);
    expect(ids(results)).toEqual(['hit', 'n1', 'n2']);
  });

  it('sorts a candidate with no BPM after every candidate that has one', () => {
    const results = rankMatches(feat(100, '8A'), [
      { id: 'nobpm', feature: feat(null, '8A') },
      { id: 'far', feature: feat(110, '3A') },
    ]);
    expect(ids(results)).toEqual(['far', 'nobpm']);
    expect(results[1].deltaPct).toBeNull();
    expect(results[1].relation).toBe('same');
  });

  it('keeps the input order when the seed has no BPM', () => {
    const results = rankMatches(feat(null, '8A'), [
      { id: 'a', feature: feat(120, '9A') },
      { id: 'b', feature: feat(120, '8B') },
      { id: 'c', feature: null },
    ]);
    expect(ids(results)).toEqual(['a', 'b', 'c']);
    expect(results.map((r) => r.relation)).toEqual([
      'adjacent',
      'relative',
      null,
    ]);
    expect(results.map((r) => r.deltaPct)).toEqual([null, null, null]);
  });

  it('falls back to |ΔBPM%| alone when the seed has no key', () => {
    const results = rankMatches(feat(120, null), [
      { id: 'far', feature: feat(126, '8A') },
      { id: 'near', feature: feat(122, '3A') },
    ]);
    expect(ids(results)).toEqual(['near', 'far']);
    expect(results.map((r) => r.relation)).toEqual([null, null]);
  });
});
