import { describe, expect, it } from 'vitest';
import { parseLines } from './parse';
import cases from './parse.cases.json';

/**
 * One-line shapes shared with the worker (round 003, research R4):
 * `worker/tests/test_clues.py` reads the same file, so the Python port reads
 * a line the way the app does.
 */
describe('parse.cases.json', () => {
  it.each(cases)('$line', (c) => {
    const row = parseLines(c.line, 1).rows[0];
    if (c.artist === null) {
      expect(row).toBeUndefined();
      return;
    }
    expect(row).toMatchObject({
      artist: c.artist,
      title: c.title,
      label: c.label,
      startSec: c.startSec,
    });
  });
});
