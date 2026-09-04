import { describe, expect, it } from 'vitest';
import { nameKey, normalize } from './normalize';

describe('normalize', () => {
  it('folds accents, case and punctuation', () => {
    expect(normalize('Hôtel Costes 9')).toBe('hotel costes 9');
    expect(normalize("L'Impératrice")).toBe('l imperatrice');
    expect(normalize('Around the World - Radio Edit (2001)')).toBe(
      'around the world radio edit 2001'
    );
    expect(normalize('  Daft   Punk ')).toBe('daft punk');
    expect(normalize('Björk & Røyksopp')).toBe('bjork røyksopp');
  });

  it('builds a stable artist|title key', () => {
    expect(nameKey('DAFT PUNK', 'One More Time')).toBe(
      'daft punk|one more time'
    );
  });
});
