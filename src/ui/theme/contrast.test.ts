import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseTokens } from './contrast';

describe('contrastRatio', () => {
  it('measures chartreuse on the dark surface and white on chartreuse', () => {
    expect(contrastRatio('#7FFF00', '#0e1509')).toBeCloseTo(14.34, 1);
    expect(contrastRatio('#FFFFFF', '#7FFF00')).toBeCloseTo(1.3, 1);
  });

  it('is symmetric and 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('accepts three-digit colours', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
  });
});

describe('parseTokens', () => {
  it('reads hex custom properties and skips the rest', () => {
    const tokens = parseTokens(
      ':root { --a: #7FFF00; --b:#0e1509 ; --c: 12px; --d: var(--a); }'
    );
    expect(tokens).toEqual({ '--a': '#7FFF00', '--b': '#0e1509' });
  });
});

/**
 * The pairs of contracts/design-tokens.md, "Contrast pairs the test
 * enforces": 4.5 for text, 3 for a control's outline.
 */
const PAIRS: [string, string, number][] = [
  ['--md-sys-color-on-surface', '--md-sys-color-surface', 4.5],
  [
    '--md-sys-color-on-surface-variant',
    '--md-sys-color-surface-container-high',
    4.5,
  ],
  ['--md-sys-color-on-primary', '--md-sys-color-primary', 4.5],
  [
    '--md-sys-color-on-primary-container',
    '--md-sys-color-primary-container',
    4.5,
  ],
  [
    '--md-sys-color-on-secondary-container',
    '--md-sys-color-secondary-container',
    4.5,
  ],
  ['--md-sys-color-error', '--md-sys-color-surface-container-high', 4.5],
  ['--app-color-warning', '--md-sys-color-surface-container-high', 4.5],
  ['--app-color-band-high', '--md-sys-color-surface-container-high', 4.5],
  ['--md-sys-color-outline', '--md-sys-color-surface', 3],
  [
    '--md-sys-color-on-surface',
    '--md-sys-color-surface-container-highest',
    4.5,
  ],
  ['--md-sys-color-tertiary', '--md-sys-color-surface-container-high', 4.5],
  [
    '--md-sys-color-on-tertiary-container',
    '--md-sys-color-tertiary-container',
    4.5,
  ],
  ['--md-sys-color-on-error-container', '--md-sys-color-error-container', 4.5],
  ['--app-color-on-warning-container', '--app-color-warning-container', 4.5],
  ['--md-sys-color-inverse-on-surface', '--md-sys-color-inverse-surface', 4.5],
];

const SURFACES = [
  '--md-sys-color-surface',
  '--md-sys-color-surface-container-low',
  '--md-sys-color-surface-container',
  '--md-sys-color-surface-container-high',
  '--md-sys-color-surface-container-highest',
];

describe('tokens.css', () => {
  const tokens = parseTokens(
    readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
  );

  it.each(PAIRS)('%s on %s reaches %d:1', (fg, bg, min) => {
    expect(tokens[fg], fg).toBeDefined();
    expect(tokens[bg], bg).toBeDefined();
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
  });

  it.each(SURFACES)('chartreuse reads as text on %s', (surface) => {
    expect(
      contrastRatio(tokens['--md-sys-color-primary'], tokens[surface])
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps chartreuse itself as the primary colour', () => {
    expect(tokens['--md-sys-color-primary'].toLowerCase()).toBe('#7fff00');
  });

  it('gives every Camelot key colour text contrast on the table header', () => {
    for (let n = 1; n <= 12; n += 1) {
      const hue = tokens[`--app-key-${n}`];
      expect(hue, `--app-key-${n}`).toBeDefined();
      expect(
        contrastRatio(hue, tokens['--md-sys-color-surface-container-high'])
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
