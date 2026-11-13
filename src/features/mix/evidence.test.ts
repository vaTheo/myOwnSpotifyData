import { describe, expect, it } from 'vitest';
import type { TracklistRow } from '../../db/schema';
import {
  LEVELS,
  bestEvidence,
  evidenceExtras,
  evidenceLevel,
  evidenceRank,
  isFlagged,
} from './evidence';

function row(over: Partial<TracklistRow> = {}): TracklistRow {
  return {
    startSec: 0,
    endSec: null,
    artist: 'A',
    title: 'T',
    label: null,
    source: 'tracklistify',
    gap: false,
    detected: { artist: 'A', title: 'T' },
    referenceCount: null,
    ...over,
  };
}

describe('LEVELS', () => {
  it('lists the five levels, best first', () => {
    expect(LEVELS).toEqual(['solid', 'once', 'out_of_step', 'candidates', 'inside']);
  });
});

describe('evidenceLevel', () => {
  it.each(['solid', 'once', 'out_of_step', 'candidates', 'inside'] as const)(
    'reads the known word %s',
    (word) => {
      expect(evidenceLevel(row({ evidence: word }))).toBe(word);
    },
  );

  it('gives null for an unknown word', () => {
    expect(evidenceLevel(row({ evidence: 'shaky' }))).toBeNull();
    expect(evidenceLevel(row({ evidence: 'Solid' }))).toBeNull();
  });

  it('gives null without the field', () => {
    expect(evidenceLevel(row())).toBeNull();
  });
});

describe('evidenceRank', () => {
  it('ranks solid 5, once 4, out_of_step 3, candidates 2, inside 1', () => {
    expect(evidenceRank(row({ evidence: 'solid' }))).toBe(5);
    expect(evidenceRank(row({ evidence: 'once' }))).toBe(4);
    expect(evidenceRank(row({ evidence: 'out_of_step' }))).toBe(3);
    expect(evidenceRank(row({ evidence: 'candidates' }))).toBe(2);
    expect(evidenceRank(row({ evidence: 'inside' }))).toBe(1);
  });

  it('gives 0 without a known level', () => {
    expect(evidenceRank(row())).toBe(0);
    expect(evidenceRank(row({ evidence: 'shaky' }))).toBe(0);
  });
});

describe('isFlagged', () => {
  it('flags out_of_step, candidates and inside', () => {
    expect(isFlagged(row({ evidence: 'out_of_step' }))).toBe(true);
    expect(isFlagged(row({ evidence: 'candidates' }))).toBe(true);
    expect(isFlagged(row({ evidence: 'inside' }))).toBe(true);
  });

  it('does not flag solid, once or a row without a level', () => {
    expect(isFlagged(row({ evidence: 'solid' }))).toBe(false);
    expect(isFlagged(row({ evidence: 'once' }))).toBe(false);
    expect(isFlagged(row())).toBe(false);
    expect(isFlagged(row({ evidence: 'shaky' }))).toBe(false);
  });
});

describe('bestEvidence', () => {
  it('returns the row with the best rank', () => {
    const inside = row({ evidence: 'inside', title: 'I' });
    const solid = row({ evidence: 'solid', title: 'S' });
    const once = row({ evidence: 'once', title: 'O' });
    expect(bestEvidence([inside, solid, once])).toBe(solid);
  });

  it('returns the first among equals', () => {
    const first = row({ evidence: 'once', title: 'first' });
    const second = row({ evidence: 'once', title: 'second' });
    expect(bestEvidence([row(), first, second])).toBe(first);
  });

  it('gives null when no row has a known level', () => {
    expect(bestEvidence([row(), row({ evidence: 'shaky' })])).toBeNull();
    expect(bestEvidence([])).toBeNull();
  });
});

describe('evidenceExtras', () => {
  it('keeps the three fields when they pass', () => {
    expect(
      evidenceExtras({ evidence: 'solid', mix_speed_percent: -7.7, candidates: 3 }),
    ).toEqual({ evidence: 'solid', mixSpeed: -7.7, candidates: 3 });
  });

  it('keeps an unknown word and the bounds themselves', () => {
    expect(
      evidenceExtras({ evidence: 'x'.repeat(32), mix_speed_percent: 50, candidates: 1000 }),
    ).toEqual({ evidence: 'x'.repeat(32), mixSpeed: 50, candidates: 1000 });
    expect(evidenceExtras({ mix_speed_percent: -50, candidates: 1 })).toEqual({
      mixSpeed: -50,
      candidates: 1,
    });
  });

  it('gives an empty object for a row without the fields', () => {
    expect(evidenceExtras({ artist: 'A', title: 'T' })).toEqual({});
  });

  it.each([['empty', ''], ['33 characters', 'x'.repeat(33)], ['a number', 5]])(
    'leaves out evidence when %s',
    (_name, value) => {
      expect(evidenceExtras({ evidence: value, candidates: 2 })).toEqual({ candidates: 2 });
    },
  );

  it.each([['NaN', Number.NaN], ['51', 51], ['-51', -51], ['a string', '3.4']])(
    'leaves out mix_speed_percent when %s',
    (_name, value) => {
      expect(evidenceExtras({ evidence: 'once', mix_speed_percent: value })).toEqual({
        evidence: 'once',
      });
    },
  );

  it.each([['0', 0], ['1.5', 1.5], ['1001', 1001]])(
    'leaves out candidates when %s',
    (_name, value) => {
      expect(evidenceExtras({ evidence: 'once', candidates: value })).toEqual({
        evidence: 'once',
      });
    },
  );
});
