import { describe, expect, it } from 'vitest';
import { normalize } from '../../model/normalize';
import { parseClock, parseDescription, parseLines, parsePasted } from './parse';

/** A single-line parse: minRun 1 accepts one matching line. */
function one(line: string) {
  const { rows } = parseLines(line, 1, 'pasted');
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe('parseClock', () => {
  it('reads mm:ss, hh:mm:ss, the . separator and a fractional tail', () => {
    expect(parseClock('0:00')).toBe(0);
    expect(parseClock('11:44')).toBe(704);
    expect(parseClock('1:00:30')).toBe(3630);
    expect(parseClock('1.02.30')).toBe(3750);
    expect(parseClock('03:10:37.1910000')).toBe(11437);
  });

  it('returns null for a bare integer and for garbage', () => {
    expect(parseClock('42')).toBeNull();
    expect(parseClock('abc')).toBeNull();
    expect(parseClock('')).toBeNull();
  });
});

describe('parseLines shapes', () => {
  it('shape 1: numbered index, no time', () => {
    const r = one('1. Daft Punk - Da Funk');
    expect(r.startSec).toBeNull();
    expect(r.artist).toBe('Daft Punk');
    expect(r.title).toBe('Da Funk');
    expect(r.label).toBeNull();
  });

  it('shape 2: bare dash', () => {
    const r = one('Daft Punk - Da Funk');
    expect(r.startSec).toBeNull();
    expect(r.artist).toBe('Daft Punk');
    expect(r.title).toBe('Da Funk');
  });

  it('shape 3: side-position index, no time', () => {
    const r = one('a1. Daft Punk - Da Funk');
    expect(r.startSec).toBeNull();
    expect(r.artist).toBe('Daft Punk');
    expect(r.title).toBe('Da Funk');
  });

  it('shape 4: bracketed clock, one and two H: groups (startSec 0 kept)', () => {
    expect(one('[0:00]: Daft Punk - Da Funk').startSec).toBe(0);
    expect(one('[1:00:30] Daft Punk - Da Funk').startSec).toBe(3630);
    // two-digit hour (TrackId's HH:MM:SS form, the Four Tet comment style)
    expect(one('[01:00:30] Daft Punk - Da Funk').startSec).toBe(3630);
  });

  it('shape 5: bare offset with : and the . separator (startSec 0 kept)', () => {
    expect(one('00:00 Daft Punk - Da Funk').startSec).toBe(0);
    expect(one('1:00:30 Daft Punk - Da Funk').startSec).toBe(3630);
  });

  it('shape 6: MixesDB [minutes] and a trailing [Label]', () => {
    const r = one('[42] Eris Drew - Trance Emoji [T4T LUV NRG]');
    expect(r.startSec).toBe(2520);
    expect(r.artist).toBe('Eris Drew');
    expect(r.title).toBe('Trance Emoji');
    expect(r.label).toBe('T4T LUV NRG');
  });

  it('accepts all three dash characters', () => {
    expect(one('A - B').title).toBe('B');
    expect(one('A – B').title).toBe('B'); // en dash
    expect(one('A — B').title).toBe('B'); // em dash
  });

  it('does not split a hyphenated name lacking spaces around the dash', () => {
    const r = one('Sun-El Musician - Akanamali');
    expect(r.artist).toBe('Sun-El Musician');
    expect(r.title).toBe('Akanamali');
  });

  it('the prefix-order pair: 1.30 is a clock, 1. is an index', () => {
    expect(one('1.30 Artist - Title').startSec).toBe(90);
    expect(one('1. Artist - Title').startSec).toBeNull();
  });

  it('keeps ID / ? / unknown as verbatim values', () => {
    const r = one('[12:00] ID - ID');
    expect(r.startSec).toBe(720);
    expect(r.artist).toBe('ID');
    expect(r.title).toBe('ID');
    const q = one('? - unknown');
    expect(q.artist).toBe('?');
    expect(q.title).toBe('unknown');
  });
});

describe('parseLines run guard', () => {
  const block = (n: number) =>
    Array.from({ length: n }, (_, i) => `Artist${i} - Title${i}`).join('\n');

  it('accepts a run of 5 with minRun 5', () => {
    expect(parseLines(block(5), 5).rows).toHaveLength(5);
  });

  it('rejects a block of 4 with minRun 5 (keeps prose out)', () => {
    const text = `Some prose introducing the mix.\n${block(4)}\nThanks for listening!`;
    expect(parseLines(text, 5).rows).toHaveLength(0);
  });

  it('treats blank lines inside a run as transparent', () => {
    const text = `A0 - T0\nA1 - T1\n\nA2 - T2\nA3 - T3\nA4 - T4`;
    expect(parseLines(text, 5).rows).toHaveLength(5);
  });

  it('lets a prose line break a run', () => {
    const text = `${block(3)}\nJust some words here\nA - B\nC - D\nE - F`;
    // two runs of 3, neither reaches 5
    expect(parseLines(text, 5).rows).toHaveLength(0);
  });

  it('sets source from parseLines default and parsePasted', () => {
    expect(parseLines(block(5), 5).rows[0].source).toBe('description');
    expect(parsePasted('A - B\nC - D\nE - F').rows).toHaveLength(3);
    expect(parsePasted('A - B\nC - D\nE - F').rows[0].source).toBe('pasted');
  });
});

describe('parseLines link-out detection', () => {
  it('captures a URL token beside a tracklist mention (path form)', () => {
    const { rows, linkOut } = parseLines(
      'Full tracklist here: dkmn.tl/270-ErisDrew',
      5
    );
    expect(rows).toHaveLength(0);
    expect(linkOut).toBe('dkmn.tl/270-ErisDrew');
  });

  it('captures a bare domain after "track list"', () => {
    expect(
      parseLines('find the track list on thelotradio.com', 5).linkOut
    ).toBe('thelotradio.com');
  });

  it('keeps both a listing and a link when both are present', () => {
    const block = Array.from(
      { length: 5 },
      (_, i) => `Artist${i} - Title${i}`
    ).join('\n');
    const { rows, linkOut } = parseLines(
      `${block}\nFull tracklist here: https://example.com/mix`,
      5
    );
    expect(rows).toHaveLength(5);
    expect(linkOut).toBe('https://example.com/mix');
  });
});

describe('parseDescription', () => {
  it('decodes entities and <br> before applying the grammar', () => {
    const raw =
      '1. Foo &amp; Bar - Track One<br>2. Baz - Qux<br>3. A - B<br>4. C - D<br>5. E - F';
    const { rows } = parseDescription(raw);
    expect(rows).toHaveLength(5);
    expect(rows[0].artist).toBe('Foo & Bar');
    expect(rows[0].title).toBe('Track One');
    expect(rows[0].source).toBe('description');
  });

  it('decodes &nbsp; so an index prefix followed by it still strips (M8)', () => {
    const raw =
      '1.&nbsp;Foo - Track One<br>2. Baz - Qux<br>3. A - B<br>4. C - D<br>5. E - F';
    const { rows } = parseDescription(raw);
    expect(rows).toHaveLength(5);
    // Without the &nbsp; decode, the index prefix does not strip and the
    // artist garbles to "1.&nbsp;Foo".
    expect(rows[0].artist).toBe('Foo');
    expect(rows[0].title).toBe('Track One');
  });

  it('decodes &nbsp; inside a name to U+00A0, which normalizes like a plain space (M8)', () => {
    // ENTITIES decodes &nbsp; to the actual U+00A0 character (regex `\s`
    // matches it, so the parsing grammar above needs no other change), not
    // an ASCII space — confirm that choice does not break library matching,
    // which goes through `normalize()`, not a raw string compare.
    const raw = 'Foo&nbsp;Bar - Track One\nA - B\nC - D\nE - F\nG - H';
    const { rows } = parseDescription(raw);
    expect(rows).toHaveLength(5);
    expect(rows[0].artist).toBe('Foo\u00A0Bar');
    expect(normalize(rows[0].artist)).toBe(normalize('Foo Bar'));
  });
});
