import { describe, expect, it } from 'vitest';
import { normalizeMixUrl } from './url';
import cases from './url.cases.json';

/**
 * The SoundCloud trim rule shared with the worker (spec 028, research R3):
 * `worker/tests/test_links.py` reads the same file, so `links.trim_soundcloud`
 * and `normalizeMixUrl` give the same address for every link. A new case goes
 * in the file, never in one suite only.
 */
describe('url.cases.json', () => {
  it.each(cases.trim)('trim "$input" → $expected', (c) => {
    expect(normalizeMixUrl(c.input)).toBe(c.expected);
  });
});
