import { describe, expect, it } from 'vitest';
import { artistRuns, cleanTitle } from '../rekordbox-match';
import { artistCore, sameTitle } from './spotifySearch';
import cases from './match.cases.json';

/**
 * The name-equality rules shared with the worker (round 003, research R5):
 * `worker/tests/test_match.py` reads the same file, so the Python port and
 * these rules give the same verdict on every case.
 */
describe('match.cases.json', () => {
  it.each(cases.artist)('artist $written ~ $candidate → $accept', (c) => {
    const cores = new Set(
      artistRuns(c.written)
        .map(artistCore)
        .filter((x) => x !== '')
    );
    expect(cores.has(artistCore(c.candidate))).toBe(c.accept);
  });
  it.each(cases.title)('title $written ~ $candidate → $accept', (c) => {
    const w = cleanTitle(c.written);
    expect(w !== '' && sameTitle(w, cleanTitle(c.candidate))).toBe(c.accept);
  });
});
