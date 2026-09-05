/** Classic names, one per pitch class, flats throughout (spec §2). */
export const KEY_NAMES = [
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
] as const;

/** The app's internal form: a pitch class plus a mode. */
export interface KeySig {
  /** Pitch class, 0..11, C = 0, as Spotify and ReccoBeats report it. */
  key: number;
  major: boolean;
}

export type KeyNotation = 'camelot' | 'open' | 'classic';

export type KeyRelation = 'same' | 'relative' | 'adjacent' | 'boost' | 'none';

const MAJOR_OFFSET = 7;
const MINOR_OFFSET = 4;

/** 1..12: the number of the Camelot code, and the key pill's hue. */
export function camelotNumber(key: number, major: boolean): number {
  return ((7 * key + (major ? MAJOR_OFFSET : MINOR_OFFSET)) % 12) + 1;
}

export function camelot(key: number, major: boolean): string {
  return `${camelotNumber(key, major)}${major ? 'B' : 'A'}`;
}

export function openKey(key: number, major: boolean): string {
  // Open Key runs five steps behind Camelot: 8A is 1m, 7A is 12m.
  const n = (camelotNumber(key, major) + 5) % 12;
  return `${n === 0 ? 12 : n}${major ? 'd' : 'm'}`;
}

export function classicName(key: number, major: boolean): string {
  return `${KEY_NAMES[key]}${major ? '' : ' minor'}`;
}

export function formatKey(
  key: number,
  major: boolean,
  notation: KeyNotation
): string {
  if (notation === 'camelot') return camelot(key, major);
  if (notation === 'open') return openKey(key, major);
  return classicName(key, major);
}

const CAMELOT_TEXT = /^0?(1[0-2]|[1-9])([ab])$/i;
const OPEN_TEXT = /^0?(1[0-2]|[1-9])([dm])$/i;
const CLASSIC_TEXT = /^([a-g])([#♯b♭]?)\s*(major|maj|minor|min|m)?$/i;

const PITCH: Record<string, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
};

const ACCIDENTAL: Record<string, number> = {
  '': 0,
  '#': 1,
  '♯': 1,
  b: -1,
  '♭': -1,
};

/** Inverts camelotNumber; 7 is its own inverse modulo 12. */
function fromCamelot(n: number, major: boolean): KeySig {
  const offset = major ? MAJOR_OFFSET : MINOR_OFFSET;
  return { key: (((7 * (n - 1 - offset)) % 12) + 12) % 12, major };
}

/** Camelot, Open Key or a classic name; empty or unreadable text is null. */
export function parseKeyText(text: string): KeySig | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const code = CAMELOT_TEXT.exec(trimmed);
  if (code) return fromCamelot(Number(code[1]), code[2].toLowerCase() === 'b');
  const open = OPEN_TEXT.exec(trimmed);
  if (open) {
    // Open Key n is Camelot ((n + 6) % 12) + 1 (research §3.8).
    const n = ((Number(open[1]) + 6) % 12) + 1;
    return fromCamelot(n, open[2].toLowerCase() === 'd');
  }
  const classic = CLASSIC_TEXT.exec(trimmed);
  if (!classic) return null;
  const shift = ACCIDENTAL[classic[2].toLowerCase()];
  const mode = (classic[3] ?? '').toLowerCase();
  const key = (PITCH[classic[1].toLowerCase()] + shift + 12) % 12;
  return { key, major: mode !== 'm' && mode !== 'min' && mode !== 'minor' };
}

/** Compatibility on the Camelot wheel; `b` is the candidate, `a` the seed. */
export function keyRelation(a: KeySig, b: KeySig): KeyRelation {
  const from = camelotNumber(a.key, a.major);
  const to = camelotNumber(b.key, b.major);
  if (a.major !== b.major) return from === to ? 'relative' : 'none';
  const step = (((to - from) % 12) + 12) % 12;
  if (step === 0) return 'same';
  if (step === 1 || step === 11) return 'adjacent';
  // The energy boost is upwards only; two steps down is not a mix.
  if (step === 2) return 'boost';
  return 'none';
}

export function bpmDeltaPct(from: number, to: number): number {
  return ((to - from) / from) * 100;
}
