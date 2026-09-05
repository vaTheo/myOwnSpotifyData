import { describe, expect, it } from 'vitest';
import {
  KEY_NAMES,
  bpmDeltaPct,
  camelot,
  camelotNumber,
  classicName,
  formatKey,
  keyRelation,
  openKey,
  parseKeyText,
} from './keys';

/**
 * Research §3.8, one row per Camelot code:
 * [pitch class, major, Camelot, Open Key, classic name]. The classic column
 * is the spec's flat table, so 12A reads `Db minor` where the research writes
 * the same key as `C# minor`.
 */
const TABLE: [number, boolean, string, string, string][] = [
  [8, false, '1A', '6m', 'Ab minor'],
  [11, true, '1B', '6d', 'B'],
  [3, false, '2A', '7m', 'Eb minor'],
  [6, true, '2B', '7d', 'F#'],
  [10, false, '3A', '8m', 'Bb minor'],
  [1, true, '3B', '8d', 'Db'],
  [5, false, '4A', '9m', 'F minor'],
  [8, true, '4B', '9d', 'Ab'],
  [0, false, '5A', '10m', 'C minor'],
  [3, true, '5B', '10d', 'Eb'],
  [7, false, '6A', '11m', 'G minor'],
  [10, true, '6B', '11d', 'Bb'],
  [2, false, '7A', '12m', 'D minor'],
  [5, true, '7B', '12d', 'F'],
  [9, false, '8A', '1m', 'A minor'],
  [0, true, '8B', '1d', 'C'],
  [4, false, '9A', '2m', 'E minor'],
  [7, true, '9B', '2d', 'G'],
  [11, false, '10A', '3m', 'B minor'],
  [2, true, '10B', '3d', 'D'],
  [6, false, '11A', '4m', 'F# minor'],
  [9, true, '11B', '4d', 'A'],
  [1, false, '12A', '5m', 'Db minor'],
  [4, true, '12B', '5d', 'E'],
];

/** Every key text in this file is a form the app itself can produce. */
const sig = (text: string) => parseKeyText(text)!;

describe('KEY_NAMES', () => {
  it('names the twelve pitch classes with flats', () => {
    expect(KEY_NAMES).toEqual([
      'C',
      'Db',
      'D',
      'Eb',
      'E',
      'F',
      'F#',
      'G',
      'Ab',
      'A',
      'Bb',
      'B',
    ]);
  });
});

describe('camelot, openKey and classicName', () => {
  it('reproduces the whole 24 entry table', () => {
    expect(
      TABLE.map(([key, major]) => [
        camelot(key, major),
        openKey(key, major),
        classicName(key, major),
      ])
    ).toEqual(TABLE.map(([, , code, open, name]) => [code, open, name]));
  });

  it('gives the Camelot number the key pill is coloured by', () => {
    expect(TABLE.map(([key, major]) => camelotNumber(key, major))).toEqual(
      TABLE.map(([, , code]) => Number(code.slice(0, -1)))
    );
  });

  it('formats in the three notations', () => {
    expect(formatKey(9, false, 'camelot')).toBe('8A');
    expect(formatKey(9, false, 'open')).toBe('1m');
    expect(formatKey(9, false, 'classic')).toBe('A minor');
    expect(formatKey(2, true, 'camelot')).toBe('10B');
    expect(formatKey(2, true, 'open')).toBe('3d');
    expect(formatKey(2, true, 'classic')).toBe('D');
  });
});

describe('parseKeyText', () => {
  it('round-trips every Camelot and Open Key code of the table', () => {
    for (const [key, major, code, open] of TABLE) {
      expect(parseKeyText(code)).toEqual({ key, major });
      expect(parseKeyText(open)).toEqual({ key, major });
    }
  });

  it('accepts zero padding, spacing and either case', () => {
    expect(parseKeyText('09B')).toEqual({ key: 7, major: true });
    expect(parseKeyText('4a')).toEqual({ key: 5, major: false });
    expect(parseKeyText(' 8b ')).toEqual({ key: 0, major: true });
    expect(parseKeyText('01m')).toEqual({ key: 9, major: false });
    expect(parseKeyText('03D')).toEqual({ key: 2, major: true });
  });

  it('reads the classic forms rekordbox writes', () => {
    expect(parseKeyText('Fm')).toEqual({ key: 5, major: false });
    expect(parseKeyText('F#m')).toEqual({ key: 6, major: false });
    expect(parseKeyText('Abm')).toEqual({ key: 8, major: false });
    expect(parseKeyText('Bb')).toEqual({ key: 10, major: true });
    expect(parseKeyText('Am')).toEqual({ key: 9, major: false });
    expect(parseKeyText('C major')).toEqual({ key: 0, major: true });
    expect(parseKeyText('Dbmin')).toEqual({ key: 1, major: false });
    expect(parseKeyText('A minor')).toEqual({ key: 9, major: false });
    expect(parseKeyText('Ebmaj')).toEqual({ key: 3, major: true });
  });

  it('folds the enharmonics onto the flat names', () => {
    expect(parseKeyText('C#')).toEqual(parseKeyText('Db'));
    expect(parseKeyText('D#m')).toEqual(parseKeyText('Ebm'));
    expect(parseKeyText('Gb')).toEqual(parseKeyText('F#'));
    expect(parseKeyText('G#m')).toEqual(parseKeyText('Abm'));
    expect(parseKeyText('A#')).toEqual(parseKeyText('Bb'));
    expect(parseKeyText('F♯m')).toEqual({ key: 6, major: false });
    expect(parseKeyText('B♭')).toEqual({ key: 10, major: true });
  });

  it('returns null for empty and unreadable text', () => {
    expect(parseKeyText('')).toBeNull();
    expect(parseKeyText('   ')).toBeNull();
    expect(parseKeyText('13A')).toBeNull();
    expect(parseKeyText('0A')).toBeNull();
    expect(parseKeyText('4C')).toBeNull();
    expect(parseKeyText('H')).toBeNull();
    expect(parseKeyText('Fmm')).toBeNull();
    expect(parseKeyText('unknown')).toBeNull();
  });
});

describe('keyRelation', () => {
  it('names the compatible moves on the wheel', () => {
    expect(keyRelation(sig('8A'), sig('8A'))).toBe('same');
    expect(keyRelation(sig('8A'), sig('8B'))).toBe('relative');
    expect(keyRelation(sig('8B'), sig('8A'))).toBe('relative');
    expect(keyRelation(sig('8A'), sig('9A'))).toBe('adjacent');
    expect(keyRelation(sig('8A'), sig('7A'))).toBe('adjacent');
    expect(keyRelation(sig('8A'), sig('10A'))).toBe('boost');
  });

  it('wraps between 12 and 1', () => {
    expect(keyRelation(sig('12A'), sig('1A'))).toBe('adjacent');
    expect(keyRelation(sig('1A'), sig('12A'))).toBe('adjacent');
    expect(keyRelation(sig('12B'), sig('2B'))).toBe('boost');
    expect(keyRelation(sig('11B'), sig('1B'))).toBe('boost');
  });

  it('leaves everything else unrelated, the boost included downwards', () => {
    expect(keyRelation(sig('10A'), sig('8A'))).toBe('none');
    expect(keyRelation(sig('8A'), sig('9B'))).toBe('none');
    expect(keyRelation(sig('8A'), sig('3A'))).toBe('none');
    expect(keyRelation(sig('8A'), sig('2B'))).toBe('none');
  });
});

describe('bpmDeltaPct', () => {
  it('is the signed percentage from the seed to the candidate', () => {
    expect(bpmDeltaPct(100, 106)).toBe(6);
    expect(bpmDeltaPct(100, 97)).toBe(-3);
    expect(bpmDeltaPct(128, 128)).toBe(0);
    expect(bpmDeltaPct(124, 128)).toBeCloseTo(3.2258, 4);
  });
});
